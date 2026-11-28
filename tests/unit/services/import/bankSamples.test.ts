/**
 * The sample bank statements of test-data/bank (Epic E52), imported the way the assistant does it
 * (preview_transaction_import, then import_transactions): every operation file maps on its own into a checking or
 * savings account with no error, the rows are bank operations outside the tax engine, the bank's categories are
 * kept and the cash flow reads them; the balances file of the Livret A gives its balances.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../src/services/db', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../../src/services/db')>();
    return { ...actual, delay: () => Promise.resolve() };
});
vi.mock('../../../../src/services/priceService', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../../src/services/priceService')>();
    return { ...actual, refreshPositionPrices: vi.fn(async (positions: unknown) => positions) };
});

import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { importTransactionsTool, previewTransactionImportTool } from '../../../../src/services/ai/tools/importTools';
import { extractCashStatements } from '../../../../src/services/import/cashBalanceService';
import { ofxToCsv } from '../../../../src/services/import/ofxParser';
import { cashflowService } from '../../../../src/services/cashflow/cashflowService';
import { readBankHints } from '../../../../src/services/cashflow/bankHints';
import { readTestData, testDataFiles } from '../../../fixtures/testData';

const OPERATION_FILES: Record<string, { account: string; rows: number }> = {
    'boursobank_checking_2026.csv': { account: 'acc-cc', rows: 136 },
    'boursobank_official_2025.csv': { account: 'acc-cc', rows: 2 },
    'debit_credit_checking_2026.csv': { account: 'acc-cc', rows: 80 },
    'generic_debit_credit_2025.csv': { account: 'acc-cc', rows: 7 },
    'generic_statement_2025.ofx': { account: 'acc-cc', rows: 5 },
    'revolut_2026.csv': { account: 'acc-cc', rows: 20 },
    'livret_a_operations_2026.csv': { account: 'acc-livret', rows: 8 },
};

const csvOf = (name: string): string => (name.endsWith('.ofx') ? ofxToCsv(readTestData(name)) : readTestData(name));

beforeEach(async () => {
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('bank.samples@example.test', 'Bank-Samples-Test-Key-2026!#xx', 'Bank Samples');
    db.saveInstitutes([{ id: 'inst', ownerId: 'u', name: 'Banque', type: 'bank' } as never]);
    db.saveAccounts([
        { id: 'acc-cc', ownerId: 'u', instituteId: 'inst', name: 'Courant', type: 'checking', wrapperType: 'OTHER', defaultCurrency: 'EUR', isActive: true } as never,
        { id: 'acc-livret', ownerId: 'u', instituteId: 'inst', name: 'Livret A', type: 'savings', wrapperType: 'LIVRET', defaultCurrency: 'EUR', isActive: true } as never,
    ]);
    db.saveUnifiedTransactions([]);
    db.saveImportBatches([]);
});

describe('sample bank statements (test-data/bank)', () => {
    it('lists every sample file of the folder', () => {
        expect(testDataFiles('bank')).toEqual([...Object.keys(OPERATION_FILES), 'livret_a_balances_2026.csv'].sort());
    });

    it.each(Object.entries(OPERATION_FILES))('%s maps on its own with no error', async (name, expected) => {
        const preview = await previewTransactionImportTool.execute({ accountId: expected.account, csvText: csvOf(name), fileName: name });
        expect(preview.stats).toMatchObject({ total: expected.rows, errors: 0, importable: expected.rows });
    });

    it('a BoursoBank statement becomes bank operations with their categories, read by the cash flow', async () => {
        const name = 'boursobank_checking_2026.csv';
        const result = await importTransactionsTool.execute({ accountId: 'acc-cc', csvText: csvOf(name), fileName: name });
        expect(result.success).toBe(true);
        const rows = db.getUnifiedTransactionsByAccount('acc-cc');
        expect(rows).toHaveLength(136);
        expect(rows.every(row => row.isFiscal === false && (row.type === 'DEPOSIT' || row.type === 'WITHDRAW'))).toBe(true);
        const rent = rows.find(row => row.rawLabel?.includes('FONCIA'));
        expect(readBankHints(rent?.metadata)).toMatchObject({ category: 'Loyer', categoryParent: 'Logement' });

        const operations = await cashflowService.listOperations({ currency: 'EUR', start: '2026-05-01', end: '2026-11-01' });
        expect(operations).toHaveLength(136);
        expect(operations.find(op => op.rawLabel.includes('FONCIA'))?.categoryId).toBe('housing');
        expect(operations.find(op => op.rawLabel.includes('NETFLIX'))?.categoryId).toBe('subscriptions');
        // The same file again adds nothing
        await importTransactionsTool.execute({ accountId: 'acc-cc', csvText: csvOf(name), fileName: name });
        expect(db.getUnifiedTransactionsByAccount('acc-cc')).toHaveLength(136);
    });

    it('the Livret A balances file gives one balance per month', () => {
        const { statements, skipped } = extractCashStatements(readTestData('livret_a_balances_2026.csv'), 'Date', 'Solde');
        expect(skipped).toBe(0);
        expect(statements).toHaveLength(6);
        expect(Number(statements[statements.length - 1].balance)).toBe(6298.4);
    });
});
