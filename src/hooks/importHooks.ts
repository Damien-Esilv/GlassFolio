/**
 * Import Wizard Hook
 * 
 * State machine for the Universal Financial Import Wizard.
 * Manages the 5-step import flow: Context → Upload → Mapping → Staging → Complete
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
    Institute,
    Account,
    ImportMode,
    MappingTemplate,
    ImportBatch
} from '../types';
import {
    importService,
    StagedTransaction,
    FieldMappings,
    ParseResult,
    parseCSVText
} from '../services/importService';
import { instituteService, accountService } from '../services/instituteService';
import {
    describeImportInstruments,
    resolveStagedInstrument,
    revalidateStagedRow,
} from '../services/import/importManager';
import type { ImportInstrumentSummary } from '../services/import/importManager';
import {
    clearStagedInstruments,
    findInstrument,
    isStagedInstrument,
    previewStagedIssues,
    resolveInstrumentId,
    updateStagedInstrument,
} from '../services/import/instrumentDrafts';
import { instrumentService } from '../services/instrumentService';
import type { InstrumentIssue, InstrumentPatch } from '../services/instrumentService';
import { readAndParseCsvFile } from '../services/import/csvWorkerClient';
import { parseDate, parseDecimal } from '../services/import/typeNormalizer';
import {
    proposeColumnMapping,
    proposalsToMappings,
    HISTORY_COLUMN_SPECS,
} from '../services/import/columnMatcher';
import type { ColumnProposal, ColumnStatus, HistoryField } from '../services/import/columnMatcher';
import { buildRowContext, normalizeRow } from '../services/import/rowNormalizer';
import { findTemplateForHeaders } from '../services/import/mappingTemplateService';
import type { DateFormatHint } from '../services/import/typeNormalizer';
import type { CsvEncoding } from '../services/import/types';
import type { CostBasisMethod } from '../types/types.backend';
import { computeFileHash, isFileAlreadyImported } from '../services/core/transactionManager';
import i18n from '../i18n';

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
    /** First rows of the file (at most SAMPLE_ROWS), for samples and the mapped preview */
    sampleRows: string[][];
    /** Number of data rows in the file */
    rowCount: number;
    /** One proposal per source column, from headers and contents */
    columnProposals: ColumnProposal<HistoryField>[];
    mappings: Partial<FieldMappings>;
    mappingTemplates: MappingTemplate[];
    selectedTemplateId: string | null;
    /** Saved profile whose columns fit the uploaded file (suggested, never auto-applied) */
    suggestedTemplateId: string | null;
    detectedPreset: string | null;

    // Step 4: Staging Area
    stagedTransactions: StagedTransaction[];
    stats: ParseResult['stats'];
    /** The assets the rows point at (new ones are drafts until the import is confirmed) */
    instruments: ImportInstrumentSummary[];
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
    { key: 'assetName', labelKey: 'importWizard.fields.assetName', required: false },
    { key: 'currency', labelKey: 'importWizard.fields.currency', required: false },
    { key: 'valueDate', labelKey: 'importWizard.fields.valueDate', required: false },
    { key: 'balanceAfter', labelKey: 'importWizard.fields.balanceAfter', required: false },
    { key: 'externalId', labelKey: 'importWizard.fields.externalId', required: false },
] as const;

export type MappableField = (typeof MAPPABLE_FIELDS)[number]['key'];

/** Rows kept in state for samples and the live preview (the whole file stays in rawCSVText) */
export const SAMPLE_ROWS = 200;

/** Rows shown in the "as it will be stored" preview */
export const MAPPED_PREVIEW_ROWS = 2;

/** One source column as the mapping table shows it */
export interface MappingColumn {
    header: string;
    index: number;
    samples: string[];
    /** Field this column feeds now (null: ignored) */
    field: MappableField | null;
    /** Other fields fed by the same column (a statement whose "Change" is both quantity and amount) */
    extraFields: MappableField[];
    status: ColumnStatus;
    /** What the engine would pick for this column, if it is not mapped yet */
    suggestion: MappableField | null;
    alternatives: MappableField[];
}

export interface MappingSummary {
    total: number;
    matched: number;
    ambiguous: number;
    unmatched: number;
}

const STATUS_ORDER: Record<ColumnStatus, number> = { unmatched: 0, ambiguous: 1, matched: 2 };
const MAPPABLE_KEYS: readonly string[] = MAPPABLE_FIELDS.map(f => f.key);
const isMappable = (field: string | null): field is MappableField => field !== null && MAPPABLE_KEYS.includes(field);

/** Stored fields shown in the preview, in reading order */
const PREVIEW_FIELDS = [
    'transactionDate', 'type', 'assetSymbol', 'assetIsin', 'quantity', 'priceUnit',
    'amountPrimary', 'feeAmount', 'originalCurrency', 'rawLabel'
] as const;

export interface MappedPreviewEntry {
    field: MappableField;
    value: string;
}

/** Everything the wizard derives from a parsed file */
function describeFile(headers: string[], rows: string[][]) {
    return {
        headers,
        previewRows: rows.slice(0, 5),
        sampleRows: rows.slice(0, SAMPLE_ROWS),
        rowCount: rows.length,
        columnProposals: proposeColumnMapping(headers, rows, HISTORY_COLUMN_SPECS),
    };
}

/** Header-keyed mapping from the confident proposals only; doubtful columns wait for the user */
function confidentMappings(proposals: ColumnProposal<HistoryField>[]): Partial<FieldMappings> {
    return proposalsToMappings(proposals.filter(p => p.status === 'matched')) as Partial<FieldMappings>;
}

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
    sampleRows: [],
    rowCount: 0,
    columnProposals: [],
    mappings: {},
    mappingTemplates: [],
    selectedTemplateId: null,
    suggestedTemplateId: null,
    detectedPreset: null,

    stagedTransactions: [],
    stats: { total: 0, valid: 0, errors: 0, duplicates: 0, warnings: 0 },
    instruments: [],
    editingRowId: null,

    completedBatch: null,
};

const computeStats = (rows: StagedTransaction[]): ParseResult['stats'] => ({
    total: rows.length,
    valid: rows.filter(c => c.status === 'valid').length,
    errors: rows.filter(c => c.status === 'error').length,
    duplicates: rows.filter(c => c.status === 'duplicate').length,
    warnings: rows.filter(c => c.status === 'warning').length
});

/** How long to wait after the last keystroke before looking up the asset of an edited row. */
const ROW_ASSET_RESOLVE_DELAY_MS = 400;

// ============================================================================
// HOOK
// ============================================================================

export const useImportWizard = (userId: string = 'default-user') => {
    const [state, setState] = useState<ImportWizardState>(initialState);
    const stateRef = useRef(state);
    stateRef.current = state;
    const resolveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    /** Rows whose cells were typed in the review: stored like file values once editing ends. */
    const editedRowIds = useRef(new Set<string>());
    useEffect(() => () => {
        Object.values(resolveTimers.current).forEach(clearTimeout);
    }, []);

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
            const { snapshotService } = await import('../services/import/snapshotService');
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

            // A known broker format first, then the confident column proposals
            const detected = importService.detectPreset(headers);
            const described = describeFile(headers, rows);
            const mappings: Partial<FieldMappings> = detected
                ? detected.mappings as Partial<FieldMappings>
                : confidentMappings(described.columnProposals);
            const detectedPreset: string | null = detected ? detected.presetName : null;

            updateState({
                ...described,
                rawCSVText: text,
                suggestedTemplateId: findTemplateForHeaders(state.mappingTemplates, headers)?.id ?? null,
                selectedTemplateId: null,
                fileEncoding: encoding,
                delimiter,
                existingBatch,
                mappings,
                detectedPreset,
                // A new file is read on its own: the date order chosen for the previous one may not apply
                dateFormat: 'auto',
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
     * Point a source column at a target field (null: ignore the column). A column feeds one field
     * and a field reads one column, so the previous owner of either side is released.
     */
    const setColumnField = useCallback((header: string, field: keyof FieldMappings | null) => {
        setState(prev => {
            const mappings: Partial<FieldMappings> = { ...prev.mappings };
            (Object.keys(mappings) as (keyof FieldMappings)[]).forEach(key => {
                if (mappings[key] === header) delete mappings[key];
            });
            if (field) (mappings as Record<string, string | number | undefined>)[field] = header;
            return { ...prev, mappings, selectedTemplateId: null };
        });
    }, []);

    /** Apply every pending suggestion to columns and fields that are still free */
    const acceptAllProposals = useCallback(() => {
        setState(prev => {
            const mappings: Partial<FieldMappings> = { ...prev.mappings };
            const mappedHeaders = new Set(Object.values(mappings).filter((v): v is string => typeof v === 'string'));
            for (const proposal of prev.columnProposals) {
                if (!isMappable(proposal.field) || proposal.status === 'unmatched') continue;
                if (mappedHeaders.has(proposal.header) || mappings[proposal.field] !== undefined) continue;
                (mappings as Record<string, string | number | undefined>)[proposal.field] = proposal.header;
                mappedHeaders.add(proposal.header);
            }
            return { ...prev, mappings, selectedTemplateId: null };
        });
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
            const described = describeFile(headers, rows);
            return {
                ...prev,
                ...described,
                delimiter,
                mappings: detected ? detected.mappings as Partial<FieldMappings> : confidentMappings(described.columnProposals),
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
                ...(reparsed ? describeFile(reparsed.headers, reparsed.rows) : {})
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
                instruments: result.instruments ?? [],
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
                stats: computeStats(filtered),
                instruments: describeImportInstruments(filtered)
            };
        });
    }, []);

    const startEditRow = useCallback((rowId: string) => {
        updateState({ editingRowId: rowId });
    }, [updateState]);

    /**
     * A cell typed in the review is text in the user's own format ("1 234,56", "05/01/2024"): read it
     * like the file's values, or it would be stored as is (1 instead of 1234.56, a non-ISO date).
     */
    const normalizeEditedRows = (rows: StagedTransaction[], dateFormat: DateFormatHint | 'auto', mode: ImportMode): StagedTransaction[] => {
        if (editedRowIds.current.size === 0) return rows;
        const edited = new Set(editedRowIds.current);
        editedRowIds.current.clear();
        return rows.map(row => {
            if (!edited.has(row.id)) return row;
            const date = row.parsed.transactionDate
                ? parseDate(row.parsed.transactionDate, dateFormat === 'auto' ? undefined : dateFormat)
                : null;
            const amount = row.parsed.amountPrimary ? parseDecimal(row.parsed.amountPrimary) : null;
            const parsed = {
                ...row.parsed,
                ...(date ? { transactionDate: date } : {}),
                ...(amount !== null ? { amountPrimary: amount } : {}),
            };
            return revalidateStagedRow({ ...row, parsed }, mode);
        });
    };

    const cancelEditRow = useCallback(() => {
        setState(prev => ({
            ...refreshRows(prev, normalizeEditedRows(prev.stagedTransactions, prev.dateFormat, prev.importMode)),
            editingRowId: null,
        }));
    }, []);

    /** Rows re-validated with the full rules; the asset summary and the counters follow. */
    const refreshRows = (prev: ImportWizardState, rows: StagedTransaction[]): ImportWizardState => ({
        ...prev,
        stagedTransactions: rows,
        stats: computeStats(rows),
        instruments: describeImportInstruments(rows)
    });

    const updateRowField = useCallback((rowId: string, field: string, value: string) => {
        editedRowIds.current.add(rowId);
        setState(prev => refreshRows(prev, prev.stagedTransactions.map(t => {
            if (t.id !== rowId) return t;
            return revalidateStagedRow({ ...t, parsed: { ...t.parsed, [field]: value } }, prev.importMode);
        })));

        // A new symbol or ISIN points the row at another asset: look it up once typing pauses
        if (field === 'assetSymbol' || field === 'assetIsin') {
            clearTimeout(resolveTimers.current[rowId]);
            resolveTimers.current[rowId] = setTimeout(async () => {
                const current = stateRef.current;
                const row = current.stagedTransactions.find(t => t.id === rowId);
                if (!row || !current.selectedAccountId) return;
                const instrument = await resolveStagedInstrument(
                    { symbol: row.parsed.assetSymbol, isin: row.parsed.assetIsin },
                    current.selectedAccountId
                );
                setState(prev => refreshRows(prev, prev.stagedTransactions.map(t => {
                    if (t.id !== rowId || t.parsed.assetSymbol !== row.parsed.assetSymbol || t.parsed.assetIsin !== row.parsed.assetIsin) return t;
                    return revalidateStagedRow({ ...t, parsed: { ...t.parsed, instrumentId: instrument?.id } }, prev.importMode);
                })));
            }, ROW_ASSET_RESOLVE_DELAY_MS);
        }
    }, []);

    /** Live integrity checks of an asset being edited in the review (nothing is saved). */
    const previewImportInstrumentIssues = useCallback((instrumentId: string, patch: InstrumentPatch): InstrumentIssue[] => {
        return isStagedInstrument(instrumentId)
            ? previewStagedIssues(instrumentId, patch)
            : instrumentService.previewInstrumentIssues(instrumentId, patch);
    }, []);

    /**
     * Edit an asset of the import. A new one is a draft (persisted when the import is confirmed); one
     * already in the portfolio is updated right away. With `mergeInto` it is merged into that duplicate.
     * Throws an InstrumentValidationError when the edit is refused.
     */
    const updateImportInstrument = useCallback(async (instrumentId: string, patch: InstrumentPatch, mergeInto?: string): Promise<void> => {
        const kept = isStagedInstrument(instrumentId)
            ? updateStagedInstrument(instrumentId, patch, mergeInto)
            : (await instrumentService.updateInstrument(instrumentId, patch, { mergeInto })).instrument;
        setState(prev => refreshRows(prev, prev.stagedTransactions.map(t => {
            const id = t.parsed.instrumentId;
            if (!id || (resolveInstrumentId(id) !== kept.id && id !== instrumentId)) return t;
            return revalidateStagedRow({ ...t, parsed: { ...t.parsed, instrumentId: kept.id } }, prev.importMode);
        })));
    }, []);

    const findImportInstrument = useCallback((instrumentId: string) => findInstrument(instrumentId), []);

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
            // Set all pending valid/warning rows to import (a row still being edited is read first)
            const toCommit = normalizeEditedRows(state.stagedTransactions, state.dateFormat, state.importMode).map(t => ({
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
    }, [state.selectedAccountId, state.file, state.rawCSVText, state.stagedTransactions, state.importMode, state.delimiter, state.dateFormat, userId, updateState]);

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
        clearStagedInstruments();
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

    /** Source columns as the table shows them: unmatched, then ambiguous, then matched */
    const mappingColumns = useMemo<MappingColumn[]>(() => {
        const columns = state.columnProposals.map((proposal): MappingColumn => {
            const mappedFields = MAPPABLE_FIELDS
                .map(f => f.key as MappableField)
                .filter(key => state.mappings[key] === proposal.header);
            const suggestion = isMappable(proposal.field) && state.mappings[proposal.field] === undefined ? proposal.field : null;
            // Only a doubtful proposal waits for a decision; a confident one the user cleared stays ignored
            const pending = mappedFields.length === 0 && suggestion !== null && proposal.status === 'ambiguous';
            return {
                header: proposal.header,
                index: proposal.index,
                samples: proposal.samples,
                field: mappedFields[0] ?? null,
                extraFields: mappedFields.slice(1),
                // A mapped column is decided; an unmapped one is a pending suggestion or nothing
                status: mappedFields.length > 0 ? 'matched' : pending ? 'ambiguous' : 'unmatched',
                suggestion: pending ? suggestion : null,
                alternatives: proposal.alternatives.filter(isMappable),
            };
        });
        return [...columns].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.index - b.index);
    }, [state.columnProposals, state.mappings]);

    const mappingSummary = useMemo<MappingSummary>(() => ({
        total: mappingColumns.length,
        matched: mappingColumns.filter(c => c.status === 'matched').length,
        ambiguous: mappingColumns.filter(c => c.status === 'ambiguous').length,
        unmatched: mappingColumns.filter(c => c.status === 'unmatched').length,
    }), [mappingColumns]);

    /** The first rows exactly as the import will store them with the current mapping */
    const mappedPreview = useMemo<MappedPreviewEntry[][]>(() => {
        if (state.headers.length === 0 || state.sampleRows.length === 0) return [];
        const mappings = { transactionDate: '', amountPrimary: '', ...state.mappings } as FieldMappings;
        const context = buildRowContext(state.headers, state.sampleRows, mappings, {
            mode: state.importMode,
            dateFormat: state.dateFormat === 'auto' ? undefined : state.dateFormat,
            delimiter: state.delimiter,
            accountCurrency: selectedAccount?.defaultCurrency
        });
        return state.sampleRows.slice(0, MAPPED_PREVIEW_ROWS).map(row => {
            const { parsed } = normalizeRow(row, context);
            return PREVIEW_FIELDS.flatMap((field): MappedPreviewEntry[] => {
                const value = parsed[field];
                if (value === undefined || value === '') return [];
                return [{ field: field === 'originalCurrency' ? 'currency' : field, value: String(value) }];
            });
        });
    }, [state.headers, state.sampleRows, state.mappings, state.importMode, state.dateFormat, state.delimiter, selectedAccount]);

    const isValidMappingForAnalysis = useMemo(() => {
        const m = state.mappings;
        // A bank statement line is identified by its currency
        const hasIdentifier = !!(m.assetSymbol || m.assetIsin || m.currency);
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
        mappingColumns,
        mappingSummary,
        pendingSuggestionCount: mappingSummary.ambiguous,
        mappedPreview,
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
        setColumnField,
        acceptAllProposals,
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
        updateImportInstrument,
        previewImportInstrumentIssues,
        findImportInstrument,
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
