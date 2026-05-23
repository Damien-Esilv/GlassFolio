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

    // Step 3: Mapping
    headers: string[];
    previewRows: string[][];
    mappings: Partial<FieldMappings>;
    mappingTemplates: MappingTemplate[];
    selectedTemplateId: string | null;
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
    { key: 'transactionDate', label: 'Transaction Date', required: true },
    { key: 'amountPrimary', label: 'Amount', required: true },
    { key: 'assetSymbol', label: 'Asset Symbol', required: true },
    { key: 'type', label: 'Transaction Type', required: false },
    { key: 'rawLabel', label: 'Description / Label', required: false },
    { key: 'priceUnit', label: 'Price per Unit', required: false },
    { key: 'quantity', label: 'Quantity', required: false },
    { key: 'assetIsin', label: 'ISIN Code', required: false },
    { key: 'feeAmount', label: 'Fee Amount', required: false },
    { key: 'feeAsset', label: 'Fee Currency', required: false },
    { key: 'taxAmount', label: 'Tax Amount', required: false },
    { key: 'valueDate', label: 'Value Date', required: false },
    { key: 'balanceAfter', label: 'Balance After', required: false },
    { key: 'externalId', label: 'External ID (for dedup)', required: false },
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

    headers: [],
    previewRows: [],
    mappings: {},
    mappingTemplates: [],
    selectedTemplateId: null,
    detectedPreset: null,

    stagedTransactions: [],
    stats: { total: 0, valid: 0, errors: 0, duplicates: 0, warnings: 0 },
    editingRowId: null,

    completedBatch: null,
};

// ============================================================================
// HOOK
// ============================================================================

export const useImportWizard = () => {
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
                    importService.getMappingTemplates()
                ]);
                updateState({
                    institutes,
                    mappingTemplates: templates,
                    isLoading: false
                });
            } catch (err) {
                updateState({ error: 'Failed to load data', isLoading: false });
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
                updateState({ error: 'Failed to load accounts' });
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

    const createInstitute = useCallback(async (name: string, type: Institute['type']) => {
        updateState({ isLoading: true });
        try {
            const newInstitute = await instituteService.createInstitute({ name, type });
            const institutes = await instituteService.getInstitutes();
            updateState({
                institutes,
                selectedInstituteId: newInstitute.id,
                isLoading: false
            });
            return newInstitute;
        } catch (err) {
            updateState({ error: 'Failed to create institute', isLoading: false });
            return null;
        }
    }, [updateState]);

    const createAccount = useCallback(async (name: string, type: Account['type'], currency: string) => {
        if (!state.selectedInstituteId) return null;

        updateState({ isLoading: true });
        try {
            const newAccount = await accountService.createAccount({
                instituteId: state.selectedInstituteId,
                name,
                type,
                defaultCurrency: currency
            });
            const accounts = await accountService.getAccountsByInstitute(state.selectedInstituteId);
            updateState({
                accounts,
                selectedAccountId: newAccount.id,
                isLoading: false
            });
            return newAccount;
        } catch (err) {
            updateState({ error: 'Failed to create account', isLoading: false });
            return null;
        }
    }, [state.selectedInstituteId, updateState]);

    // =========================================================================
    // STEP 2: FILE UPLOAD
    // =========================================================================

    const handleFileUpload = useCallback(async (file: File) => {
        updateState({ isLoading: true, file });

        try {
            const text = await file.text();
            const { headers, rows, delimiter } = parseCSVText(text);

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
                mappings = autoDetectMappings(headers);
            }

            updateState({
                rawCSVText: text,
                headers,
                previewRows: rows.slice(0, 5), // Show first 5 rows
                mappings,
                detectedPreset,
                isLoading: false,
                step: 3 // Move to mapping step
            });
        } catch (err) {
            updateState({ error: 'Failed to parse file', isLoading: false });
        }
    }, [updateState]);

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

    const applyTemplate = useCallback((templateId: string) => {
        const template = state.mappingTemplates.find(t => t.id === templateId);
        if (template) {
            updateState({
                mappings: template.mappings as Partial<FieldMappings>,
                selectedTemplateId: templateId
            });
        }
    }, [state.mappingTemplates, updateState]);

    const saveAsTemplate = useCallback(async (name: string) => {
        if (!isValidMappingForAnalysis) return null;

        try {
            const template = await importService.saveMappingTemplate(
                name,
                state.mappings as FieldMappings,
                state.selectedInstituteId || undefined
            );
            const templates = await importService.getMappingTemplates();
            updateState({ mappingTemplates: templates });
            return template;
        } catch (err) {
            updateState({ error: 'Failed to save template' });
            return null;
        }
    }, [state.mappings, state.selectedInstituteId, updateState]);

    const analyzeData = useCallback(async () => {
        if (!state.selectedAccountId) {
            updateState({ error: 'Please select an account' });
            return;
        }

        updateState({ isLoading: true, error: null });

        try {
            const result = await importService.parseFile(state.rawCSVText, {
                accountId: state.selectedAccountId,
                mode: state.importMode,
                customMappings: state.mappings as FieldMappings
            });

            updateState({
                stagedTransactions: result.candidates,
                stats: result.stats,
                isLoading: false,
                step: 4
            });
        } catch (err) {
            updateState({ error: 'Failed to analyze data', isLoading: false });
        }
    }, [state.selectedAccountId, state.rawCSVText, state.importMode, state.mappings, updateState]);

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
                    errors.push({ field: 'transactionDate', message: 'Date is required', severity: 'error' as const });
                }
                if (!updated.parsed.amountPrimary) {
                    errors.push({ field: 'amountPrimary', message: 'Amount is required', severity: 'error' as const });
                }
                if (!updated.parsed.assetSymbol) {
                    errors.push({ field: 'assetSymbol', message: 'Asset symbol is required', severity: 'error' as const });
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
            csvRows.push(row.originalRowArray.map(v => `"${v.replace(/"/g, '""')}"`).join(','));
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
            updateState({ error: 'Missing account or file' });
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

            // Compute file hash for the commit (simplified - using file name as hash for now)
            const fileHash = await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(state.rawCSVText)
            ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));

            const result = await importService.commitBatch(
                toCommit,
                state.selectedAccountId,
                state.importMode,
                state.file.name,
                fileHash,
                'default-user' // userId
            );

            if (!result.success) {
                updateState({ error: result.error || 'Import failed', isLoading: false });
                return;
            }

            updateState({
                completedBatch: result.batch || null,
                isLoading: false,
                step: 5
            });
        } catch (err) {
            updateState({ error: 'Failed to complete import', isLoading: false });
        }
    }, [state.selectedAccountId, state.file, state.rawCSVText, state.stagedTransactions, state.importMode, updateState]);

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
        return !!(m.transactionDate && m.amountPrimary && m.assetSymbol);
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
        createInstitute,
        createAccount,

        // Step 2 Actions
        handleFileUpload,

        // Step 3 Actions
        setMapping,
        applyTemplate,
        saveAsTemplate,
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

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Auto-detect mappings based on common header patterns
 */
function autoDetectMappings(headers: string[]): Partial<FieldMappings> {
    const mappings: Partial<FieldMappings> = {};
    const lowerHeaders = headers.map(h => h.toLowerCase());

    // Date
    const datePatterns = ['date', 'time', 'timestamp', 'datetime'];
    const dateIdx = lowerHeaders.findIndex(h => datePatterns.some(p => h.includes(p)));
    if (dateIdx >= 0) mappings.transactionDate = headers[dateIdx];

    // Amount
    const amountPatterns = ['amount', 'total', 'change', 'value', 'montant'];
    const amountIdx = lowerHeaders.findIndex(h => amountPatterns.some(p => h.includes(p)));
    if (amountIdx >= 0) mappings.amountPrimary = headers[amountIdx];

    // Symbol
    const symbolPatterns = ['symbol', 'ticker', 'asset', 'coin', 'currency', 'devise'];
    const symbolIdx = lowerHeaders.findIndex(h => symbolPatterns.some(p => h.includes(p)));
    if (symbolIdx >= 0) mappings.assetSymbol = headers[symbolIdx];

    // Type
    const typePatterns = ['type', 'side', 'operation', 'action', 'sens'];
    const typeIdx = lowerHeaders.findIndex(h => typePatterns.some(p => h.includes(p)));
    if (typeIdx >= 0) mappings.type = headers[typeIdx];

    // Label
    const labelPatterns = ['label', 'description', 'libellé', 'remark', 'note', 'memo'];
    const labelIdx = lowerHeaders.findIndex(h => labelPatterns.some(p => h.includes(p)));
    if (labelIdx >= 0) mappings.rawLabel = headers[labelIdx];

    // Price
    const pricePatterns = ['price', 'prix', 'rate', 'unit'];
    const priceIdx = lowerHeaders.findIndex(h => pricePatterns.some(p => h.includes(p)) && !h.includes('total'));
    if (priceIdx >= 0) mappings.priceUnit = headers[priceIdx];

    // Quantity
    const qtyPatterns = ['quantity', 'qty', 'volume', 'shares', 'quantité', 'nombre'];
    const qtyIdx = lowerHeaders.findIndex(h => qtyPatterns.some(p => h.includes(p)));
    if (qtyIdx >= 0) mappings.quantity = headers[qtyIdx];

    // Fee
    const feePatterns = ['fee', 'frais', 'commission'];
    const feeIdx = lowerHeaders.findIndex(h => feePatterns.some(p => h.includes(p)));
    if (feeIdx >= 0) mappings.feeAmount = headers[feeIdx];

    // ISIN
    const isinPatterns = ['isin'];
    const isinIdx = lowerHeaders.findIndex(h => isinPatterns.some(p => h.includes(p)));
    if (isinIdx >= 0) mappings.assetIsin = headers[isinIdx];

    // Balance
    const balancePatterns = ['balance', 'solde'];
    const balanceIdx = lowerHeaders.findIndex(h => balancePatterns.some(p => h.includes(p)));
    if (balanceIdx >= 0) mappings.balanceAfter = headers[balanceIdx];

    return mappings;
}

export default useImportWizard;
