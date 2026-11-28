/**
 * Bank operations of checking accounts through Woob (Epic E52 — TGLA-254), end to end with a fake worker:
 * the first sync reads 12 months and lands on the bank's balance with no adjustment counted; the next ones read the
 * last 45 days again, follow what the bank booked, fixed or cancelled (keeping the user's note), and keep what the
 * bank no longer shows; a deleted operation never comes back; a refused history still syncs the balance; one
 * account can stop syncing and go, the others keep syncing; a bank removed keeps its history when asked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../src/services/db', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../../src/services/db')>();
    return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { connectionService, syncEngine } from '../../../../src/services/connectors';
import { clearWoobRunCache } from '../../../../src/services/connectors/sources/woob';
import { shiftDay } from '../../../../src/services/connectors/cashHistory';
import { computeRowHash } from '../../../../src/services/core/transactionManager';
import { cashflowService } from '../../../../src/services/cashflow/cashflowService';
import { accountManagementService } from '../../../../src/services/accountManagementService';
import { portfolioService } from '../../../../src/services/portfolioService';
import { instrumentService } from '../../../../src/services/instrumentService';
import type { WoobOperation } from '../../../../src/services/connectors/woobClient';

const TODAY = new Date().toISOString().slice(0, 10);
const day = (offset: number): string => shiftDay(TODAY, offset);
const yearAgo = (): string => {
    const date = new Date();
    date.setUTCMonth(date.getUTCMonth() - 12);
    return date.toISOString().slice(0, 10);
};

const op = (id: string, offset: number, amount: string, label: string, extra: Partial<WoobOperation> = {}): WoobOperation => ({
    id, date: day(offset), bookingDate: day(offset), valueDate: null, amount, label, raw: label, type: 'card', category: null, ...extra,
});

const SALARY = op('h-salary', -60, '3000.00', 'VIR SEPA ACME SALAIRE', { type: 'transfer', category: 'Salaires' });
const RENT = op('h-rent', -55, '-950.00', 'PRLV SEPA FONCIA LOYER', { type: 'order' });
const GROCERIES = op('h-groceries', -20, '-120.50', 'CARTE 05/11 CARREFOUR CITY', { category: 'Alimentation' });
const COFFEE = op('h-coffee-pending', -2, '-4.50', 'CARTE X1234 CAFE DU COIN');
const NETFLIX = op('h-netflix', -10, '-13.49', 'PRLV SEPA NETFLIX');
const COMING = op('h-coming', 0, '-42.00', 'CARTE X1234 SNCF');

const PEA = {
    id: 'pea-1', label: 'PEA', type: 'investment', wrapper: 'PEA', kind: 'investment', currency: 'EUR', balance: '12.34', warnings: [],
    holdings: [{ kind: 'cash', name: 'Liquidités', currency: 'EUR', quantity: '12.34', marketValue: '12.34' }],
};

const checking = (balance: string, transactions: WoobOperation[] | null, coming: WoobOperation[] = [], historyWarnings?: string[]) => ({
    id: 'cc-1', label: 'Compte courant', type: 'checking', wrapper: null, kind: 'cash', currency: 'EUR', balance, warnings: [],
    holdings: [{ kind: 'cash', name: 'Compte courant', currency: 'EUR', quantity: balance, marketValue: balance }],
    transactions, coming, ...(historyWarnings ? { historyWarnings } : {}),
});

interface Sent { url: string; body: Record<string, unknown> }

const bank = (sent: Sent[], accounts: () => unknown[]) => vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    sent.push({ url, body });
    return new Response(JSON.stringify({ ok: true, result: { accounts: accounts(), cached: false } }), { status: 200 });
});

const seed = async (): Promise<void> => {
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('woob.history@example.test', 'Woob-History-Key-2026!#xx', 'Woob History');
    db.saveInstitutes([{ id: 'inst-bourso', ownerId: 'u', name: 'BoursoBank', type: 'bank' } as never]);
    db.saveAccounts([
        { id: 'acc-courant', ownerId: 'u', instituteId: 'inst-bourso', name: 'Courant', type: 'checking', defaultCurrency: 'EUR', isActive: true } as never,
        { id: 'acc-pea', ownerId: 'u', instituteId: 'inst-bourso', name: 'PEA', type: 'investment', wrapperType: 'PEA', defaultCurrency: 'EUR', isActive: true } as never,
    ]);
};

const connect = (cashHistory = true) => connectionService.createConnection({
    sourceId: 'woob', label: 'BoursoBank', credentials: { login: '12345678', password: 'secret-Passw0rd' },
    publicParams: { module: 'boursorama' }, accountMap: { 'cc-1': 'acc-courant', 'pea-1': 'acc-pea' }, cashHistory,
});

const rows = () => db.getUnifiedTransactionsByAccount('acc-courant');
const balance = async (): Promise<number> => {
    await portfolioService.recalculatePositions();
    return db.getPositions().filter(position => position.accountId === 'acc-courant' && position.symbol === 'EUR').reduce((sum, position) => sum + position.quantity, 0);
};

describe('Woob bank operations (TGLA-254)', () => {
    beforeEach(async () => {
        clearWoobRunCache();
        await seed();
    });
    afterEach(() => vi.unstubAllGlobals());

    it('first sync: 12 months of operations, an opening balance, the bank balance, the coming ones apart', async () => {
        const sent: Sent[] = [];
        vi.stubGlobal('fetch', bank(sent, () => [checking('2500.00', [SALARY, RENT, GROCERIES, COFFEE, NETFLIX], [COMING]), PEA]));
        const connection = await connect();

        const report = await syncEngine.runSync(connection.id, { deepHistory: true });
        expect(report.status).toBe('ok');
        expect(sent.filter(call => call.url === '/api/woob/holdings')).toHaveLength(1);
        expect(sent[0].body.history).toEqual({ since: yearAgo() });

        const operations = rows().filter(row => row.sourceOrigin === 'API' && row.type !== 'BALANCE_ADJUSTMENT');
        expect(operations).toHaveLength(5);
        expect(operations.every(row => row.isFiscal === false)).toBe(true);
        const salary = operations.find(row => row.externalId === 'h-salary');
        expect(salary).toMatchObject({ type: 'DEPOSIT', subType: 'TRANSFER_IN', amountPrimary: '3000.00', rawLabel: 'VIR SEPA ACME SALAIRE' });
        expect(salary?.metadata?.bankHints).toEqual({ category: 'Salaires', txType: 'transfer' });
        expect(salary?.transactionDate).toBe(`${day(-60)}T00:00:00.000Z`);

        // 2500 − (3000 − 950 − 120.50 − 4.50 − 13.49) = 588.49, the day before the oldest operation
        const opening = rows().find(row => row.metadata?.openingBalance === true);
        expect(opening).toMatchObject({ type: 'BALANCE_ADJUSTMENT', amountPrimary: '588.49', transactionDate: `${day(-61)}T00:00:00.000Z` });
        expect(await balance()).toBeCloseTo(2500, 2);
        expect(rows().filter(row => row.type === 'BALANCE_ADJUSTMENT')).toHaveLength(1);

        const flow = await cashflowService.listOperations({ currency: 'EUR' });
        expect(flow.map(item => item.id).sort()).toEqual(operations.map(row => row.id).sort());

        expect(db.getCashflowUpcoming()).toEqual([expect.objectContaining({ accountId: 'acc-courant', externalId: 'h-coming', amount: '-42.00' })]);
        const stored = await connectionService.getConnection(connection.id);
        expect(stored?.cursor['cc-1']).toMatchObject({ operationsFrom: yearAgo() });
        // The five operations; the opening balance is not an operation
        expect(report.accounts.find(account => account.accountId === 'acc-courant')).toMatchObject({ imported: 5, upcoming: 1 });
    });

    it('next syncs read the last 45 days, follow the bank and keep what it no longer shows', async () => {
        const sent: Sent[] = [];
        let accounts = [checking('2500.00', [SALARY, RENT, GROCERIES, COFFEE, NETFLIX], [COMING]), PEA];
        vi.stubGlobal('fetch', bank(sent, () => accounts));
        const connection = await connect();
        await syncEngine.runSync(connection.id, { deepHistory: true });
        const coffee = rows().find(row => row.externalId === 'h-coffee-pending');
        expect((await cashflowService.updateOperation(coffee!.id, { note: 'Avec Paul' })).success).toBe(true);

        // Coffee booked under a new id and label, Netflix cancelled, a new payment; salary and rent no longer shown
        const BOOKED = op('h-coffee-booked', -2, '-4.50', 'CARTE 23/11 CAFE DU COIN PARIS');
        const BAKERY = op('h-bakery', -1, '-30.00', 'CARTE BOULANGERIE');
        accounts = [checking('2483.49', [GROCERIES, BOOKED, BAKERY]), PEA];
        const report = await syncEngine.runSync(connection.id);
        expect(sent.at(-1)?.body.history).toEqual({ since: day(-45) });
        expect(report.accounts.find(account => account.accountId === 'acc-courant')).toMatchObject({ imported: 1, updated: 1, removed: 1 });

        const after = rows();
        const booked = after.find(row => row.id === coffee!.id);
        expect(booked).toMatchObject({ externalId: 'h-coffee-booked', rawLabel: 'CARTE 23/11 CAFE DU COIN PARIS' });
        expect(db.getCashflowAnnotations().find(annotation => annotation.transactionId === coffee!.id)?.note).toBe('Avec Paul');
        expect(after.some(row => row.externalId === 'h-netflix')).toBe(false);
        expect(after.some(row => row.externalId === 'h-salary')).toBe(true);
        expect(after.some(row => row.externalId === 'h-rent')).toBe(true);
        expect(await balance()).toBeCloseTo(2483.49, 2);
        expect(after.filter(row => row.type === 'BALANCE_ADJUSTMENT')).toHaveLength(1);
        // The coming list follows the bank: nothing announced any more
        expect(db.getCashflowUpcoming()).toEqual([]);
    });

    it('an operation the user deleted does not come back', async () => {
        vi.stubGlobal('fetch', bank([], () => [checking('2500.00', [SALARY, RENT, GROCERIES, COFFEE, NETFLIX]), PEA]));
        const connection = await connect();
        await syncEngine.runSync(connection.id, { deepHistory: true });
        const netflix = rows().find(row => row.externalId === 'h-netflix');
        expect((await cashflowService.deleteOperation(netflix!.id)).success).toBe(true);
        clearWoobRunCache();
        await syncEngine.runSync(connection.id);
        expect(rows().some(row => row.externalId === 'h-netflix')).toBe(false);
    });

    it('the same operation imported from a statement first is not doubled', async () => {
        const date = `${day(-20)}T00:00:00.000Z`;
        const eur = await instrumentService.findOrCreateInstrument({ symbol: 'EUR', currencyCode: 'EUR', type: 'cash', denominationCurrency: 'EUR' });
        db.saveUnifiedTransactions([{
            id: 'utx-file', ownerId: 'u', accountId: 'acc-courant', instrumentId: eur.id, batchId: 'batch-file',
            rowHash: await computeRowHash(date, '-120.50', '', 'WITHDRAW'), sourceOrigin: 'FILE', isSynthetic: false, isFiscal: false,
            sourceMode: 'history', transactionDate: date, type: 'WITHDRAW', rawType: 'Debit', label: 'Carrefour City',
            rawLabel: 'CARTE 05/11 CARREFOUR CITY', amountPrimary: '-120.50', assetSymbol: 'EUR', quantity: '120.50', priceUnit: '1',
            createdAt: date, updatedAt: date, version: 1,
        }]);
        vi.stubGlobal('fetch', bank([], () => [checking('2500.00', [SALARY, RENT, GROCERIES]), PEA]));
        const connection = await connect();
        const report = await syncEngine.runSync(connection.id, { deepHistory: true });
        expect(report.accounts.find(account => account.accountId === 'acc-courant')?.skippedDuplicates).toBe(1);
        expect(rows().filter(row => row.amountPrimary === '-120.50')).toHaveLength(1);
        expect(await balance()).toBeCloseTo(2500, 2);
    });

    it('a bank refusing the history still syncs the balance, and tries again next time', async () => {
        vi.stubGlobal('fetch', bank([], () => [checking('1800.00', null, [], ['history_failed']), PEA]));
        const connection = await connect();
        const report = await syncEngine.runSync(connection.id, { deepHistory: true });
        expect(report.status).toBe('ok');
        expect(report.accounts.find(account => account.accountId === 'acc-courant')?.historyWarnings).toEqual(['history_failed']);
        expect(rows().filter(row => row.type === 'DEPOSIT' || row.type === 'WITHDRAW')).toHaveLength(0);
        expect(await balance()).toBeCloseTo(1800, 2);
        expect((await connectionService.getConnection(connection.id))?.cursor['cc-1']?.operationsFrom).toBeUndefined();
    });

    it('an overdraft on the way still ends on the bank balance, the operations alone in the cash flow', async () => {
        // Opening 300, −500 (overdrawn), +300: the journal holds no negative cash, the reconciliation settles it
        const OUT = op('h-out', -30, '-500.00', 'PRLV SEPA IMPOTS');
        const IN = op('h-in', -10, '300.00', 'VIR SEPA REMBOURSEMENT', { type: 'transfer' });
        vi.stubGlobal('fetch', bank([], () => [checking('100.00', [OUT, IN]), PEA]));
        const connection = await connect();
        await syncEngine.runSync(connection.id, { deepHistory: true });
        expect(rows().find(row => row.metadata?.openingBalance === true)?.amountPrimary).toBe('300.00');
        expect(await balance()).toBeCloseTo(100, 2);
        expect((await cashflowService.listOperations({ currency: 'EUR' })).map(item => item.amount).sort()).toEqual([-500, 300]);
    });

    it('an account overdrawn at the bank shows its negative balance, the opening below zero too', async () => {
        vi.stubGlobal('fetch', bank([], () => [checking('-200.00', [GROCERIES]), PEA]));
        const connection = await connect();
        await syncEngine.runSync(connection.id, { deepHistory: true });
        expect(rows().find(row => row.metadata?.openingBalance === true)?.amountPrimary).toBe('-79.50');
        expect(await balance()).toBeCloseTo(-200, 2);
        expect(rows().filter(row => row.type === 'BALANCE_ADJUSTMENT')).toHaveLength(1);
        expect((await cashflowService.listOperations({ currency: 'EUR' })).map(item => item.amount)).toEqual([-120.5]);
    });

    it('a deferred-debit card shows each payment, its monthly total is a transfer, the balance stays the bank\'s', async () => {
        const SUMMARY = op('h-card-total', -5, '-51.90', 'RELEVE CARTE DIFFEREE', { type: 'card_summary' });
        const cardPayments = [
            op('card-1-a', -25, '-42.00', 'CARTE 01/11 FNAC', { type: 'deferred_card' }),
            op('card-1-b', -24, '-9.90', 'CARTE 02/11 CINEMA', { type: 'deferred_card' }),
        ];
        // Bank balance: 3000 − 950 − 51.90 (the card total is what the bank debits)
        vi.stubGlobal('fetch', bank([], () => [{ ...checking('1998.10', [SALARY, RENT, SUMMARY]), cardTransactions: cardPayments }, PEA]));
        const connection = await connect();
        await syncEngine.runSync(connection.id, { deepHistory: true });
        const card = rows().filter(row => row.externalId?.startsWith('card-1-'));
        expect(card.map(row => row.type)).toEqual(['EXPENSE', 'EXPENSE']);
        expect(await balance()).toBeCloseTo(1998.10, 2);
        expect(rows().filter(row => row.type === 'BALANCE_ADJUSTMENT')).toHaveLength(1);
        const flow = await cashflowService.listOperations({ currency: 'EUR' });
        expect(flow.find(item => item.rawLabel === 'RELEVE CARTE DIFFEREE')?.categoryId).toBe('internal_transfer');
        expect(flow.filter(item => item.rawLabel.startsWith('CARTE 0')).map(item => item.amount).sort()).toEqual([-42, -9.9]);
    });

    it('a connection made before keeps reading balances only', async () => {
        const sent: Sent[] = [];
        vi.stubGlobal('fetch', bank(sent, () => [checking('2500.00', [SALARY]), PEA]));
        const connection = await connectionService.createConnection({
            sourceId: 'woob', label: 'BoursoBank', credentials: { login: '1' }, publicParams: { module: 'boursorama' },
            accountMap: { 'cc-1': 'acc-courant' },
        });
        await syncEngine.runSync(connection.id, { deepHistory: true });
        expect(sent[0].body.history).toBeUndefined();
        expect(rows().some(row => row.externalId === 'h-salary')).toBe(false);
        expect(await balance()).toBeCloseTo(2500, 2);
    });

    it('one account stops syncing and goes; the others keep syncing', async () => {
        vi.stubGlobal('fetch', bank([], () => [checking('2500.00', [SALARY]), PEA]));
        const connection = await connect();
        await syncEngine.runSync(connection.id, { deepHistory: true });
        expect((await accountManagementService.deleteAccount('acc-courant')).error).toBe('synced');
        expect((await accountManagementService.deleteAccount('acc-courant', { stopSync: true })).success).toBe(true);
        expect(db.getAccountById('acc-courant')).toBeFalsy();
        expect(rows()).toHaveLength(0);
        const stored = await connectionService.getConnection(connection.id);
        expect(stored?.accountMap).toEqual({ 'pea-1': 'acc-pea' });
        expect(db.getUnifiedTransactionsByAccount('acc-pea').length).toBeGreaterThan(0);
    });

    it('a bank removed keeps its history when asked', async () => {
        vi.stubGlobal('fetch', bank([], () => [checking('2500.00', [SALARY, RENT], [COMING]), PEA]));
        const connection = await connect();
        await syncEngine.runSync(connection.id, { deepHistory: true });
        const before = rows().length;
        await syncEngine.removeConnection(connection.id, { keepHistory: true });
        expect(await connectionService.getConnection(connection.id)).toBeNull();
        expect(rows()).toHaveLength(before);
        expect(db.getAccountById('acc-courant')).toBeTruthy();
        expect(db.getCashflowUpcoming()).toEqual([]);
    });
});
