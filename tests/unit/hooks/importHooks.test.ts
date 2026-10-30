/**
 * Tests d'integration -- useImportWizard (Pilier 5)
 *
 * Couvre :
 *  - Initialisation & chargement des donnees (instituts, templates)
 *  - Step 1 : Selection contexte (institut, compte, mode)
 *  - Step 2 : Upload fichier CSV + detection preset
 *  - Step 3 : Mapping champs & computed isValidMappingForAnalysis
 *  - Step 4 : Staging area (rowResolution, removeRow, updateRowField)
 *  - Navigation : goToStep, goBack, reset
 *  - Resilience : erreur reseau / fichier corrompu
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useImportWizard from '../../../src/hooks/importHooks';
import { importService } from '../../../src/services/importService';
import { stageInstrument, clearStagedInstruments } from '../../../src/services/import/instrumentDrafts';

// ============================================================================
// MOCKS
// ============================================================================

const mockInstitutes = [
    { id: 'inst-1', ownerId: 'user-1', name: 'BNP Paribas', type: 'bank' as const, isCustom: false, country: 'FR', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    { id: 'inst-2', ownerId: 'user-1', name: 'Binance', type: 'exchange' as const, isCustom: false, country: 'MT', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
];

const mockAccounts = [
    { id: 'acc-1', instituteId: 'inst-1', name: 'Compte Courant', type: 'cash' as const, defaultCurrency: 'EUR' },
    { id: 'acc-2', instituteId: 'inst-1', name: 'PEA', type: 'securities' as const, defaultCurrency: 'EUR' },
];

const mockTemplates = [
    {
        id: 'tpl-1',
        name: 'Mon Template Binance',
        mappings: { transactionDate: 'Date', amountPrimary: 'Amount', assetSymbol: 'Coin' },
        instituteId: 'inst-2'
    }
];

const mockStagedTransactions = [
    {
        id: 'row-1',
        originalRowArray: ['2024-01-15', 'BTC', '100.00', 'BUY'],
        parsed: { transactionDate: '2024-01-15', assetSymbol: 'BTC', amountPrimary: '100.00', type: 'BUY' },
        status: 'valid' as const,
        resolution: 'pending' as const,
        errors: [],
    },
    {
        id: 'row-2',
        originalRowArray: ['invalid-date', 'ETH', '', 'SELL'],
        parsed: { transactionDate: '', assetSymbol: 'ETH', amountPrimary: '', type: 'SELL' },
        status: 'error' as const,
        resolution: 'skip' as const,
        errors: [{ field: 'transactionDate', message: 'Date required', severity: 'error' as const }],
    },
    {
        id: 'row-3',
        originalRowArray: ['2024-01-16', 'SOL', '50.00', 'BUY'],
        parsed: { transactionDate: '2024-01-16', assetSymbol: 'SOL', amountPrimary: '50.00', type: 'BUY' },
        status: 'duplicate' as const,
        resolution: 'skip' as const,
        errors: [],
    }
];

// Service mocks
vi.mock('../../../src/services/instituteService', () => ({
    instituteService: {
        getInstitutes: vi.fn(async () => mockInstitutes),
        createInstitute: vi.fn(async ({ name, type, country }: { name: string; type: string; country?: string }) => ({
            id: 'inst-new',
            name,
            type,
            country: country ?? 'FR'
        })),
    },
    accountService: {
        getAccountsByInstitute: vi.fn(async () => mockAccounts),
        createAccount: vi.fn(async (data: Record<string, unknown>) => ({ id: 'acc-new', ...data })),
    },
}));

vi.mock('../../../src/services/importService', () => ({
    importService: {
        getMappingTemplates: vi.fn(async () => mockTemplates),
        detectPreset: vi.fn((headers: string[]) => {
            if (headers.includes('UTC_Time') && headers.includes('Coin')) {
                return {
                    presetName: 'Binance',
                    mappings: { transactionDate: 'UTC_Time', assetSymbol: 'Coin', amountPrimary: 'Change' }
                };
            }
            return null;
        }),
        parseFile: vi.fn(async () => ({
            candidates: mockStagedTransactions,
            stats: { total: 3, valid: 1, errors: 1, duplicates: 1, warnings: 0 }
        })),
        commitBatch: vi.fn(async () => ({
            success: true,
            batch: { id: 'batch-1', accountId: 'acc-1', importedAt: '2024-01-15T00:00:00Z', count: 1 }
        })),
        saveMappingTemplate: vi.fn(async (name: string, mappings: unknown) => ({ id: 'tpl-new', name, mappings })),
    },
    parseCSVText: vi.fn((text: string) => {
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',');
        const rows = lines.slice(1).map((l: string) => l.split(','));
        return { headers, rows, delimiter: ',' };
    }),
    StagedTransaction: undefined,
    FieldMappings: undefined,
    ParseResult: undefined,
}));

vi.mock('../../../src/services/import/csvWorkerClient', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../src/services/import/csvWorkerClient')>();
    return { ...actual, readAndParseCsvFile: vi.fn(actual.readAndParseCsvFile) };
});

vi.mock('../../../src/services/import/snapshotService', () => ({
    snapshotService: {
        detectSourceModeConflict: vi.fn(async () => 'NONE'),
    },
}));

vi.mock('../../../src/i18n', () => ({
    default: {
        t: (key: string) => key,
    },
}));

// ============================================================================
// CSV FIXTURES
// ============================================================================

const BINANCE_CSV = [
    'UTC_Time,Account,Operation,Coin,Change,Remark',
    '2024-01-15 10:00:00,Spot,Buy,BTC,0.001,',
    '2024-01-16 11:00:00,Spot,Sell,ETH,-0.1,',
].join('\n');

const GENERIC_CSV = [
    'Date,Amount,Symbol,Type',
    '2024-01-15,100.00,AAPL,BUY',
    '2024-01-16,-50.00,MSFT,SELL',
].join('\n');

const MALFORMED_CSV = 'not,valid\ncsv,content';

// Headers that say little: the date, the type and the ticker are found, the rest needs the user
const OPAQUE_CSV = [
    'when,what,how many,unit cost,ticker,cash',
    '2024-01-05,buy,5,185.50,AAPL,927.50',
    '2024-02-12,sell,2,400.00,MSFT,800.00',
].join('\n');

// 'quantitydelta' only prefix-matches quantity: suggested, not certain
const SUGGESTION_CSV = [
    'Date,quantitydelta,Symbol,Amount',
    '2024-01-15,5,AAPL,100.00',
    '2024-01-16,3,MSFT,50.00',
].join('\n');

function bigCsv(rows: number): string {
    const lines = ['Date,Amount,Symbol,Type,Shares,Price'];
    for (let i = 0; i < rows; i++) {
        const day = String((i % 28) + 1).padStart(2, '0');
        lines.push(`2024-01-${day},${100 + i},AAPL,BUY,${i + 1},${(100 + i) / (i + 1)}`);
    }
    return lines.join('\n');
}

function makeFile(content: string, name = 'test.csv'): File {
    return new File([content], name, { type: 'text/csv' });
}

// ============================================================================
// TESTS
// ============================================================================

describe('useImportWizard -- Pilier 5 (Tests Integration React Hooks)', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─────────────────────────────────────────────────────────────────────
    // INITIALISATION
    // ─────────────────────────────────────────────────────────────────────

    describe('Initialisation', () => {
        it('starts at step 1 with correct initial state', async () => {
            const { result } = renderHook(() => useImportWizard());

            expect(result.current.step).toBe(1);
            expect(result.current.isLoading).toBe(true);
            expect(result.current.error).toBeNull();
            expect(result.current.selectedInstituteId).toBeNull();
            expect(result.current.selectedAccountId).toBeNull();
        });

        it('loads institutes and templates on mount', async () => {
            const { result } = renderHook(() => useImportWizard());

            await waitFor(() => expect(result.current.isLoading).toBe(false));

            expect(result.current.institutes).toHaveLength(2);
            expect(result.current.institutes[0].name).toBe('BNP Paribas');
            expect(result.current.mappingTemplates).toHaveLength(1);
        });

        it('shows error when initial load fails', async () => {
            const { importService } = await import('../../../src/services/importService');
            vi.mocked(importService.getMappingTemplates).mockRejectedValueOnce(new Error('Network error'));

            const { result } = renderHook(() => useImportWizard());

            await waitFor(() => expect(result.current.isLoading).toBe(false));
            expect(result.current.error).toBe('transactions:importWizard.errors.failedToLoadData');
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // STEP 1 — CONTEXT SELECTION
    // ─────────────────────────────────────────────────────────────────────

    describe('Step 1 -- Context selection', () => {
        it('selecting an institute loads associated accounts', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            act(() => { result.current.selectInstitute('inst-1'); });

            await waitFor(() => expect(result.current.accounts).toHaveLength(2));
            expect(result.current.selectedInstituteId).toBe('inst-1');
            expect(result.current.selectedAccountId).toBeNull();
        });

        it('deselecting institute clears accounts list', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            act(() => { result.current.selectInstitute('inst-1'); });
            await waitFor(() => expect(result.current.accounts).toHaveLength(2));

            act(() => { result.current.selectInstitute(null); });
            await waitFor(() => expect(result.current.accounts).toHaveLength(0));
        });

        it('selecting account enables canProceedFromStep1', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            expect(result.current.canProceedFromStep1).toBe(false);

            act(() => { result.current.selectInstitute('inst-1'); });
            await waitFor(() => expect(result.current.accounts).toHaveLength(2));

            act(() => { result.current.selectAccount('acc-1'); });
            expect(result.current.canProceedFromStep1).toBe(true);
        });

        it('setImportMode updates importMode', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            act(() => { result.current.setImportMode('snapshot'); });
            expect(result.current.importMode).toBe('snapshot');
        });

        it('createInstitute creates and auto-selects the new institute', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            const { instituteService } = await import('../../../src/services/instituteService');
            vi.mocked(instituteService.getInstitutes).mockResolvedValueOnce([
                ...mockInstitutes,
                { id: 'inst-new', ownerId: 'user-1', name: 'Revolut', type: 'bank' as const, isCustom: true, country: 'FR', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }
            ]);

            await act(async () => {
                await result.current.createInstitute('Revolut', 'bank', 'FR');
            });

            expect(result.current.selectedInstituteId).toBe('inst-new');
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // STEP 2 — FILE UPLOAD
    // ─────────────────────────────────────────────────────────────────────

    describe('Step 2 -- File upload & preset detection', () => {
        it('uploading a Binance CSV detects preset and moves to step 3', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            await act(async () => {
                await result.current.handleFileUpload(makeFile(BINANCE_CSV));
            });

            expect(result.current.step).toBe(3);
            expect(result.current.detectedPreset).toBe('Binance');
            expect(result.current.headers).toContain('UTC_Time');
            expect(result.current.mappings.assetSymbol).toBe('Coin');
            expect(result.current.previewRows.length).toBeGreaterThan(0);
        });

        it('uploading a generic CSV attempts auto-mapping', async () => {
            const { importService } = await import('../../../src/services/importService');
            vi.mocked(importService.detectPreset).mockReturnValueOnce(null);

            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            await act(async () => {
                await result.current.handleFileUpload(makeFile(GENERIC_CSV));
            });

            expect(result.current.step).toBe(3);
            expect(result.current.detectedPreset).toBeNull();
            // autoDetectMappings should find 'Date' header
            expect(result.current.mappings.transactionDate).toBe('Date');
        });

        it('failed upload shows error message', async () => {
            const { readAndParseCsvFile } = await import('../../../src/services/import/csvWorkerClient');
            vi.mocked(readAndParseCsvFile).mockRejectedValueOnce(new Error('Parse error'));

            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            await act(async () => {
                await result.current.handleFileUpload(makeFile(MALFORMED_CSV));
            });

            expect(result.current.error).toBe('transactions:importWizard.errors.failedToParseFile');
            expect(result.current.isLoading).toBe(false);
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // STEP 3 — MAPPING
    // ─────────────────────────────────────────────────────────────────────

    describe('Step 3 -- Mapping & validation', () => {
        it('setMapping updates a mapping field', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            act(() => { result.current.setMapping('transactionDate', 'Date'); });
            expect(result.current.mappings.transactionDate).toBe('Date');

            act(() => { result.current.setMapping('amountPrimary', 'Amount'); });
            expect(result.current.mappings.amountPrimary).toBe('Amount');
        });

        it('isValidMappingForAnalysis is false if required fields are missing', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            expect(result.current.isValidMappingForAnalysis).toBe(false);

            act(() => { result.current.setMapping('transactionDate', 'Date'); });
            // Still false: missing amountPrimary + identifier
            expect(result.current.isValidMappingForAnalysis).toBe(false);
        });

        it('isValidMappingForAnalysis becomes true when 3 required fields are mapped', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            act(() => {
                result.current.setMapping('transactionDate', 'Date');
                result.current.setMapping('amountPrimary', 'Amount');
                result.current.setMapping('assetSymbol', 'Ticker');
            });

            expect(result.current.isValidMappingForAnalysis).toBe(true);
        });

        it('isValidMappingForAnalysis accepts a currency column as the identity of a bank statement line', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            act(() => {
                result.current.setMapping('transactionDate', 'Date');
                result.current.setMapping('amountPrimary', 'Amount');
                result.current.setMapping('currency', 'Devise');
            });

            expect(result.current.isValidMappingForAnalysis).toBe(true);
        });

        it('applyTemplate applies the selected template mappings', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            act(() => { result.current.applyTemplate('tpl-1'); });

            expect(result.current.selectedTemplateId).toBe('tpl-1');
            expect(result.current.mappings.transactionDate).toBe('Date');
            expect(result.current.mappings.assetSymbol).toBe('Coin');
        });

        it('analyzeData without selected account shows error', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            await act(async () => { await result.current.analyzeData(); });

            expect(result.current.error).toBe('transactions:importWizard.errors.selectAccountFirst');
            expect(result.current.step).toBe(1);
        });

        it('analyzeData succeeds and moves to step 4 with staged transactions', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            act(() => {
                result.current.selectAccount('acc-1');
                result.current.setMapping('transactionDate', 'Date');
                result.current.setMapping('amountPrimary', 'Amount');
                result.current.setMapping('assetSymbol', 'Symbol');
            });

            await act(async () => { await result.current.analyzeData(); });

            expect(result.current.step).toBe(4);
            expect(result.current.stagedTransactions).toHaveLength(3);
            expect(result.current.stats.total).toBe(3);
            expect(result.current.stats.valid).toBe(1);
            expect(result.current.stats.errors).toBe(1);
        });
    });

    describe('Step 3 -- Column-first mapping', () => {
        async function upload(csv: string, account = true) {
            const { importService } = await import('../../../src/services/importService');
            vi.mocked(importService.detectPreset).mockReturnValueOnce(null);
            const hook = renderHook(() => useImportWizard());
            await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
            if (account) {
                act(() => { hook.result.current.selectInstitute('inst-1'); });
                await waitFor(() => expect(hook.result.current.accounts.length).toBeGreaterThan(0));
                act(() => { hook.result.current.selectAccount('acc-2'); });
            }
            await act(async () => { await hook.result.current.handleFileUpload(makeFile(csv)); });
            return hook.result;
        }

        it('proposes a field per column and only applies the confident ones', async () => {
            const result = await upload(OPAQUE_CSV);

            expect(result.current.columnProposals).toHaveLength(6);
            expect(result.current.mappings).toMatchObject({ transactionDate: 'when', type: 'what', assetSymbol: 'ticker' });
            expect(result.current.mappings.quantity).toBeUndefined();
            expect(result.current.mappingSummary).toEqual({ total: 6, matched: 3, ambiguous: 0, unmatched: 3 });
        });

        it('lists unmatched and ambiguous columns before matched ones, with samples', async () => {
            const result = await upload(SUGGESTION_CSV);

            const order = result.current.mappingColumns.map(c => [c.header, c.status]);
            expect(order[0]).toEqual(['quantitydelta', 'ambiguous']);
            expect(order.slice(1).every(([, status]) => status === 'matched')).toBe(true);
            expect(result.current.mappingColumns[0].samples).toEqual(['5', '3']);
            expect(result.current.mappingColumns[0].suggestion).toBe('quantity');
        });

        it('accepts every pending suggestion in one call without overriding existing choices', async () => {
            const result = await upload(SUGGESTION_CSV);
            expect(result.current.mappings.quantity).toBeUndefined();
            expect(result.current.pendingSuggestionCount).toBe(1);

            act(() => { result.current.acceptAllProposals(); });

            expect(result.current.mappings.quantity).toBe('quantitydelta');
            expect(result.current.mappings.amountPrimary).toBe('Amount');
            expect(result.current.mappingSummary).toMatchObject({ ambiguous: 0, unmatched: 0, matched: 4 });
            expect(result.current.pendingSuggestionCount).toBe(0);
        });

        it('moves a column to another field and frees the field it had', async () => {
            const result = await upload(SUGGESTION_CSV);

            act(() => { result.current.setColumnField('Amount', 'feeAmount'); });
            expect(result.current.mappings.feeAmount).toBe('Amount');
            expect(result.current.mappings.amountPrimary).toBeUndefined();

            act(() => { result.current.setColumnField('Amount', null); });
            expect(result.current.mappings.feeAmount).toBeUndefined();
            expect(result.current.mappingColumns.find(c => c.header === 'Amount')?.status).toBe('unmatched');
        });

        it('assigning a field to a second column removes it from the first', async () => {
            const result = await upload(SUGGESTION_CSV);

            act(() => { result.current.setColumnField('quantitydelta', 'amountPrimary'); });

            expect(result.current.mappings.amountPrimary).toBe('quantitydelta');
            expect(result.current.mappingColumns.find(c => c.header === 'Amount')?.field).toBeNull();
        });

        it('shows a column used for two fields once, with the other field listed', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));
            await act(async () => { await result.current.handleFileUpload(makeFile(BINANCE_CSV)); });
            // The real Binance preset maps the statement's "Change" to quantity and amount alike
            act(() => { result.current.setMapping('quantity', 'Change'); });

            const change = result.current.mappingColumns.find(c => c.header === 'Change');
            expect(change?.field).toBe('amountPrimary');
            expect(change?.extraFields).toEqual(['quantity']);
        });

        it('previews at most 2 rows as they will be stored, on a file of 2,500 rows', async () => {
            const result = await upload(bigCsv(2500));

            expect(result.current.rowCount).toBe(2500);
            expect(result.current.sampleRows).toHaveLength(200);
            expect(result.current.mappedPreview).toHaveLength(2);
            const first = Object.fromEntries(result.current.mappedPreview[0].map(e => [e.field, e.value]));
            expect(first.transactionDate).toBe('2024-01-01T00:00:00.000Z');
            expect(first.type).toBe('BUY');
            expect(first.assetSymbol).toBe('AAPL');
            expect(first.amountPrimary).toBe('100');
        });

        it('keeps a saved profile working: its mappings apply as they are', async () => {
            const result = await upload(GENERIC_CSV);

            act(() => { result.current.applyTemplate('tpl-1'); });

            expect(result.current.mappings).toEqual(mockTemplates[0].mappings);
            expect(result.current.selectedTemplateId).toBe('tpl-1');
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // STEP 4 — STAGING AREA
    // ─────────────────────────────────────────────────────────────────────

    describe('Step 4 -- Staging area', () => {
        async function setupToStep4() {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            act(() => {
                result.current.selectAccount('acc-1');
                result.current.setMapping('transactionDate', 'Date');
                result.current.setMapping('amountPrimary', 'Amount');
                result.current.setMapping('assetSymbol', 'Symbol');
            });

            await act(async () => { await result.current.analyzeData(); });
            return result;
        }

        it('setRowResolution changes the resolution of a specific row', async () => {
            const result = await setupToStep4();

            act(() => { result.current.setRowResolution('row-1', 'skip'); });

            const row = result.current.stagedTransactions.find(t => t.id === 'row-1');
            expect(row?.resolution).toBe('skip');
        });

        it('bulkSetResolution changes all rows matching given status', async () => {
            const result = await setupToStep4();

            act(() => { result.current.bulkSetResolution('duplicate', 'import'); });

            const duplicates = result.current.stagedTransactions.filter(t => t.status === 'duplicate');
            expect(duplicates.every(t => t.resolution === 'import')).toBe(true);
        });

        it('removeRow removes the row and recalculates stats', async () => {
            const result = await setupToStep4();

            const initialTotal = result.current.stats.total;
            act(() => { result.current.removeRow('row-1'); });

            expect(result.current.stagedTransactions.find(t => t.id === 'row-1')).toBeUndefined();
            expect(result.current.stats.total).toBe(initialTotal - 1);
        });

        it('startEditRow / cancelEditRow manages the editing row ID', async () => {
            const result = await setupToStep4();

            act(() => { result.current.startEditRow('row-2'); });
            expect(result.current.editingRowId).toBe('row-2');

            act(() => { result.current.cancelEditRow(); });
            expect(result.current.editingRowId).toBeNull();
        });

        it('updateRowField re-validates with the full rules, and the counters follow', async () => {
            const result = await setupToStep4();
            expect(result.current.stats.errors).toBe(1);

            act(() => { result.current.updateRowField('row-2', 'transactionDate', '2024-01-17'); });
            act(() => { result.current.updateRowField('row-2', 'amountPrimary', '10'); });

            const row = result.current.stagedTransactions.find(t => t.id === 'row-2')!;
            expect(row.errors.some(e => e.field === 'transactionDate' || e.field === 'amountPrimary')).toBe(false);
            expect(row.errors.every(e => Boolean(e.code))).toBe(true); // coded: no more "Invalid value" after an edit
            expect(result.current.stats.errors).toBe(result.current.stagedTransactions.filter(t => t.status === 'error').length);
            expect(result.current.stats.total).toBe(result.current.stagedTransactions.length);
        });

        it('lists the assets of the import and lets a draft asset be edited before confirming', async () => {
            vi.mocked(importService.parseFile).mockResolvedValueOnce({
                candidates: [
                    { ...mockStagedTransactions[0], parsed: { ...mockStagedTransactions[0].parsed, assetSymbol: 'NEAR', instrumentId: 'draft-near' } },
                ],
                stats: { total: 1, valid: 1, errors: 0, duplicates: 0, warnings: 0 },
                instruments: [],
            } as never);
            const draft = { id: 'draft-near', ownerId: 'u', name: 'NEAR', type: 'stock', marketIdentifier: { symbol: 'NEAR' }, isMarketReady: false, denominationCurrency: 'EUR', createdAt: '', updatedAt: '' } as never;
            stageInstrument(draft);
            const result = await setupToStep4();

            // the asset table is rebuilt from the rows
            act(() => { result.current.removeRow('nothing'); });
            expect(result.current.instruments.map(i => [i.instrument.marketIdentifier.symbol, i.isNew, i.rowCount])).toEqual([['NEAR', true, 1]]);
            expect(result.current.previewImportInstrumentIssues('draft-near', { isin: 'bad' }).some(i => i.code === 'INSTRUMENT_ISIN_INVALID')).toBe(true);

            await act(async () => { await result.current.updateImportInstrument('draft-near', { type: 'crypto', exchange: 'Bitget' }); });

            expect(result.current.instruments[0].instrument).toMatchObject({ type: 'crypto', marketIdentifier: { exchange: 'Bitget' } });
            expect(result.current.stagedTransactions[0].parsed.instrumentId).toBe('draft-near');
            await expect(act(async () => { await result.current.updateImportInstrument('draft-near', { isin: 'bad' }); })).rejects.toThrow();
        });

        it('importableTxCount counts only importable rows', async () => {
            const result = await setupToStep4();

            // row-1: valid/pending -> importable; row-2: error/skip -> not; row-3: duplicate/skip -> not
            expect(result.current.importableTxCount).toBe(1);

            act(() => { result.current.bulkSetResolution('duplicate', 'import'); });
            expect(result.current.importableTxCount).toBe(2);
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // NAVIGATION
    // ─────────────────────────────────────────────────────────────────────

    describe('Navigation', () => {
        it('goToStep navigates directly to specified step', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            act(() => { result.current.goToStep(3); });
            expect(result.current.step).toBe(3);
        });

        it('goBack decrements step and is bounded at 1', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            act(() => { result.current.goToStep(3); });
            act(() => { result.current.goBack(); });
            expect(result.current.step).toBe(2);

            act(() => { result.current.goBack(); });
            act(() => { result.current.goBack(); });
            expect(result.current.step).toBe(1); // Bounded at 1
        });

        it('reset clears state without losing institutes and templates', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            act(() => {
                result.current.selectInstitute('inst-1');
                result.current.selectAccount('acc-1');
                result.current.goToStep(4);
            });

            act(() => { result.current.reset(); });

            expect(result.current.step).toBe(1);
            expect(result.current.selectedInstituteId).toBeNull();
            expect(result.current.selectedAccountId).toBeNull();
            // Institutes & templates are preserved
            expect(result.current.institutes).toHaveLength(2);
            expect(result.current.mappingTemplates).toHaveLength(1);
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // RESILIENCE & EDGE CASES
    // ─────────────────────────────────────────────────────────────────────

    describe('Resilience & edge cases', () => {
        it('analyzeData failure shows error and stays on step 3', async () => {
            const { importService } = await import('../../../src/services/importService');
            vi.mocked(importService.parseFile).mockRejectedValueOnce(new Error('Parse failed'));

            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            act(() => {
                result.current.selectAccount('acc-1');
                result.current.goToStep(3);
                result.current.setMapping('transactionDate', 'Date');
                result.current.setMapping('amountPrimary', 'Amount');
                result.current.setMapping('assetSymbol', 'Symbol');
            });

            await act(async () => { await result.current.analyzeData(); });

            expect(result.current.step).toBe(3);
            expect(result.current.error).toBe('transactions:importWizard.errors.failedToAnalyzeData');
            expect(result.current.isLoading).toBe(false);
        });

        it('accounts load failure shows error message', async () => {
            const { accountService } = await import('../../../src/services/instituteService');
            vi.mocked(accountService.getAccountsByInstitute).mockRejectedValueOnce(new Error('DB error'));

            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            act(() => { result.current.selectInstitute('inst-1'); });

            await waitFor(() => expect(result.current.error).toBe(
                'transactions:importWizard.errors.failedToLoadAccounts'
            ));
        });

        it('goToStep clears any existing error', async () => {
            const { result } = renderHook(() => useImportWizard());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            // Force an error state
            await act(async () => { await result.current.analyzeData(); }); // No account -> error
            expect(result.current.error).not.toBeNull();

            act(() => { result.current.goToStep(2); });
            expect(result.current.error).toBeNull();
        });
    });
});
