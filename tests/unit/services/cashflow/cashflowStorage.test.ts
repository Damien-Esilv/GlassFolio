/**
 * Bank operations stored by year (TGLA-248) and the cash flow services on a real vault (TGLA-249):
 * the journal is read whole, only changed records are rewritten, a year of bank rows stays far below
 * the 5 MB record limit, and corrections, rules, manual entries and deletions persist.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../src/services/db', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../../src/services/db')>();
    return { ...actual, delay: () => Promise.resolve() };
});
vi.mock('../../../../src/services/currencyService', () => ({
    currencyService: { getExchangeRates: async (codes: string[]) => Object.fromEntries(codes.map(code => [code, 1])) },
}));

import { db, BANK_OPERATIONS_KEY_PREFIX } from '../../../../src/services/db';
import { appStorage } from '../../../../src/services/storage/appStorage';
import { VAULT_MAX_RECORD_BYTES } from '../../../../src/services/storage/vaultQuota';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { cashflowService } from '../../../../src/services/cashflow/cashflowService';
import { cashflowCategoryService } from '../../../../src/services/cashflow/cashflowCategoryService';
import type { UnifiedTransaction } from '../../../../src/types/types.backend';

const bankRow = (id: string, date: string, amount: string, label: string, accountId = 'acc-checking'): UnifiedTransaction => ({
    id, ownerId: 'u', accountId, instrumentId: 'instr-eur', batchId: 'b', rowHash: `h-${id}`,
    sourceOrigin: 'FILE', isSynthetic: false, isFiscal: false, sourceMode: 'history',
    transactionDate: date, type: amount.startsWith('-') ? 'WITHDRAW' : 'DEPOSIT', rawType: 'x', label, rawLabel: label,
    amountPrimary: amount, assetSymbol: 'EUR', priceUnit: '1', quantity: amount.replace('-', ''),
    createdAt: date, updatedAt: date, version: 1,
});

const tradeRow = (id: string): UnifiedTransaction => ({
    ...bankRow(id, '2025-06-01T10:00:00.000Z', '-500.00', 'BUY CW8', 'acc-pea'),
    type: 'BUY', assetSymbol: 'CW8', quantity: '1', isFiscal: true,
});

beforeEach(async () => {
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('cashflow@example.test', 'Cashflow-Test-Key-2026!#xx', 'Cashflow');
    db.saveInstitutes([{ id: 'inst', ownerId: 'u', name: 'BoursoBank', type: 'bank' } as never]);
    db.saveAccounts([
        { id: 'acc-checking', ownerId: 'u', instituteId: 'inst', name: 'Courant', type: 'checking', defaultCurrency: 'EUR', isActive: true } as never,
        { id: 'acc-pea', ownerId: 'u', instituteId: 'inst', name: 'PEA', type: 'investment', wrapperType: 'PEA', defaultCurrency: 'EUR', isActive: true } as never,
    ]);
});

describe('journal stored by year for bank operations (TGLA-248)', () => {
    it('stores checking rows per year, the rest in the main record, and reads them back whole', () => {
        const rows = [
            bankRow('a', '2025-12-30T10:00:00.000Z', '-10.00', 'CARTE MONOPRIX'),
            bankRow('b', '2026-01-02T10:00:00.000Z', '3250.00', 'VIR SALAIRE'),
            tradeRow('t'),
        ];
        db.saveUnifiedTransactions(rows);
        expect(db.getBankOperationKeys()).toEqual([`${BANK_OPERATIONS_KEY_PREFIX}2025`, `${BANK_OPERATIONS_KEY_PREFIX}2026`]);
        const main = JSON.parse(appStorage.getItem('glassfolio_unified_transactions') as string) as UnifiedTransaction[];
        expect(main.map(r => r.id)).toEqual(['t']);
        const read = db.getUnifiedTransactions();
        expect(read.map(r => r.id).sort()).toEqual(['a', 'b', 't']);
        const a = read.find(r => r.id === 'a');
        expect(a).toMatchObject({ isSynthetic: false, isFiscal: false, sourceMode: 'history', version: 1, amountPrimary: '-10.00' });
    });

    it('rewrites only the records that changed and removes emptied years', () => {
        db.saveUnifiedTransactions([bankRow('a', '2025-12-30T10:00:00.000Z', '-10.00', 'X'), bankRow('b', '2026-01-02T10:00:00.000Z', '-5.00', 'Y')]);
        const spy = vi.spyOn(appStorage, 'setItem');
        db.saveUnifiedTransactions([bankRow('a', '2025-12-30T10:00:00.000Z', '-10.00', 'X'), bankRow('b', '2026-01-02T10:00:00.000Z', '-6.00', 'Y')]);
        expect(spy.mock.calls.map(call => call[0])).toEqual([`${BANK_OPERATIONS_KEY_PREFIX}2026`]);
        spy.mockRestore();
        db.saveUnifiedTransactions([bankRow('b', '2026-01-02T10:00:00.000Z', '-6.00', 'Y')]);
        expect(db.getBankOperationKeys()).toEqual([`${BANK_OPERATIONS_KEY_PREFIX}2026`]);
    });

    it('keeps a busy year of bank operations far below the record limit', () => {
        const rows: UnifiedTransaction[] = [];
        for (let i = 0; i < 3000; i++) {
            const day = new Date(Date.UTC(2025, 0, 1) + (i % 365) * 86_400_000).toISOString();
            rows.push({ ...bankRow(`utx-${i}-${'x'.repeat(8)}`, day, '-42.17', 'CARTE 12/03 CARREFOUR CITY PARIS 15'), metadata: { bankHints: { category: 'Alimentation' } } });
        }
        db.saveUnifiedTransactions(rows);
        const size = new TextEncoder().encode(appStorage.getItem(`${BANK_OPERATIONS_KEY_PREFIX}2025`) as string).length;
        expect(size).toBeLessThan(VAULT_MAX_RECORD_BYTES / 2);
    });

    it('exports and clears the yearly records with the rest', () => {
        db.saveUnifiedTransactions([bankRow('a', '2025-12-30T10:00:00.000Z', '-10.00', 'X'), tradeRow('t')]);
        const exported = db.exportAll({ persistedOnly: true }).unifiedTransactions as UnifiedTransaction[];
        expect(exported.map(r => r.id).sort()).toEqual(['a', 't']);
        db.resetAccountDataToZero();
        expect(db.getBankOperationKeys()).toEqual([]);
        expect(db.getUnifiedTransactions()).toEqual([]);
    });
});

describe('cash flow services on a real vault (TGLA-249)', () => {
    beforeEach(() => {
        db.saveUnifiedTransactions([
            bankRow('salary', '2026-03-27T10:00:00.000Z', '3250.00', 'VIR SEPA RECU ACME SALAIRE'),
            bankRow('carrefour', '2026-03-12T10:00:00.000Z', '-42.00', 'CARTE 12/03 CARREFOUR CITY'),
            bankRow('mystery', '2026-03-14T10:00:00.000Z', '-19.00', 'CARTE 14/03 ZQXW SHOP'),
            bankRow('mystery-2', '2026-03-20T10:00:00.000Z', '-21.00', 'CARTE 20/03 ZQXW SHOP'),
        ]);
    });

    it('lists categorised operations and the uncategorised ones', async () => {
        const ops = await cashflowService.listOperations();
        expect(ops.map(o => o.id)).toEqual(['salary', 'mystery-2', 'mystery', 'carrefour']);
        expect(ops.find(o => o.id === 'salary')?.categoryId).toBe('salary');
        const unclassified = await cashflowService.listOperations({ uncategorizedOnly: true });
        expect(unclassified.map(o => o.id).sort()).toEqual(['mystery', 'mystery-2']);
    });

    it('recategorises with a rule that also catches similar operations', async () => {
        const result = await cashflowCategoryService.setCategory(['mystery'], 'shopping', { createRule: true });
        expect(result).toMatchObject({ success: true, value: { updated: 1 } });
        const rules = await cashflowCategoryService.listRules();
        expect(rules).toHaveLength(1);
        expect(rules[0]).toMatchObject({ categoryId: 'shopping', labelContains: 'ZQXW SHOP', direction: 'out' });
        const ops = await cashflowService.listOperations();
        expect(ops.find(o => o.id === 'mystery')).toMatchObject({ categoryId: 'shopping', categorySource: 'override' });
        expect(ops.find(o => o.id === 'mystery-2')).toMatchObject({ categoryId: 'shopping', categorySource: 'rule' });
    });

    it('creates, renames and deletes a custom category, moving its operations to the parent', async () => {
        const created = await cashflowCategoryService.createCategory('housing', 'Garage');
        expect(created.success).toBe(true);
        if (!created.success) return;
        expect((await cashflowCategoryService.createCategory('housing', 'garage')).success).toBe(false);
        expect((await cashflowCategoryService.createCategory('internal_transfer', 'Nope')).success).toBe(false);
        await cashflowCategoryService.setCategory(['mystery'], created.value.id);
        expect((await cashflowService.listOperations({ categoryId: 'housing' })).map(o => o.id)).toEqual(['mystery']);
        expect(await cashflowCategoryService.renameCategory(created.value.id, 'Box')).toEqual({ success: true, value: undefined });
        await cashflowCategoryService.deleteCategory(created.value.id);
        expect((await cashflowService.listOperations()).find(o => o.id === 'mystery')?.categoryId).toBe('housing');
    });

    it('edits labels, notes and exclusion, and refuses to move a synced operation', async () => {
        expect(await cashflowService.updateOperation('carrefour', { displayLabel: 'Courses', note: 'Anniversaire', excluded: true })).toEqual({ success: true, value: undefined });
        const op = (await cashflowService.listOperations()).find(o => o.id === 'carrefour');
        expect(op).toMatchObject({ label: 'Courses', note: 'Anniversaire', excluded: true });
        const synced = { ...bankRow('api', '2026-03-15T10:00:00.000Z', '-9.00', 'PRLV'), sourceOrigin: 'API' as const, externalId: 'ext-1' };
        db.saveUnifiedTransactions([...db.getUnifiedTransactions(), synced]);
        expect(await cashflowService.updateOperation('api', { amount: -12 })).toEqual({ success: false, error: 'synced_operation' });
        expect(await cashflowService.updateOperation('mystery', { amount: -25, date: '2026-03-15' })).toEqual({ success: true, value: undefined });
        expect(db.getUnifiedTransactions().find(r => r.id === 'mystery')).toMatchObject({ amountPrimary: '-25.00', type: 'WITHDRAW' });
    });

    it('records a manual operation and remembers a deleted synced one', async () => {
        const created = await cashflowService.recordManualOperation({ accountId: 'acc-checking', date: '2026-03-18', amount: -12.5, label: 'Marché', categoryId: 'groceries' });
        expect(created.success).toBe(true);
        expect((await cashflowService.recordManualOperation({ accountId: 'acc-checking', date: '2026-03-18', amount: 0, label: 'x' })).success).toBe(false);
        const ops = await cashflowService.listOperations();
        expect(ops.find(o => o.label === 'Marché')).toMatchObject({ amount: -12.5, categoryId: 'groceries', sourceOrigin: 'MANUAL' });

        const synced = { ...bankRow('api', '2026-03-15T10:00:00.000Z', '-9.00', 'PRLV'), sourceOrigin: 'API' as const, externalId: 'ext-1' };
        db.saveUnifiedTransactions([...db.getUnifiedTransactions(), synced]);
        expect(await cashflowService.deleteOperation('api')).toEqual({ success: true, value: undefined });
        expect(db.getCashflowTombstones()).toEqual([expect.objectContaining({ accountId: 'acc-checking', externalId: 'ext-1' })]);
        expect(db.getUnifiedTransactions().some(r => r.id === 'api')).toBe(false);
    });

    it('summarises a month', async () => {
        const summary = await cashflowService.getSummary({ preset: 'month', month: '2026-03', currency: 'EUR' });
        expect(summary.income).toBe(3250);
        expect(summary.expenses).toBe(82);
        expect(summary.months.at(-1)?.month).toBe('2026-03');
        expect(summary.uncategorizedCount).toBe(2);
    });

    it('saves settings within bounds and only known accounts', async () => {
        const saved = await cashflowCategoryService.saveSettings({ monthStartDay: 40, includedAccountIds: ['acc-checking', 'ghost'] });
        expect(saved.monthStartDay).toBe(28);
        expect(saved.includedAccountIds).toEqual(['acc-checking']);
    });
});
