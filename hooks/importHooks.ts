/**
 * Import Wizard Hook
 * 
 * State machine for the Universal Financial Import Wizard.
 * Manages the 5-step import flow: Context → Upload → Mapping → Staging → Complete
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
    Institute,
    Account,
    ImportMode,
    MappingTemplate,
    ImportBatch
} from '../src/types';
import {
    importService,
    StagedTransaction,
    FieldMappings,
    ParseResult,
    parseCSVText
} from '../src/services/importService';
import { instituteService, accountService } from '../src/services/instituteService';
import { readAndParseCsvFile } from '../src/services/import/csvWorkerClient';
import { matchHistoryColumns } from '../src/services/import/columnMatcher';
import { findTemplateForHeaders } from '../src/services/import/mappingTemplateService';
import type { DateFormatHint } from '../src/services/import/typeNormalizer';
import type { CsvEncoding } from '../src/services/import/types';
import type { CostBasisMethod } from '../src/types/types.backend';
import { computeFileHash, isFileAlreadyImported } from '../src/services/core/transactionManager';
import i18n from '../src/i18n';

// ============================================================================
// TYPES
// ============================================================================

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export interface ImportWizardState {
    // Navigation
    step: WizardStep;
    isLoading: boolean;
    error: string | null;

    // Step 1: Context Selection
    institutes: Institute[];
    accounts: Account[];
    selectedInstituteId: string | null;
    selectedAccountId: string | null;
    importMode: ImportMode;
    conflict: 'NONE' | 'WARNING' | 'CRITICAL';

    // Step 2: File Upload
    file: File | null;
    rawCSVText: string;
    /** Encoding detected when reading the file */
    fileEncoding: CsvEncoding | null;
    /** Delimiter in use (auto-detected or forced by the user) */
    delimiter: string;
    /** Day/month ordering: 'auto' lets the engine infer it from the column */
    dateFormat: DateFormatHint | 'auto';
    /** Completed batch that already contains this exact file, if any */
    existingBatch: ImportBatch | null;

    // Step 3: Mapping
    headers: string[];
    previewRows: string[][];
    mappings: Partial<FieldMappings>;
    mappingTemplates: MappingTemplate[];
    selectedTemplateId: string | null;
    /** Saved profile whose columns fit the uploaded file (suggested, never auto-applied) */
    suggestedTemplateId: string | null;
    detectedPreset: string | null;

    // Step 4: Staging Area
    stagedTransactions: StagedTransaction[];
    stats: ParseResult['stats'];
    editingRowId: string | null;

    // Step 5: Complete
    completedBatch: ImportBatch | null;
}

// List of mappable fields for UI
export const MAPPABLE_FIELDS = [
    { key: 'transactionDate', labelKey: 'importWizard.fields.transactionDate', required: true },
    { key: 'amountPrimary', labelKey: 'importWizard.fields.amountPrimary', required: true },
    { key: 'assetSymbol', labelKey: 'importWizard.fields.assetSymbol', required: false },
    { key: 'type', labelKey: 'importWizard.fields.type', required: false },
    { key: 'rawLabel', labelKey: 'importWizard.fields.rawLabel', required: false },
    { key: 'priceUnit', labelKey: 'importWizard.fields.priceUnit', required: false },
    { key: 'quantity', labelKey: 'importWizard.fields.quantity', required: false },
    { key: 'assetIsin', labelKey: 'importWizard.fields.assetIsin', required: false },
    { key: 'feeAmount', labelKey: 'importWizard.fields.feeAmount', required: false },
    { key: 'feeAsset', labelKey: 'importWizard.fields.feeAsset', required: false },
    { key: 'taxAmount', labelKey: 'importWizard.fields.taxAmount', required: false },
] as const;

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: ImportWizardState = {
    step: 1,
    isLoading: false,
    error: null,

    institutes: [],
    accounts: [],
    selectedInstituteId: null,
    selectedAccountId: null,
    importMode: 'history',
    conflict: 'NONE',

    file: null,
    rawCSVText: '',
    fileEncoding: null,
    delimiter: ',',
    dateFormat: 'auto',
    existingBatch: null,

    headers: [],
    previewRows: [],
    mappings: {},
    mappingTemplates: [],
    selectedTemplateId: null,
    suggestedTemplateId: null,
    detectedPreset: null,

    stagedTransactions: [],
    stats: { total: 0, valid: 0, errors: 0, duplicates: 0, warnings: 0 },
    editingRowId: null,

    completedBatch: null,
};

// ============================================================================
// HOOK
// ============================================================================

export const useImportWizard = (userId: string = 'default-user') => {
    const [state, setState] = useState<ImportWizardState>(initialState);

    // Helpers for partial state updates
    const updateState = useCallback((updates: Partial<ImportWizardState>) => {
        setState(prev => ({ ...prev, ...updates }));
    }, []);

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    // Load institutes on mount
    useEffect(() => {
        const loadInitialData = async () => {
            updateState({ isLoading: true });
            try {
                const [institutes, templates] = await Promise.all([
                    instituteService.getInstitutes(),
                    importService.getMappingTemplates({ mode: 'history' })
                ]);
                updateState({
                    institutes,
                    mappingTemplates: templates,
                    isLoading: false
                });
            } catch (err) {
                updateState({ error: i18n.t('transactions:importWizard.errors.failedToLoadData'), isLoading: false });
            }
        };
        loadInitialData();
    }, [updateState]);

    // Load accounts when institute changes
    useEffect(() => {
        const loadAccounts = async () => {
            if (!state.selectedInstituteId) {
                updateState({ accounts: [], selectedAccountId: null });
                return;
            }
            try {
                const accounts = await accountService.getAccountsByInstitute(state.selectedInstituteId);
                updateState({ accounts, selectedAccountId: null });
            } catch (err) {
                updateState({ error: i18n.t('transactions:importWizard.errors.failedToLoadAccounts') });
            }
        };
        loadAccounts();
    }, [state.selectedInstituteId, updateState]);

    // Check for mode conflict when account or mode changes
    useEffect(() => {
        const checkConflict = async () => {
            if (!state.selectedAccountId) {
                updateState({ conflict: 'NONE' });
                return;
            }
            // Use local import to avoid circular dependency or ensuring snapshotService is loaded
            const { snapshotService } = await import('../src/services/import/snapshotService');
            const conflict = await snapshotService.detectSourceModeConflict(state.selectedAccountId, state.importMode);
            updateState({ conflict });
        };
        checkConflict();
    }, [state.selectedAccountId, state.importMode, updateState]);

    // =========================================================================
    // STEP 1: CONTEXT SELECTION
    // =========================================================================

    const selectInstitute = useCallback((instituteId: string | null) => {
        updateState({ selectedInstituteId: instituteId, selectedAccountId: null });
    }, [updateState]);

    const selectAccount = useCallback((accountId: string | null) => {
        updateState({ selectedAccountId: accountId });
    }, [updateState]);

    const setImportMode = useCallback((mode: ImportMode) => {
        updateState({ importMode: mode });
    }, [updateState]);

    const setCostBasisMethod = useCallback(async (method: CostBasisMethod) => {
        if (!state.selectedAccountId || !state.selectedInstituteId) return;
        await accountService.setCostBasisMethod(state.selectedAccountId, method);
        updateState({ accounts: await accountService.getAccountsByInstitute(state.selectedInstituteId) });
    }, [state.selectedAccountId, state.selectedInstituteId, updateState]);

    const createInstitute = useCallback(async (name: string, type: Institute['type'], country: string = 'FR') => {
        updateState({ isLoading: true });
        try {
            const newInstitute = await instituteService.createInstitute({ name, type, country });
            const institutes = await instituteService.getInstitutes();
            updateState({
                institutes,
                selectedInstituteId: newInstitute.id,
                isLoading: false
            });
            return newInstitute;
        } catch (err) {
            updateState({ error: i18n.t('transactions:importWizard.errors.failedToCreateInstitute'), isLoading: false });
            return null;
        }
    }, [updateState]);

    const createAccount = useCallback(async (name: string, type: Account['type'], currency: string, wrapperType?: Account['wrapperType']) => {
        if (!state.selectedInstituteId) return null;

        updateState({ isLoading: true });
        try {
            const newAccount = await accountService.createAccount({
                instituteId: state.selectedInstituteId,
                name,
                type,
                defaultCurrency: currency,
                wrapperType
            });
            const accounts = await accountService.getAccountsByInstitute(state.selectedInstituteId);
            updateState({
                accounts,
                selectedAccountId: newAccount.id,
                isLoading: false
            });
            return newAccount;
        } catch (err) {
            updateState({ error: i18n.t('transactions:importWizard.errors.failedToCreateAccount'), isLoading: false });
            return null;
        }
    }, [state.selectedInstituteId, updateState]);

    // =========================================================================
    // STEP 2: FILE UPLOAD
    // =========================================================================

    const handleFileUpload = useCallback(async (file: File) => {
        updateState({ isLoading: true, file });

        try {
            const { text, encoding, parsed } = await readAndParseCsvFile(file);
            const { headers, rows, delimiter } = parsed;
            const existingBatch = await isFileAlreadyImported(await computeFileHash(text));

            // Try to detect preset
            const detected = importService.detectPreset(headers);

            // Auto-apply detected preset mappings
            let mappings: Partial<FieldMappings> = {};
            let detectedPreset: string | null = null;

            if (detected) {
                mappings = detected.mappings as Partial<FieldMappings>;
                detectedPreset = detected.presetName;
            } else {
                // Try auto-mapping based on header names
                mappings = matchHistoryColumns(headers);
            }

            updateState({
                rawCSVText: text,
                suggestedTemplateId: findTemplateForHeaders(state.mappingTemplates, headers)?.id ?? null,
                selectedTemplateId: null,
                fileEncoding: encoding,
                delimiter,
                existingBatch,
                headers,
                previewRows: rows.slice(0, 5), // Show first 5 rows
                mappings,
                detectedPreset,
                isLoading: false,
                step: 3 // Move to mapping step
            });
        } catch (err) {
            updateState({ error: i18n.t('transactions:importWizard.errors.failedToParseFile'), isLoading: false });
        }
    }, [state.mappingTemplates, updateState]);

    // =========================================================================
    // STEP 3: MAPPING
    // =========================================================================

    const setMapping = useCallback((field: keyof FieldMappings, headerOrIndex: string | number | undefined) => {
        setState(prev => ({
            ...prev,
            mappings: {
                ...prev.mappings,
                [field]: headerOrIndex
            }
        }));
    }, []);

    /**
     * Force a delimiter and re-parse the file (mappings are re-detected because
     * header names change when the split changes).
     */
    const setDelimiter = useCallback((delimiter: string) => {
        setState(prev => {
            if (!prev.rawCSVText) return { ...prev, delimiter };
            const { headers, rows } = parseCSVText(prev.rawCSVText, delimiter);
            const detected = importService.detectPreset(headers);
            return {
                ...prev,
                delimiter,
                headers,
                previewRows: rows.slice(0, 5),
                mappings: detected ? detected.mappings as Partial<FieldMappings> : matchHistoryColumns(headers),
                detectedPreset: detected ? detected.presetName : null,
                selectedTemplateId: null
            };
        });
    }, []);

    const setDateFormat = useCallback((dateFormat: DateFormatHint | 'auto') => {
        updateState({ dateFormat });
    }, [updateState]);

    const applyTemplate = useCallback((templateId: string) => {
        setState(prev => {
            const template = prev.mappingTemplates.find(t => t.id === templateId);
            if (!template) return prev;
            // A profile restores its delimiter (re-split the file) and its date format
            const delimiter = template.delimiter || prev.delimiter;
            const reparsed = prev.rawCSVText && delimiter !== prev.delimiter
                ? parseCSVText(prev.rawCSVText, delimiter)
                : null;
            const dateFormat = template.dateFormat === 'DD/MM/YYYY' || template.dateFormat === 'MM/DD/YYYY'
                ? template.dateFormat
                : 'auto';
            return {
                ...prev,
                mappings: template.mappings as Partial<FieldMappings>,
                selectedTemplateId: templateId,
                delimiter,
                dateFormat,
                ...(reparsed ? { headers: reparsed.headers, previewRows: reparsed.rows.slice(0, 5) } : {})
            };
        });
    }, []);

    const saveAsTemplate = useCallback(async (name: string) => {
        if (!isValidMappingForAnalysis) return null;

        try {
            const template = await importService.saveMappingTemplate(name, state.mappings, {
                userId,
                instituteId: state.selectedInstituteId || undefined,
                dateFormat: state.dateFormat === 'auto' ? undefined : state.dateFormat,
                delimiter: state.delimiter,
                mode: 'history',
                headers: state.headers
            });
            const templates = await importService.getMappingTemplates({ mode: 'history' });
            updateState({ mappingTemplates: templates, selectedTemplateId: template.id });
            return template;
        } catch (err) {
            updateState({ error: i18n.t('transactions:importWizard.errors.failedToSaveTemplate') });
            return null;
        }
    }, [state.mappings, state.selectedInstituteId, state.dateFormat, state.delimiter, state.headers, userId, updateState]);

    const deleteTemplate = useCallback(async (templateId: string) => {
        await importService.deleteMappingTemplate(templateId);
        const templates = await importService.getMappingTemplates({ mode: 'history' });
        setState(prev => ({
            ...prev,
            mappingTemplates: templates,
            selectedTemplateId: prev.selectedTemplateId === templateId ? null : prev.selectedTemplateId,
            suggestedTemplateId: prev.suggestedTemplateId === templateId ? null : prev.suggestedTemplateId
        }));
    }, []);

    const renameTemplate = useCallback(async (templateId: string, name: string) => {
        await importService.renameMappingTemplate(templateId, name);
        updateState({ mappingTemplates: await importService.getMappingTemplates({ mode: 'history' }) });
    }, [updateState]);

    const analyzeData = useCallback(async () => {
        if (!state.selectedAccountId) {
            updateState({ error: i18n.t('transactions:importWizard.errors.selectAccountFirst') });
            return;
        }

        updateState({ isLoading: true, error: null });

        try {
            const result = await importService.parseFile(state.rawCSVText, {
                accountId: state.selectedAccountId,
                mode: state.importMode,
                customMappings: state.mappings as FieldMappings,
                delimiter: state.delimiter,
                dateFormat: state.dateFormat === 'auto' ? undefined : state.dateFormat,
                userId
            });

            updateState({
                stagedTransactions: result.candidates,
                stats: result.stats,
                isLoading: false,
                step: 4
            });
        } catch (err) {
            updateState({ error: i18n.t('transactions:importWizard.errors.failedToAnalyzeData'), isLoading: false });
        }
    }, [state.selectedAccountId, state.rawCSVText, state.importMode, state.mappings, state.delimiter, state.dateFormat, userId, updateState]);

    // =========================================================================
    // STEP 4: STAGING AREA
    // =========================================================================

    const setRowResolution = useCallback((rowId: string, resolution: StagedTransaction['resolution']) => {
        setState(prev => ({
            ...prev,
            stagedTransactions: prev.stagedTransactions.map(t =>
                t.id === rowId ? { ...t, resolution } : t
            )
        }));
    }, []);

    const bulkSetResolution = useCallback((status: StagedTransaction['status'], resolution: StagedTransaction['resolution']) => {
        setState(prev => ({
            ...prev,
            stagedTransactions: prev.stagedTransactions.map(t =>
                t.status === status ? { ...t, resolution } : t
            )
        }));
    }, []);

    const removeRow = useCallback((rowId: string) => {
        setState(prev => {
            const filtered = prev.stagedTransactions.filter(t => t.id !== rowId);
            return {
                ...prev,
                stagedTransactions: filtered,
                stats: {
                    total: filtered.length,
                    valid: filtered.filter(c => c.status === 'valid').length,
                    errors: filtered.filter(c => c.status === 'error').length,
                    duplicates: filtered.filter(c => c.status === 'duplicate').length,
                    warnings: filtered.filter(c => c.status === 'warning').length
                }
            };
        });
    }, []);

    const startEditRow = useCallback((rowId: string) => {
        updateState({ editingRowId: rowId });
    }, [updateState]);

    const cancelEditRow = useCallback(() => {
        updateState({ editingRowId: null });
    }, [updateState]);

    const updateRowField = useCallback((rowId: string, field: string, value: string) => {
        setState(prev => ({
            ...prev,
            stagedTransactions: prev.stagedTransactions.map(t => {
                if (t.id !== rowId) return t;

                // Update the parsed field
                const updated = {
                    ...t,
                    parsed: {
                        ...t.parsed,
                        [field]: value
                    }
                };

                // Re-validate
                const errors = [];
                if (!updated.parsed.transactionDate) {
                    errors.push({ field: 'transactionDate', message: i18n.t('transactions:importWizard.validation.dateRequired'), severity: 'error' as const });
                }
                if (!updated.parsed.amountPrimary) {
                    errors.push({ field: 'amountPrimary', message: i18n.t('transactions:importWizard.validation.amountRequired'), severity: 'error' as const });
                }
                if (!updated.parsed.assetSymbol && !updated.parsed.assetIsin) {
                    errors.push({ field: 'assetSymbol', message: i18n.t('transactions:importWizard.validation.identifierRequired'), severity: 'error' as const });
                }

                const hasErrors = errors.some(e => e.severity === 'error');

                return {
                    ...updated,
                    errors,
                    status: hasErrors ? 'error' : 'valid',
                    resolution: hasErrors ? 'skip' : t.resolution === 'skip' ? 'pending' : t.resolution
                } as StagedTransaction;
            })
        }));
    }, []);

    const downloadInvalidRows = useCallback(() => {
        // Generate CSV for invalid rows only
        const invalidRows = state.stagedTransactions.filter(t => t.status === 'error');
        if (invalidRows.length === 0) return;

        const csvRows = [state.headers.join(',')];
        invalidRows.forEach(row => {
            const sanitizedRow = row.originalRowArray.map(v => {
                let val = v;
                // Security: Mitigate CSV Formula Injection (OWASP) by escaping formula trigger characters
                if (typeof val === 'string' && /^[=+\-@\t\r]/.test(val)) {
                    val = `'${val}`;
                }
                return `"${val.replace(/"/g, '""')}"`;
            });
            csvRows.push(sanitizedRow.join(','));
        });
        const csv = csvRows.join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invalid_rows_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [state.stagedTransactions, state.headers]);

    // =========================================================================
    // STEP 5: FINALIZATION
    // =========================================================================

    const finalizeImport = useCallback(async () => {
        if (!state.selectedAccountId || !state.file) {
            updateState({ error: i18n.t('transactions:importWizard.errors.missingAccountOrFile') });
            return;
        }

        updateState({ isLoading: true, error: null });

        try {
            // Set all pending valid/warning rows to import
            const toCommit = state.stagedTransactions.map(t => ({
                ...t,
                resolution: t.resolution === 'pending' && (t.status === 'valid' || t.status === 'warning')
                    ? 'import' as const
                    : t.resolution
            }));

            // Same hash function as parseFile, so file-level idempotence works across both paths
            const fileHash = await computeFileHash(state.rawCSVText);

            const result = await importService.commitBatch(
                toCommit,
                state.selectedAccountId,
                state.importMode,
                state.file.name,
                fileHash,
                userId,
                undefined,
                state.delimiter
            );

            if (!result.success) {
                updateState({ error: result.error || i18n.t('transactions:importWizard.errors.importFailed'), isLoading: false });
                return;
            }

            updateState({
                completedBatch: result.batch || null,
                isLoading: false,
                step: 5
            });
        } catch (err) {
            updateState({ error: i18n.t('transactions:importWizard.errors.failedToCompleteImport'), isLoading: false });
        }
    }, [state.selectedAccountId, state.file, state.rawCSVText, state.stagedTransactions, state.importMode, state.delimiter, userId, updateState]);

    // =========================================================================
    // NAVIGATION
    // =========================================================================

    const goToStep = useCallback((step: WizardStep) => {
        updateState({ step, error: null });
    }, [updateState]);

    const goBack = useCallback(() => {
        setState(prev => ({
            ...prev,
            step: Math.max(1, prev.step - 1) as WizardStep,
            error: null
        }));
    }, []);

    const reset = useCallback(() => {
        setState(prev => ({
            ...initialState,
            institutes: prev.institutes,
            mappingTemplates: prev.mappingTemplates
        }));
    }, []);

    // =========================================================================
    // COMPUTED VALUES
    // =========================================================================

    const selectedInstitute = useMemo(() =>
        state.institutes.find(i => i.id === state.selectedInstituteId),
        [state.institutes, state.selectedInstituteId]
    );

    const selectedAccount = useMemo(() =>
        state.accounts.find(a => a.id === state.selectedAccountId),
        [state.accounts, state.selectedAccountId]
    );

    const isValidMappingForAnalysis = useMemo(() => {
        const m = state.mappings;
        const hasIdentifier = !!(m.assetSymbol || m.assetIsin);
        // Amount can be derived from quantity × unit price when the file has no amount column
        const hasAmount = !!(m.amountPrimary || (m.quantity && m.priceUnit));
        return !!(m.transactionDate && hasAmount && hasIdentifier);
    }, [state.mappings]);

    const canProceedFromStep1 = useMemo(() =>
        !!state.selectedInstituteId && !!state.selectedAccountId,
        [state.selectedInstituteId, state.selectedAccountId]
    );

    const importableTxCount = useMemo(() => {
        return state.stagedTransactions.filter(t =>
            t.resolution === 'import' ||
            (t.resolution === 'pending' && (t.status === 'valid' || t.status === 'warning'))
        ).length;
    }, [state.stagedTransactions]);

    // =========================================================================
    // RETURN
    // =========================================================================

    return {
        // State
        ...state,

        // Computed
        selectedInstitute,
        selectedAccount,
        isValidMappingForAnalysis,
        canProceedFromStep1,
        importableTxCount,

        // Step 1 Actions
        selectInstitute,
        selectAccount,
        setImportMode,
        setCostBasisMethod,
        createInstitute,
        createAccount,

        // Step 2 Actions
        handleFileUpload,

        // Step 3 Actions
        setMapping,
        setDelimiter,
        setDateFormat,
        applyTemplate,
        saveAsTemplate,
        deleteTemplate,
        renameTemplate,
        analyzeData,

        // Step 4 Actions
        setRowResolution,
        bulkSetResolution,
        removeRow,
        startEditRow,
        cancelEditRow,
        updateRowField,
        downloadInvalidRows,

        // Step 5 Actions
        finalizeImport,

        // Navigation
        goToStep,
        goBack,
        reset
    };
};

export default useImportWizard;
