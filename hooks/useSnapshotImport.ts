/**
 * Snapshot Import Hook
 * 
 * Dedicated state machine for Snapshot mode imports.
 * Handles parsing, reconciliation preview, and commit.
 */

import { useState, useCallback, useMemo } from 'react';
import { ImportBatch, ENGINE_VERSION } from '../src/types';
import { db, delay } from '../src/services/db';
import {
    SnapshotFieldMappings,
    StagedSnapshotPosition,
    ReconciliationResult,
    ReconciliationDiff,
} from '../src/services/import/types';
import {
    snapshotService,
    SNAPSHOT_MAPPABLE_FIELDS,
    parseSnapshotFile,
    getExistingPositions,
    calculateReconciliation,
    generateReconciliationTransactions,
    createPositionTransactions
} from '../src/services/import/snapshotService';
import { transactionManager, computeFileHash } from '../src/services/core/transactionManager';
import i18n from '../src/i18n';

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
    generateSyntheticTransactionsOption: boolean;

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

    generateSyntheticTransactionsOption: false,

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
        updateState({ generateSyntheticTransactionsOption: value });
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

            if (state.generateSyntheticTransactionsOption) {
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
            updateState({ error: i18n.t('transactions:snapshotWizard.errors.failedToAnalyzeData'), isLoading: false });
        }
    }, [state.rawCSVText, state.mappings, state.generateSyntheticTransactionsOption, accountId, updateState]);

    // =========================================================================
    // STEP 3: PREVIEW / RECONCILIATION
    // =========================================================================

    /**
     * Update sell price for a reconciliation diff that requires user input
     * (Note: In the new model, BALANCE_ADJUSTMENT doesn't require price input,
     * but we keep this for future extensions or real SELL transactions)
     */
    const updateSellPrice = useCallback((assetKey: string, price: string) => {
        if (!state.reconciliationResult) return;

        setState(prev => {
            if (!prev.reconciliationResult) return prev;

            const newDiffs = prev.reconciliationResult.diffs.map(diff => {
                if (diff.assetKey === assetKey && diff.requiresUserInput) {
                    return {
                        ...diff,
                        syntheticPrice: price,
                        userProvidedSellPrice: price,
                        requiresUserInput: false,
                        isValid: true
                    };
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
                reconciliationResult: {
                    ...prev.reconciliationResult,
                    diffs: newDiffs,
                    stats
                }
            };
        });
    }, [state.reconciliationResult]);

    const canCommit = useMemo(() => {
        if (state.generateSyntheticTransactionsOption && state.reconciliationResult) {
            // All diffs must be valid and no inputs required
            return state.reconciliationResult.stats.requiresInput === 0 &&
                state.reconciliationResult.stats.hasErrors === 0;
        }
        // Snapshot only: just need valid positions
        return state.parseStats.valid > 0;
    }, [state.generateSyntheticTransactionsOption, state.reconciliationResult, state.parseStats]);

    // =========================================================================
    // STEP 4: COMMIT
    // =========================================================================

    const commitImport = useCallback(async () => {
        updateState({ isLoading: true, error: null });

        try {
            const batchId = `batch-snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const now = new Date().toISOString();
            const fileHash = await computeFileHash(state.rawCSVText);

            // Begin atomic transaction
            transactionManager.begin();

            let transactions;

            if (state.generateSyntheticTransactionsOption && state.reconciliationResult) {
                // Generate synthetic transactions from reconciliation
                transactions = await generateReconciliationTransactions(
                    state.reconciliationResult.diffs,
                    batchId,
                    accountId,
                    now,
                    'default-user'
                );
            } else {
                // Snapshot only: create position transactions
                const validPositions = state.parsedPositions
                    .filter(p => p.status === 'valid')
                    .map(p => p.position);

                transactions = await createPositionTransactions(
                    validPositions,
                    batchId,
                    accountId,
                    now,
                    'default-user'
                );
            }

            // Create batch record
            const batch: ImportBatch = {
                id: batchId,
                ownerId: 'default-user',
                accountId,
                importMode: 'snapshot',
                fileName: 'snapshot_import.csv',
                fileHash,
                transactionCount: transactions.length,
                skippedCount: state.parseStats.total - state.parseStats.valid,
                importedAt: now,
                importedBy: 'default-user',
                status: 'completed',
                engineVersion: ENGINE_VERSION,
                metadata: { totalRows: state.parseStats.total }
            };

            // Add to transaction context
            transactionManager.addTransactions(transactions);
            transactionManager.addBatch(batch);

            // Commit atomically
            const result = transactionManager.commit();

            if (!result.success) {
                updateState({ error: result.error || i18n.t('transactions:snapshotWizard.errors.commitFailed'), isLoading: false });
                return;
            }

            updateState({
                completedBatch: batch,
                step: 'complete',
                isLoading: false
            });
        } catch (err) {
            transactionManager.rollback();
            updateState({ error: i18n.t('transactions:snapshotWizard.errors.failedToCommitImport'), isLoading: false });
        }
    }, [
        accountId,
        state.rawCSVText,
        state.generateSyntheticTransactionsOption,
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

        // Rename for compatibility
        generateSyntheticTransactions: state.generateSyntheticTransactionsOption,

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
