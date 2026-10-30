/**
 * Snapshot Import Hook
 * 
 * Dedicated state machine for Snapshot mode imports.
 * Handles parsing, reconciliation preview, and commit.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { ImportBatch, ENGINE_VERSION, MappingTemplate } from '../types';
import { db, delay } from '../services/db';
import {
    SnapshotFieldMappings,
    StagedSnapshotPosition,
    ReconciliationResult,
    ReconciliationDiff,
} from '../services/import/types';
import {
    snapshotService,
    SNAPSHOT_MAPPABLE_FIELDS,
    parseSnapshotFile,
    getExistingPositions,
    calculateReconciliation,
    commitSnapshotImport,
    stageSnapshotInstruments,
    describeSnapshotInstruments,
    clearSnapshotInstruments
} from '../services/import/snapshotService';
import type { ImportInstrumentSummary } from '../services/import/importManager';
import {
    isStagedInstrument,
    previewStagedIssues,
    updateStagedInstrument
} from '../services/import/instrumentDrafts';
import { instrumentService } from '../services/instrumentService';
import type { InstrumentIssue, InstrumentPatch } from '../services/instrumentService';
import { computeFileHash, isFileAlreadyImported } from '../services/core/transactionManager';
import { matchSnapshotColumns } from '../services/import/columnMatcher';
import {
    getMappingTemplates,
    saveMappingTemplate,
    deleteMappingTemplate,
    renameMappingTemplate,
    findTemplateForHeaders
} from '../services/import/mappingTemplateService';
import i18n from '../i18n';

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
    mappingTemplates: MappingTemplate[];
    selectedTemplateId: string | null;
    /** Saved snapshot profile whose columns fit the file (suggested, never auto-applied) */
    suggestedTemplateId: string | null;

    // Options (after mapping)
    generateSyntheticTransactionsOption: boolean;
    /** Close assets held on the account that are absent from the file */
    closeMissingAssets: boolean;
    /** Completed batch that already contains this exact file, if any */
    existingBatch: ImportBatch | null;

    // Parsed positions
    parsedPositions: StagedSnapshotPosition[];
    parseStats: { total: number; valid: number; errors: number };

    // Reconciliation (if generating transactions)
    reconciliationResult: ReconciliationResult | null;

    /** The assets of the file (new ones are drafts until the import is confirmed) */
    instruments: ImportInstrumentSummary[];

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
    mappingTemplates: [],
    selectedTemplateId: null,
    suggestedTemplateId: null,

    generateSyntheticTransactionsOption: false,
    closeMissingAssets: true,
    existingBatch: null,

    parsedPositions: [],
    parseStats: { total: 0, valid: 0, errors: 0 },

    reconciliationResult: null,
    instruments: [],

    completedBatch: null,
};

// ============================================================================
// HOOK
// ============================================================================

export const useSnapshotImport = (
    accountId: string,
    rawCSVText: string,
    headers: string[],
    previewRows: string[][],
    userId: string = 'default-user',
    fileName: string = 'snapshot_import.csv'
) => {
    const [state, setState] = useState<SnapshotImportState>({
        ...initialState,
        rawCSVText,
        headers,
        previewRows,
        // Auto-detect mappings on init
        mappings: matchSnapshotColumns(headers)
    });

    const updateState = useCallback((updates: Partial<SnapshotImportState>) => {
        setState(prev => ({ ...prev, ...updates }));
    }, []);

    // Load snapshot profiles and suggest the one that fits this file
    useEffect(() => {
        let cancelled = false;
        getMappingTemplates({ mode: 'snapshot' }).then(templates => {
            if (cancelled) return;
            setState(prev => ({
                ...prev,
                mappingTemplates: templates,
                suggestedTemplateId: findTemplateForHeaders(templates, prev.headers)?.id ?? null
            }));
        }).catch(() => undefined);
        return () => { cancelled = true; };
    }, []);

    // =========================================================================
    // STEP 1: MAPPING
    // =========================================================================

    const applyTemplate = useCallback((templateId: string) => {
        setState(prev => {
            const template = prev.mappingTemplates.find(t => t.id === templateId);
            if (!template) return prev;
            return { ...prev, mappings: template.mappings as Partial<SnapshotFieldMappings>, selectedTemplateId: templateId };
        });
    }, []);

    const saveAsTemplate = useCallback(async (name: string) => {
        try {
            const template = await saveMappingTemplate(name, state.mappings, {
                userId,
                mode: 'snapshot',
                headers: state.headers
            });
            const templates = await getMappingTemplates({ mode: 'snapshot' });
            updateState({ mappingTemplates: templates, selectedTemplateId: template.id });
            return template;
        } catch {
            updateState({ error: i18n.t('transactions:importWizard.errors.failedToSaveTemplate') });
            return null;
        }
    }, [state.mappings, state.headers, userId, updateState]);

    const deleteTemplate = useCallback(async (templateId: string) => {
        await deleteMappingTemplate(templateId);
        const templates = await getMappingTemplates({ mode: 'snapshot' });
        setState(prev => ({
            ...prev,
            mappingTemplates: templates,
            selectedTemplateId: prev.selectedTemplateId === templateId ? null : prev.selectedTemplateId,
            suggestedTemplateId: prev.suggestedTemplateId === templateId ? null : prev.suggestedTemplateId
        }));
    }, []);

    const renameTemplate = useCallback(async (templateId: string, name: string) => {
        await renameMappingTemplate(templateId, name);
        updateState({ mappingTemplates: await getMappingTemplates({ mode: 'snapshot' }) });
    }, [updateState]);

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

    const setCloseMissingAssets = useCallback((value: boolean) => {
        updateState({ closeMissingAssets: value });
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

            // Both modes reconcile against the account so the preview shows the real
            // outcome (and snapshot-only never duplicates positions on re-import)
            const [existingPos, existingBatch] = await Promise.all([
                getExistingPositions(accountId),
                computeFileHash(state.rawCSVText).then(isFileAlreadyImported)
            ]);
            const reconciliation = await calculateReconciliation(
                validPositions.map(p => p.position),
                existingPos,
                { closeMissing: state.closeMissingAssets }
            );

            const instruments = await stageSnapshotInstruments(validPositions.map(p => p.position), accountId);

            updateState({
                parsedPositions: parseResult.positions,
                parseStats: parseResult.stats,
                reconciliationResult: reconciliation,
                instruments,
                existingBatch,
                step: 'preview',
                isLoading: false
            });
        } catch (err) {
            updateState({ error: i18n.t('transactions:snapshotWizard.errors.failedToAnalyzeData'), isLoading: false });
        }
    }, [state.rawCSVText, state.mappings, state.closeMissingAssets, accountId, updateState]);

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
        if (state.parseStats.valid === 0) return false;
        if (!state.reconciliationResult) return true;
        return state.reconciliationResult.stats.requiresInput === 0 &&
            state.reconciliationResult.stats.hasErrors === 0;
    }, [state.reconciliationResult, state.parseStats]);

    // =========================================================================
    // STEP 4: COMMIT
    // =========================================================================

    const commitImport = useCallback(async () => {
        updateState({ isLoading: true, error: null });

        try {
            const validPositions = state.parsedPositions
                .filter(p => p.status === 'valid')
                .map(p => p.position);

            const result = await commitSnapshotImport({
                mode: state.generateSyntheticTransactionsOption ? 'synthetic' : 'replace',
                positions: validPositions,
                diffs: state.reconciliationResult?.diffs,
                accountId,
                userId,
                closeMissing: state.closeMissingAssets,
                rawContent: state.rawCSVText,
                fileName,
                totalRows: state.parseStats.total
            });

            if (!result.success || !result.batch) {
                updateState({ error: result.error || i18n.t('transactions:snapshotWizard.errors.commitFailed'), isLoading: false });
                return;
            }
            const batch = result.batch;

            updateState({
                completedBatch: batch,
                step: 'complete',
                isLoading: false
            });
        } catch (err) {
            updateState({ error: i18n.t('transactions:snapshotWizard.errors.failedToCommitImport'), isLoading: false });
        }
    }, [
        accountId,
        userId,
        fileName,
        state.rawCSVText,
        state.generateSyntheticTransactionsOption,
        state.closeMissingAssets,
        state.reconciliationResult,
        state.parsedPositions,
        state.parseStats,
        updateState
    ]);

    // =========================================================================
    // NAVIGATION
    // =========================================================================

    /** Live integrity checks of an asset being edited in the review (nothing is saved). */
    const previewInstrumentIssues = useCallback((instrumentId: string, patch: InstrumentPatch): InstrumentIssue[] => {
        return isStagedInstrument(instrumentId)
            ? previewStagedIssues(instrumentId, patch)
            : instrumentService.previewInstrumentIssues(instrumentId, patch);
    }, []);

    /**
     * Edit an asset of the snapshot. A new one is a draft (persisted when the import is confirmed); one
     * already in the portfolio is updated right away. Throws an InstrumentValidationError when refused.
     */
    const updateInstrument = useCallback(async (instrumentId: string, patch: InstrumentPatch, mergeInto?: string): Promise<void> => {
        if (isStagedInstrument(instrumentId)) updateStagedInstrument(instrumentId, patch, mergeInto);
        else await instrumentService.updateInstrument(instrumentId, patch, { mergeInto });
        setState(prev => ({
            ...prev,
            instruments: describeSnapshotInstruments(prev.parsedPositions.filter(p => p.status === 'valid').map(p => p.position))
        }));
    }, []);

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
        clearSnapshotInstruments();
        setState({
            ...initialState,
            rawCSVText: state.rawCSVText,
            headers: state.headers,
            previewRows: state.previewRows,
            mappings: matchSnapshotColumns(state.headers)
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
        setCloseMissingAssets,
        applyTemplate,
        saveAsTemplate,
        deleteTemplate,
        renameTemplate,
        analyzeAndPreview,
        updateSellPrice,
        updateInstrument,
        previewInstrumentIssues,
        commitImport,
        goBack,
        reset
    };
};

export { SNAPSHOT_MAPPABLE_FIELDS };
