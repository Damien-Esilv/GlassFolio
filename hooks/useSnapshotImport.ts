/**
 * Snapshot Import Hook
 * 
 * Dedicated state machine for Snapshot mode imports.
 * Handles parsing, reconciliation preview, and commit.
 */

import { useState, useCallback, useMemo } from 'react';
import { ImportBatch } from '../src/types';
import { db, delay } from '../src/services/db';
import {
    SnapshotFieldMappings,
    SnapshotPosition,
    StagedSnapshotPosition,
    SnapshotParseResult,
    ReconciliationDiff,
    ReconciliationResult,
} from '../src/services/import/types';
import {
    snapshotService,
    SNAPSHOT_MAPPABLE_FIELDS,
    parseSnapshotFile,
    getExistingPositions,
    calculateReconciliation,
    updateDiffSellPrice,
    generateSyntheticTransactions,
    createPositionTransactions
} from '../src/services/import/snapshotService';
import { parseCSVText } from '../src/services/import/csvParser';

// ============================================================================
// TYPES
// ============================================================================

export type SnapshotStep = 'mapping' | 'options' | 'preview' | 'complete';

export interface SnapshotImportState {
    // Current step
    step: SnapshotStep;
    isLoading: boolean;
    error: string | null;

    // CSV Data
    rawCSVText: string;
    headers: string[];
    previewRows: string[][];

    // Mappings
    mappings: Partial<SnapshotFieldMappings>;

    // Options (after mapping)
    generateSyntheticTransactions: boolean;

    // Parsed positions
    parsedPositions: StagedSnapshotPosition[];
    parseStats: { total: number; valid: number; errors: number };

    // Reconciliation (if generating transactions)
    reconciliationResult: ReconciliationResult | null;

    // Final batch
    completedBatch: ImportBatch | null;
}

const initialState: SnapshotImportState = {
    step: 'mapping',
    isLoading: false,
    error: null,

    rawCSVText: '',
    headers: [],
    previewRows: [],

    mappings: {},

    generateSyntheticTransactions: false,

    parsedPositions: [],
    parseStats: { total: 0, valid: 0, errors: 0 },

    reconciliationResult: null,

    completedBatch: null,
};

// ============================================================================
// HOOK
// ============================================================================

export const useSnapshotImport = (accountId: string, rawCSVText: string, headers: string[], previewRows: string[][]) => {
    const [state, setState] = useState<SnapshotImportState>({
        ...initialState,
        rawCSVText,
        headers,
        previewRows,
        // Auto-detect mappings on init
        mappings: autoDetectSnapshotMappings(headers)
    });

    const updateState = useCallback((updates: Partial<SnapshotImportState>) => {
        setState(prev => ({ ...prev, ...updates }));
    }, []);

    // =========================================================================
    // STEP 1: MAPPING
    // =========================================================================

    const setMapping = useCallback((field: keyof SnapshotFieldMappings, value: string | number | undefined) => {
        setState(prev => ({
            ...prev,
            mappings: { ...prev.mappings, [field]: value }
        }));
    }, []);

    const isValidMapping = useMemo(() => {
        const m = state.mappings;
        // Need at least one identifier and both qty + price
        const hasIdentifier = m.assetSymbol || m.assetIsin;
        const hasQtyAndPrice = m.quantity && m.avgPrice;
        return hasIdentifier && hasQtyAndPrice;
    }, [state.mappings]);

    const proceedToOptions = useCallback(() => {
        if (isValidMapping) {
            updateState({ step: 'options', error: null });
        }
    }, [isValidMapping, updateState]);

    // =========================================================================
    // STEP 2: OPTIONS
    // =========================================================================

    const setGenerateSyntheticTransactions = useCallback((value: boolean) => {
        updateState({ generateSyntheticTransactions: value });
    }, [updateState]);

    const analyzeAndPreview = useCallback(async () => {
        updateState({ isLoading: true, error: null });

        try {
            // Parse snapshot file
            const parseResult = await parseSnapshotFile(
                state.rawCSVText,
                state.mappings as SnapshotFieldMappings
            );

            const validPositions = parseResult.positions.filter(p => p.status === 'valid');

            if (state.generateSyntheticTransactions) {
                // Get existing positions and calculate reconciliation
                const existingPos = await getExistingPositions(accountId);
                const reconciliation = await calculateReconciliation(
                    validPositions.map(p => p.position),
                    existingPos
                );

                updateState({
                    parsedPositions: parseResult.positions,
                    parseStats: parseResult.stats,
                    reconciliationResult: reconciliation,
                    step: 'preview',
                    isLoading: false
                });
            } else {
                // Snapshot only mode - just show positions
                updateState({
                    parsedPositions: parseResult.positions,
                    parseStats: parseResult.stats,
                    reconciliationResult: null,
                    step: 'preview',
                    isLoading: false
                });
            }
        } catch (err) {
            updateState({ error: 'Failed to analyze data', isLoading: false });
        }
    }, [state.rawCSVText, state.mappings, state.generateSyntheticTransactions, accountId, updateState]);

    // =========================================================================
    // STEP 3: PREVIEW / RECONCILIATION
    // =========================================================================

    const updateSellPrice = useCallback((assetKey: string, price: string) => {
        if (!state.reconciliationResult) return;

        setState(prev => {
            if (!prev.reconciliationResult) return prev;

            const newDiffs = prev.reconciliationResult.diffs.map(diff => {
                if (diff.assetKey === assetKey && diff.syntheticType === 'SELL') {
                    return updateDiffSellPrice(diff, price);
                }
                return diff;
            });

            // Recalculate stats
            const stats = {
                ...prev.reconciliationResult.stats,
                requiresInput: newDiffs.filter(d => d.requiresUserInput).length,
                hasErrors: newDiffs.filter(d => !d.isValid).length
            };

            return {
                ...prev,
                reconciliationResult: { diffs: newDiffs, stats }
            };
        });
    }, [state.reconciliationResult]);

    const canCommit = useMemo(() => {
        if (state.generateSyntheticTransactions && state.reconciliationResult) {
            // All diffs must be valid and no inputs required
            return state.reconciliationResult.stats.requiresInput === 0 &&
                state.reconciliationResult.stats.hasErrors === 0;
        }
        // Snapshot only: just need valid positions
        return state.parseStats.valid > 0;
    }, [state.generateSyntheticTransactions, state.reconciliationResult, state.parseStats]);

    // =========================================================================
    // STEP 4: COMMIT
    // =========================================================================

    const commitImport = useCallback(async () => {
        updateState({ isLoading: true, error: null });

        try {
            const batchId = `batch-snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const now = new Date().toISOString();

            let transactions;

            if (state.generateSyntheticTransactions && state.reconciliationResult) {
                // Generate synthetic transactions from reconciliation
                transactions = generateSyntheticTransactions(
                    state.reconciliationResult.diffs,
                    batchId,
                    accountId,
                    now
                );
            } else {
                // Snapshot only: create position transactions
                const validPositions = state.parsedPositions
                    .filter(p => p.status === 'valid')
                    .map(p => p.position);

                transactions = createPositionTransactions(validPositions, batchId, accountId, now);
            }

            // Save transactions to DB
            if (transactions.length > 0) {
                const existing = db.getUnifiedTransactions();
                db.saveUnifiedTransactions([...transactions, ...existing]);
            }

            // Create batch record
            const batch: ImportBatch = {
                id: batchId,
                accountId,
                importMode: 'snapshot',
                fileName: 'snapshot_import.csv',
                transactionCount: transactions.length,
                importedAt: now,
                status: 'completed',
                metadata: {
                    generateSyntheticTransactions: state.generateSyntheticTransactions,
                    totalPositions: state.parseStats.total,
                    validPositions: state.parseStats.valid
                }
            };

            const batches = db.getImportBatches();
            db.saveImportBatches([batch, ...batches]);

            updateState({
                completedBatch: batch,
                step: 'complete',
                isLoading: false
            });
        } catch (err) {
            updateState({ error: 'Failed to commit import', isLoading: false });
        }
    }, [
        accountId,
        state.generateSyntheticTransactions,
        state.reconciliationResult,
        state.parsedPositions,
        state.parseStats,
        updateState
    ]);

    // =========================================================================
    // NAVIGATION
    // =========================================================================

    const goBack = useCallback(() => {
        setState(prev => {
            switch (prev.step) {
                case 'options': return { ...prev, step: 'mapping' as SnapshotStep };
                case 'preview': return { ...prev, step: 'options' as SnapshotStep };
                default: return prev;
            }
        });
    }, []);

    const reset = useCallback(() => {
        setState({
            ...initialState,
            rawCSVText: state.rawCSVText,
            headers: state.headers,
            previewRows: state.previewRows,
            mappings: autoDetectSnapshotMappings(state.headers)
        });
    }, [state.rawCSVText, state.headers, state.previewRows]);

    // =========================================================================
    // RETURN
    // =========================================================================

    return {
        // State
        ...state,

        // Computed
        isValidMapping,
        canCommit,
        SNAPSHOT_MAPPABLE_FIELDS,

        // Actions
        setMapping,
        proceedToOptions,
        setGenerateSyntheticTransactions,
        analyzeAndPreview,
        updateSellPrice,
        commitImport,
        goBack,
        reset
    };
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Auto-detect snapshot mappings from headers
 */
function autoDetectSnapshotMappings(headers: string[]): Partial<SnapshotFieldMappings> {
    const mappings: Partial<SnapshotFieldMappings> = {};
    const lowerHeaders = headers.map(h => h.toLowerCase());

    // Symbol
    const symbolPatterns = ['symbol', 'ticker', 'asset', 'coin'];
    const symbolIdx = lowerHeaders.findIndex(h => symbolPatterns.some(p => h.includes(p)));
    if (symbolIdx >= 0) mappings.assetSymbol = headers[symbolIdx];

    // ISIN
    const isinIdx = lowerHeaders.findIndex(h => h.includes('isin'));
    if (isinIdx >= 0) mappings.assetIsin = headers[isinIdx];

    // Name
    const namePatterns = ['name', 'titre', 'libellé', 'label'];
    const nameIdx = lowerHeaders.findIndex(h => namePatterns.some(p => h.includes(p)));
    if (nameIdx >= 0) mappings.assetName = headers[nameIdx];

    // Quantity
    const qtyPatterns = ['quantity', 'qty', 'quantité', 'nombre', 'shares', 'units'];
    const qtyIdx = lowerHeaders.findIndex(h => qtyPatterns.some(p => h.includes(p)));
    if (qtyIdx >= 0) mappings.quantity = headers[qtyIdx];

    // Average Price
    const pricePatterns = ['avg', 'average', 'prix', 'price', 'pru', 'cost'];
    const priceIdx = lowerHeaders.findIndex(h => pricePatterns.some(p => h.includes(p)));
    if (priceIdx >= 0) mappings.avgPrice = headers[priceIdx];

    // Date
    const datePatterns = ['date', 'purchase', 'achat'];
    const dateIdx = lowerHeaders.findIndex(h => datePatterns.some(p => h.includes(p)));
    if (dateIdx >= 0) mappings.purchaseDate = headers[dateIdx];

    return mappings;
}

export { SNAPSHOT_MAPPABLE_FIELDS };
