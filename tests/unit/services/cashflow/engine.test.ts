import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { merchantKey, displayLabel, normalizeText, containsWords, merchantInitials } from '../../../../src/services/cashflow/text';
import { readBankHints, withBankHints } from '../../../../src/services/cashflow/bankHints';
import {
    categorizeOperation,
    detectTransfers,
    ruleMatches,
    sortRules,
    type CategorizerContext,
    type RawCashflowOperation,
} from '../../../../src/services/cashflow/categorizer';
import { buildCashflowOperations, toRawOperation } from '../../../../src/services/cashflow/operations';
import { budgetMonthOf, monthRange, summarizeCashflow } from '../../../../src/services/cashflow/aggregator';
import { detectRecurringSeries, priceChangeOf } from '../../../../src/services/cashflow/recurring';
import { budgetMonthBounds, canMoveForward, periodMonths, resolvePeriod, shiftPeriodAnchor } from '../../../../src/services/cashflow/period';
import type { CashflowOperation, CategorizationRule, CashflowSettings } from '../../../../src/types/cashflow';
import type { Account, UnifiedTransaction } from '../../../../src/types/types.backend';

const raw = (overrides: Partial<RawCashflowOperation>): RawCashflowOperation => {
    const rawLabel = overrides.rawLabel ?? 'CARTE 12/03 CARREFOUR CITY PARIS';
    const amount = overrides.amount ?? -42;
    return {
        id: 'op-1',
        accountId: 'acc-checking',
        date: '2026-03-12T10:00:00.000Z',
        currency: 'EUR',
        type: amount > 0 ? 'DEPOSIT' : 'WITHDRAW',
        hints: {},
        ...overrides,
        amount,
        rawLabel,
        direction: amount > 0 ? 'in' : 'out',
        normalizedLabel: normalizeText(rawLabel),
        merchantKey: merchantKey(rawLabel),
    };
};

const ctx = (overrides: Partial<CategorizerContext> = {}): CategorizerContext => ({
    annotations: new Map(),
    rules: [],
    transfers: new Map(),
    knownCategoryIds: new Set(['groceries', 'housing', 'dining', 'salary', 'home_services', 'custom-garage', 'savings_invested']),
    ...overrides,
});

const rule = (overrides: Partial<CategorizationRule>): CategorizationRule => ({
    id: 'rule-1',
    ownerId: 'u',
    categoryId: 'dining',
    labelContains: 'CARREFOUR',
    direction: 'any',
    source: 'user',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

describe('cash flow text helpers', () => {
    it('builds the same merchant key from different raw labels', () => {
        expect(merchantKey('CARTE 12/03 NETFLIX.COM AMSTERDAM')).toBe('NETFLIX COM');
        expect(merchantKey('CB NETFLIX COM 4X1234AB')).toBe('NETFLIX COM');
        expect(merchantKey('PRLV SEPA FREE MOBILE')).toBe('FREE MOBILE');
        expect(merchantKey('VIR PERMANENT VERS PEA BOURSOBANK')).toBe('PEA BOURSOBANK');
        expect(merchantKey('VIR SEPA RECU /DE ACME SAS /MOTIF SALAIRE')).toBe('ACME SAS');
    });

    it('turns bank labels into readable ones', () => {
        expect(displayLabel('CARTE 12/03 CARREFOUR CITY PARIS 15')).toBe('Carrefour City Paris');
        expect(displayLabel('PRLV SEPA EDF CLIENTS PARTICULIERS')).toBe('EDF Clients Particuliers');
        expect(displayLabel('PRLV SEPA DGFIP IMPOT PRELEVEMENT A LA SOURCE')).toBe('DGFIP Impot Prelevement');
        expect(merchantInitials('Netflix Com')).toBe('NC');
    });

    it('matches whole words only', () => {
        expect(containsWords('VIR VERS PEA BOURSO', 'PEA')).toBe(true);
        expect(containsWords('PEAGE A6 SANEF', 'PEA')).toBe(false);
    });

    it('reads bank hints defensively and merges new ones', () => {
        expect(readBankHints({ bankHints: { category: ' Alimentation ', txType: 42 } })).toEqual({ category: 'Alimentation' });
        expect(readBankHints({ bankHints: 'nope' })).toEqual({});
        expect(readBankHints(undefined)).toEqual({});
        expect(withBankHints({ keep: 1 }, { category: 'Loyer' })).toEqual({ keep: 1, bankHints: { category: 'Loyer' } });
        expect(withBankHints({ keep: 1 }, {})).toEqual({ keep: 1 });
    });
});

describe('cash flow categoriser', () => {
    it('follows the priority order: correction, transfer, rule, type, bank, keyword, fallback', () => {
        const op = raw({ hints: { category: 'Restaurants' } });
        const withAll = ctx({
            annotations: new Map([['op-1', { id: 'a', ownerId: 'u', transactionId: 'op-1', categoryId: 'housing', updatedAt: '' }]]),
            transfers: new Map([['op-1', 'internal_transfer']]),
            rules: [rule({})],
        });
        expect(categorizeOperation(op, withAll)).toEqual({ categoryId: 'housing', source: 'override' });
        expect(categorizeOperation(op, { ...withAll, annotations: new Map() })).toEqual({ categoryId: 'internal_transfer', source: 'transfer' });
        expect(categorizeOperation(op, ctx({ rules: [rule({})] }))).toEqual({ categoryId: 'dining', source: 'rule' });
        expect(categorizeOperation(op, ctx())).toEqual({ categoryId: 'dining', source: 'bank' });
        expect(categorizeOperation(raw({}), ctx())).toEqual({ categoryId: 'groceries', source: 'keyword' });
        expect(categorizeOperation(raw({ rawLabel: 'VIR SEPA RECU LEBONCOIN', amount: 40 }), ctx())).toEqual({ categoryId: 'other_income', source: 'fallback' });
        expect(categorizeOperation(raw({ rawLabel: 'CARTE ZXQW', amount: -4 }), ctx())).toEqual({ categoryId: 'other_expense', source: 'fallback' });
    });

    it('reads dividends and interest from the journal type', () => {
        const op = raw({ rawLabel: 'COUPON', amount: 30, type: 'INCOME', subType: 'INTEREST' });
        expect(categorizeOperation(op, ctx())).toEqual({ categoryId: 'investment_income', source: 'type' });
    });

    it('ignores a correction or rule pointing to a deleted category', () => {
        const stale = ctx({
            annotations: new Map([['op-1', { id: 'a', ownerId: 'u', transactionId: 'op-1', categoryId: 'deleted', updatedAt: '' }]]),
            rules: [rule({ categoryId: 'deleted' })],
        });
        expect(categorizeOperation(raw({}), stale).source).toBe('keyword');
    });

    it('applies keywords by direction and before generic ones', () => {
        expect(categorizeOperation(raw({ rawLabel: 'CARTE UBER EATS PARIS' }), ctx()).categoryId).toBe('dining');
        expect(categorizeOperation(raw({ rawLabel: 'CARTE UBER TRIP' }), ctx()).categoryId).toBe('transport');
        expect(categorizeOperation(raw({ rawLabel: 'PRLV SEPA DGFIP IMPOT' }), ctx()).categoryId).toBe('taxes');
        expect(categorizeOperation(raw({ rawLabel: 'VIR DGFIP REMBOURSEMENT IMPOT', amount: 200 }), ctx()).categoryId).toBe('benefits_refunds');
        expect(categorizeOperation(raw({ rawLabel: 'PRLV SEPA URSSAF CESU' }), ctx()).categoryId).toBe('home_services');
        expect(categorizeOperation(raw({ rawLabel: 'VIR VERS PEA BOURSOBANK', amount: -500 }), ctx()).categoryId).toBe('savings_invested');
        expect(categorizeOperation(raw({ rawLabel: 'CARTE PEAGE SANEF', amount: -12 }), ctx()).categoryId).toBe('transport');
        expect(categorizeOperation(raw({ rawLabel: 'RETRAIT DAB PARIS', amount: -40 }), ctx()).categoryId).toBe('cash_withdrawal');
    });

    it('uses the bank operation type when it alone tells the category', () => {
        expect(categorizeOperation(raw({ rawLabel: 'X', hints: { txType: 'withdrawal' } }), ctx())).toEqual({ categoryId: 'cash_withdrawal', source: 'bank' });
        expect(categorizeOperation(raw({ rawLabel: 'X', hints: { txType: 'card' } }), ctx()).source).toBe('fallback');
    });

    it('matches rules on text, account, direction and amount, most specific first', () => {
        const op = raw({ amount: -42 });
        expect(ruleMatches(rule({ minAmount: 50 }), op)).toBe(false);
        expect(ruleMatches(rule({ maxAmount: 40 }), op)).toBe(false);
        expect(ruleMatches(rule({ minAmount: 10, maxAmount: 50 }), op)).toBe(true);
        expect(ruleMatches(rule({ direction: 'in' }), op)).toBe(false);
        expect(ruleMatches(rule({ accountId: 'other' }), op)).toBe(false);
        expect(ruleMatches(rule({ labelContains: 'carrefour city' }), op)).toBe(true);
        const sorted = sortRules([rule({ id: 'generic' }), rule({ id: 'specific', accountId: 'acc-checking', categoryId: 'custom-garage' })]);
        expect(sorted[0].id).toBe('specific');
        expect(categorizeOperation(op, ctx({ rules: sorted })).categoryId).toBe('custom-garage');
    });

    it('pairs transfers between own accounts', () => {
        const ops = [
            raw({ id: 'out-livret', accountId: 'checking', amount: -150, date: '2026-03-28T10:00:00Z', rawLabel: 'VIR VERS LIVRET A' }),
            raw({ id: 'in-livret', accountId: 'livret', amount: 150, date: '2026-03-28T11:00:00Z', rawLabel: 'VIR DE COMPTE COURANT' }),
            raw({ id: 'out-pea', accountId: 'checking', amount: -600, date: '2026-03-27T10:00:00Z', rawLabel: 'VIR' }),
            raw({ id: 'in-pea', accountId: 'pea', amount: 600, date: '2026-03-29T10:00:00Z', rawLabel: 'DEPOT' }),
            raw({ id: 'back-from-pea', accountId: 'checking', amount: 900, date: '2026-04-10T10:00:00Z', rawLabel: 'VIR' }),
            raw({ id: 'out-pea-2', accountId: 'pea', amount: -900, date: '2026-04-09T10:00:00Z', rawLabel: 'RETRAIT' }),
            raw({ id: 'too-late', accountId: 'checking', amount: -77, date: '2026-05-01T10:00:00Z', rawLabel: 'VIR' }),
            raw({ id: 'too-late-in', accountId: 'livret', amount: 77, date: '2026-05-09T10:00:00Z', rawLabel: 'VIR' }),
        ];
        const transfers = detectTransfers(ops, {
            includedAccountIds: new Set(['checking', 'livret']),
            ownAccountIds: new Set(['checking', 'livret', 'pea']),
        });
        expect(transfers.get('out-livret')).toBe('internal_transfer');
        expect(transfers.get('in-livret')).toBe('internal_transfer');
        expect(transfers.get('out-pea')).toBe('savings_invested');
        expect(transfers.has('in-pea')).toBe(false);
        expect(transfers.get('back-from-pea')).toBe('internal_transfer');
        expect(transfers.has('too-late')).toBe(false);
    });

    it('recognises transfers between any of the user\'s institutions, not a fixed list of banks', () => {
        const scope = {
            includedAccountIds: new Set(['caisse', 'app', 'other-bank']),
            ownAccountIds: new Set(['caisse', 'app', 'other-bank', 'broker']),
            institutionOf: new Map([['caisse', normalizeText('Caisse d’Epargne')], ['app', normalizeText('Revolut')], ['other-bank', normalizeText('Hello bank')], ['broker', normalizeText('Trade Republic')]]),
        };
        const ops = [
            // A top-up booked 6 days apart on each side
            raw({ id: 'to-app', accountId: 'caisse', amount: -250, date: '2026-03-01T10:00:00Z', rawLabel: 'VIR SEPA REVOLUT' }),
            raw({ id: 'topped-up', accountId: 'app', amount: 250, date: '2026-03-07T10:00:00Z', rawLabel: 'Top-up by *1234' }),
            // The other leg not recorded: the line names another own institution
            raw({ id: 'to-hello', accountId: 'caisse', amount: -400, date: '2026-03-10T10:00:00Z', rawLabel: 'VIR VERS HELLO BANK' }),
            raw({ id: 'to-broker', accountId: 'caisse', amount: -300, date: '2026-03-12T10:00:00Z', rawLabel: 'VIREMENT TRADE REPUBLIC' }),
            // A top-up from a card not recorded: never income
            raw({ id: 'card-top-up', accountId: 'app', amount: 80, date: '2026-03-15T10:00:00Z', rawLabel: 'Rechargement par carte' }),
            // Fees naming the bank are not a transfer; a payment to a merchant through an app neither
            raw({ id: 'fees', accountId: 'caisse', amount: -2, date: '2026-03-20T10:00:00Z', rawLabel: 'FRAIS CAISSE D EPARGNE' }),
            raw({ id: 'shop', accountId: 'app', amount: -35, date: '2026-03-21T10:00:00Z', rawLabel: 'PAYPAL *ZALANDO' }),
        ];
        const transfers = detectTransfers(ops, scope);
        expect(transfers.get('to-app')).toBe('internal_transfer');
        expect(transfers.get('topped-up')).toBe('internal_transfer');
        expect(transfers.get('to-hello')).toBe('internal_transfer');
        expect(transfers.get('to-broker')).toBe('savings_invested');
        expect(transfers.get('card-top-up')).toBe('internal_transfer');
        expect(transfers.has('fees')).toBe(false);
        expect(transfers.has('shop')).toBe(false);
    });
});

const account = (id: string, type: Account['type'], currency = 'EUR'): Account => ({
    id, ownerId: 'u', instituteId: 'inst', name: id, type, defaultCurrency: currency, isActive: true, createdAt: '', updatedAt: '',
});

const row = (overrides: Partial<UnifiedTransaction>): UnifiedTransaction => ({
    id: 'tx',
    ownerId: 'u',
    accountId: 'checking',
    instrumentId: 'instr-eur',
    batchId: 'b',
    rowHash: '',
    sourceOrigin: 'FILE',
    isSynthetic: false,
    isFiscal: false,
    sourceMode: 'history',
    transactionDate: '2026-03-10T10:00:00.000Z',
    type: 'WITHDRAW',
    rawType: 'Debit',
    rawLabel: 'CARTE CARREFOUR',
    amountPrimary: '-10.00',
    assetSymbol: 'EUR',
    createdAt: '2026-03-10T10:00:00.000Z',
    updatedAt: '2026-03-10T10:00:00.000Z',
    version: 1,
    ...overrides,
});

const settings: CashflowSettings = { ownerId: 'u', includedAccountIds: null, includeInvestmentIncome: true, monthStartDay: 1, updatedAt: '' };

describe('journal → cash flow operations', () => {
    it('never counts adjustments, trades, synthetic rows or opening balances', () => {
        const acc = account('checking', 'checking');
        expect(toRawOperation(row({ type: 'BALANCE_ADJUSTMENT' }), acc)).toBeUndefined();
        expect(toRawOperation(row({ type: 'SNAPSHOT_ADJUSTMENT' }), acc)).toBeUndefined();
        expect(toRawOperation(row({ type: 'BUY', assetSymbol: 'AAPL' }), acc)).toBeUndefined();
        expect(toRawOperation(row({ isSynthetic: true }), acc)).toBeUndefined();
        expect(toRawOperation(row({ metadata: { openingBalance: true } }), acc)).toBeUndefined();
        expect(toRawOperation(row({ assetSymbol: 'BTC' }), acc)).toBeUndefined();
    });

    it('takes the direction from the type, then the sign', () => {
        const acc = account('checking', 'checking');
        expect(toRawOperation(row({ type: 'WITHDRAW', amountPrimary: '25' }), acc)?.amount).toBe(-25);
        expect(toRawOperation(row({ type: 'DEPOSIT', amountPrimary: '-25' }), acc)?.amount).toBe(25);
        expect(toRawOperation(row({ type: 'TRANSFER', subType: 'TRANSFER_OUT', amountPrimary: '25' }), acc)?.amount).toBe(-25);
        expect(toRawOperation(row({ type: 'TRANSFER', amountPrimary: '-8' }), acc)?.amount).toBe(-8);
    });

    it('counts checking and savings accounts by default, dividends from investment accounts, converts the currency', () => {
        const ops = buildCashflowOperations({
            journal: [
                row({ id: 'eur', amountPrimary: '-10.00' }),
                row({ id: 'usd', accountId: 'usd-savings', assetSymbol: 'USD', amountPrimary: '-10.00' }),
                row({ id: 'pea-buy', accountId: 'pea', type: 'BUY', assetSymbol: 'CW8', amountPrimary: '-500' }),
                row({ id: 'div', accountId: 'pea', type: 'INCOME', subType: 'DIVIDEND', assetSymbol: 'AAPL', originalCurrency: 'USD', amountPrimary: '20', rawLabel: 'AAPL dividend' }),
                row({ id: 'pea-cash', accountId: 'pea', type: 'DEPOSIT', amountPrimary: '300' }),
            ],
            accounts: [account('checking', 'checking'), account('usd-savings', 'savings', 'USD'), account('pea', 'investment')],
            institutes: [],
            settings,
            rules: [],
            annotations: [{ id: 'a', ownerId: 'u', transactionId: 'eur', displayLabel: 'Courses', excluded: true, note: 'n', updatedAt: '' }],
            customCategories: [],
            rates: { EUR: 1, USD: 0.9 },
        });
        const byId = new Map(ops.map(op => [op.id, op]));
        expect([...byId.keys()].sort()).toEqual(['div', 'eur', 'usd']);
        expect(byId.get('usd')?.amount).toBe(-9);
        expect(byId.get('div')?.categoryId).toBe('investment_income');
        expect(byId.get('eur')?.label).toBe('Courses');
        expect(byId.get('eur')?.excluded).toBe(true);
    });

    it('respects the included accounts setting and leaves dividends out when asked', () => {
        const ops = buildCashflowOperations({
            journal: [row({ id: 'a' }), row({ id: 'b', accountId: 'savings' }), row({ id: 'div', accountId: 'pea', type: 'INCOME', subType: 'DIVIDEND', amountPrimary: '5' })],
            accounts: [account('checking', 'checking'), account('savings', 'savings'), account('pea', 'investment')],
            institutes: [],
            settings: { ...settings, includedAccountIds: ['savings'], includeInvestmentIncome: false },
            rules: [], annotations: [], customCategories: [], rates: {},
        });
        expect(ops.map(o => o.id)).toEqual(['b']);
    });
});

const op = (overrides: Partial<CashflowOperation>): CashflowOperation => ({
    id: overrides.id ?? `op-${Math.random()}`,
    accountId: 'checking',
    accountName: 'Checking',
    instituteId: 'inst',
    instituteName: 'Bank',
    date: '2026-03-10T10:00:00.000Z',
    amount: -10,
    originalAmount: -10,
    currency: 'EUR',
    direction: (overrides.amount ?? -10) > 0 ? 'in' : 'out',
    label: 'Label',
    rawLabel: 'LABEL',
    merchantKey: 'LABEL',
    categoryId: 'groceries',
    categoryKind: 'expense',
    categorySource: 'keyword',
    excluded: false,
    sourceOrigin: 'FILE',
    editable: true,
    ...overrides,
});

describe('cash flow totals', () => {
    const base = { periodStart: '2026-03-01', periodEnd: '2026-04-01', currency: 'EUR' };

    it('computes income, expenses, savings, available and savings rate', () => {
        const summary = summarizeCashflow([
            op({ amount: 3000, categoryId: 'salary', categoryKind: 'income' }),
            op({ amount: -1000, categoryId: 'housing' }),
            op({ amount: -200, categoryId: 'groceries' }),
            op({ amount: 20, categoryId: 'groceries' }),
            op({ amount: -500, categoryId: 'savings_invested', categoryKind: 'savings' }),
            op({ amount: -150, categoryId: 'internal_transfer', categoryKind: 'transfer' }),
            op({ amount: -999, categoryId: 'groceries', excluded: true }),
            op({ amount: -50, categoryId: 'groceries', date: '2026-04-02T10:00:00Z' }),
            op({ amount: 30, categoryId: 'investment_income', categoryKind: 'income' }),
        ], base);
        expect(summary.income).toBe(3030);
        expect(summary.expenses).toBe(1180);
        expect(summary.savingsInvested).toBe(500);
        expect(summary.available).toBe(1350);
        expect(summary.savingsRate).toBeCloseTo((3030 - 1180) / 3030);
        expect(summary.passiveCoverage).toBeCloseTo(30 / 1180);
        expect(summary.categories.find(c => c.categoryId === 'groceries')?.amount).toBe(180);
    });

    it('rolls sub-categories up into their parent and keeps them as children', () => {
        const summary = summarizeCashflow([
            op({ amount: -160, categoryId: 'home_services' }),
            op({ amount: -950, categoryId: 'housing' }),
            op({ amount: -40, categoryId: 'garage' }),
        ], { ...base, customCategories: [{ id: 'garage', ownerId: 'u', parentId: 'housing', name: 'Garage', createdAt: '', updatedAt: '' }] });
        const housing = summary.categories.find(c => c.categoryId === 'housing');
        expect(housing?.amount).toBe(1150);
        expect(housing?.children.map(c => c.categoryId).sort()).toEqual(['garage', 'home_services']);
    });

    it('splits fixed and variable spending by month and buckets amounts', () => {
        const summary = summarizeCashflow([
            op({ id: 'rent', amount: -950, categoryId: 'housing' }),
            op({ id: 'shop', amount: -4, categoryId: 'groceries', date: '2026-03-16T10:00:00Z' }),
            op({ id: 'big', amount: -1500, categoryId: 'travel' }),
        ], { ...base, recurringIds: new Set(['rent']) });
        expect(summary.months).toHaveLength(1);
        expect(summary.months[0].fixedExpenses).toBe(950);
        expect(summary.months[0].variableExpenses).toBe(1504);
        expect(summary.distribution[0]).toMatchObject({ min: 0, max: 5, count: 1 });
        expect(summary.distribution[6]).toMatchObject({ min: 1000, max: null, count: 1 });
        // 2026-03-16 is a Monday; the average over the 5 Mondays of March 2026
        expect(summary.weekdays[0]).toBe(0.8);
    });

    it('balances the Sankey, with a "drawn from savings" source on a deficit', () => {
        const deficit = summarizeCashflow([
            op({ amount: 1000, categoryId: 'salary', categoryKind: 'income' }),
            op({ amount: -1300, categoryId: 'housing' }),
            op({ amount: -200, categoryId: 'taxes', merchantKey: 'DGFIP', label: 'DGFIP' }),
        ], base);
        const ids = deficit.sankey.nodes.map(n => n.id);
        expect(ids).toContain('source:from_savings');
        expect(ids).not.toContain('group:savings');
    });

    it('conserves every Sankey node (what flows in flows out)', () => {
        const arbitraryOp = fc.record({
            amount: fc.double({ min: 1, max: 5000, noNaN: true }).map(v => Math.round(v * 100) / 100),
            categoryId: fc.constantFrom('salary', 'other_income', 'housing', 'groceries', 'taxes', 'savings_invested', 'dining'),
            merchant: fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F'),
        });
        fc.assert(fc.property(fc.array(arbitraryOp, { minLength: 1, maxLength: 40 }), items => {
            const ops = items.map((item, index) => {
                const income = item.categoryId === 'salary' || item.categoryId === 'other_income';
                return op({
                    id: `p-${index}`,
                    amount: income ? item.amount : -item.amount,
                    categoryId: item.categoryId,
                    categoryKind: income ? 'income' : item.categoryId === 'savings_invested' ? 'savings' : 'expense',
                    merchantKey: item.merchant,
                    label: item.merchant,
                });
            });
            const { nodes, links } = summarizeCashflow(ops, base).sankey;
            nodes.forEach((node, index) => {
                const incoming = links.filter(l => l.target === index).reduce((s, l) => s + l.value, 0);
                const outgoing = links.filter(l => l.source === index).reduce((s, l) => s + l.value, 0);
                if (node.kind === 'income' || node.kind === 'group') {
                    expect(Math.abs(incoming - outgoing)).toBeLessThan(0.05);
                }
            });
        }), { numRuns: 120 });
    });

    it('assigns budget months with a custom start day', () => {
        expect(budgetMonthOf('2026-03-24', 25)).toBe('2026-02');
        expect(budgetMonthOf('2026-03-25', 25)).toBe('2026-03');
        expect(budgetMonthOf('2026-01-03', 5)).toBe('2025-12');
        expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    });
});

describe('recurring series', () => {
    const monthly = (merchant: string, amounts: number[], extra: Partial<CashflowOperation> = {}): CashflowOperation[] =>
        amounts.map((amount, index) => op({
            id: `${merchant}-${index}`,
            amount,
            merchantKey: merchant,
            label: merchant,
            date: new Date(Date.UTC(2026, index, 15)).toISOString(),
            ...extra,
        }));

    it('finds monthly subscriptions and their price rise', () => {
        const series = detectRecurringSeries(monthly('NETFLIX', [-13.49, -13.49, -13.49, -13.49, -15.99, -15.99]));
        expect(series).toHaveLength(1);
        expect(series[0].cadence).toBe('monthly');
        expect(series[0].priceChange).toBeCloseTo(0.1853, 3);
        expect(series[0].nextDate).toBe('2026-07-15');
    });

    it('ignores irregular amounts, too few occurrences, transfers and dismissed series', () => {
        expect(detectRecurringSeries(monthly('PHARMA', [-12, -41, -18, -33, -25]))).toHaveLength(0);
        expect(detectRecurringSeries(monthly('NEW', [-9.99, -9.99]))).toHaveLength(0);
        expect(detectRecurringSeries(monthly('LIVRET', [-150, -150, -150], { categoryKind: 'transfer' }))).toHaveLength(0);
        expect(detectRecurringSeries(monthly('GYM', [-30, -30, -30]), { dismissedKeys: new Set(['out:GYM']) })).toHaveLength(0);
    });

    it('reports a price change only after a steady price', () => {
        expect(priceChangeOf([10, 10, 12])).toBeCloseTo(0.2);
        expect(priceChangeOf([10, 11, 12])).toBeNull();
        expect(priceChangeOf([10, 10, 10])).toBeNull();
    });
});

describe('periods', () => {
    const today = new Date('2026-11-24T12:00:00Z');

    it('resolves month, rolling and year-to-date periods, the trend covering the period and at least 6 months', () => {
        expect(resolvePeriod({ preset: 'month', today })).toEqual({ start: '2026-11-01', end: '2026-11-25', trendStart: '2026-06-01' });
        expect(resolvePeriod({ preset: 'month', month: '2026-09', today })).toMatchObject({ start: '2026-09-01', end: '2026-10-01' });
        expect(resolvePeriod({ preset: '3m', today })).toMatchObject({ start: '2026-09-01', end: '2026-11-25', trendStart: '2026-06-01' });
        expect(resolvePeriod({ preset: '12m', today })).toMatchObject({ start: '2025-12-01', trendStart: '2025-12-01' });
        expect(resolvePeriod({ preset: 'ytd', today })).toMatchObject({ start: '2026-01-01', trendStart: '2026-01-01' });
        expect(resolvePeriod({ preset: 'all', firstOperationDate: '2024-05-03T10:00:00Z', today })).toMatchObject({ start: '2024-05-03', trendStart: '2024-05-03' });
    });

    it('anchors 3, 6 and 12-month windows and years on the chosen month', () => {
        expect(resolvePeriod({ preset: '3m', month: '2026-07', today })).toMatchObject({ start: '2026-05-01', end: '2026-08-01' });
        expect(resolvePeriod({ preset: '12m', month: '2025-12', today })).toMatchObject({ start: '2025-01-01', end: '2026-01-01' });
        expect(resolvePeriod({ preset: 'ytd', month: '2025-03', today })).toMatchObject({ start: '2025-01-01', end: '2026-01-01', trendStart: '2025-01-01' });
        expect(resolvePeriod({ preset: 'ytd', month: '2026-03', today })).toMatchObject({ start: '2026-01-01', end: '2026-11-25' });
        // Never past today
        expect(resolvePeriod({ preset: '6m', month: '2027-02', today })).toMatchObject({ start: '2026-06-01', end: '2026-11-25' });
    });

    it('moves the period carousel by one block of the chosen period', () => {
        const current = '2026-11';
        expect(shiftPeriodAnchor('month', '2026-11', -1, current)).toBe('2026-10');
        expect(shiftPeriodAnchor('3m', '2026-11', -1, current)).toBe('2026-08');
        expect(shiftPeriodAnchor('6m', '2026-05', 1, current)).toBe('2026-11');
        expect(shiftPeriodAnchor('12m', '2026-08', 1, current)).toBe('2026-11');
        expect(shiftPeriodAnchor('ytd', '2026-11', -1, current)).toBe('2025-12');
        expect(shiftPeriodAnchor('ytd', '2025-12', 1, current)).toBe('2026-11');
        expect(canMoveForward('3m', '2026-11', current)).toBe(false);
        expect(canMoveForward('ytd', '2025-12', current)).toBe(true);
        expect(periodMonths('3m', '2026-11', current)).toEqual({ first: '2026-09', last: '2026-11' });
        expect(periodMonths('ytd', '2025-06', current)).toEqual({ first: '2025-01', last: '2025-12' });
        expect(periodMonths('ytd', '2026-11', current)).toEqual({ first: '2026-01', last: '2026-11' });
    });

    it('moves the month bounds with the start day', () => {
        expect(budgetMonthBounds('2026-02', 25)).toEqual({ start: '2026-02-25', end: '2026-03-25' });
        expect(budgetMonthBounds('2026-02', 31)).toEqual({ start: '2026-02-28', end: '2026-03-28' });
    });
});
