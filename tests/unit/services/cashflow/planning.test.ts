/**
 * Budgets, end-of-month forecast, tax items and cash flow alerts (Epic E52 — TGLA-255..259), as pure calculations.
 */
import { describe, it, expect } from 'vitest';
import { budgetState, budgetStatuses, forecastPoints } from '../../../../src/services/cashflow/planning';
import { computeTaxItems, isAidOrganisation, type TaxItemOperation } from '../../../../src/services/cashflow/taxItems';
import { getHouseholdCreditRules } from '../../../../src/services/fiscal/taxRules';
import { isNewSeries } from '../../../../src/services/cashflow/cashflowAlerts';
import type { CashflowBudget, CashflowCategoryTotal } from '../../../../src/types/cashflow';

const budget = (categoryId: string, monthlyLimit: number): CashflowBudget => ({ id: categoryId, ownerId: 'u', categoryId, monthlyLimit, createdAt: '', updatedAt: '' });
const total = (categoryId: string, amount: number): CashflowCategoryTotal => ({
    categoryId, kind: 'expense', amount, share: 0, count: 1, averageMonthly: amount, deltaVsAverage: null, children: [],
});

describe('budgets', () => {
    it('is ok under 80 %, near from 80 %, over above the cap', () => {
        expect(budgetState(0.5)).toBe('ok');
        expect(budgetState(0.8)).toBe('near');
        expect(budgetState(1)).toBe('near');
        expect(budgetState(1.01)).toBe('over');
    });

    it('sets each budget against its category, the most used first', () => {
        const statuses = budgetStatuses(
            [budget('dining', 200), budget('groceries', 400), budget('travel', 300)],
            [total('dining', 230), total('groceries', 320)],
        );
        expect(statuses.map(s => [s.categoryId, s.state, s.remaining])).toEqual([
            ['dining', 'over', -30], ['groceries', 'near', 80], ['travel', 'ok', 300],
        ]);
    });
});

describe('end-of-month forecast', () => {
    it('draws the known days back from today, then projects expected operations and daily spending', () => {
        const points = forecastPoints({
            start: '2026-11-01', today: '2026-11-03', end: '2026-11-06', balanceToday: 1000,
            pastOperations: [{ date: '2026-11-02T10:00:00Z', amount: -100 }, { date: '2026-11-03T09:00:00Z', amount: 50 }],
            expected: [{ date: '2026-11-05', amount: -200 }],
            variablePerDay: 10,
        });
        expect(points).toEqual([
            { date: '2026-11-01', balance: 1050, projected: false },
            { date: '2026-11-02', balance: 950, projected: false },
            { date: '2026-11-03', balance: 1000, projected: false },
            { date: '2026-11-04', balance: 990, projected: true },
            { date: '2026-11-05', balance: 780, projected: true },
        ]);
    });
});

const op = (id: string, categoryId: string, amount: number, rawLabel: string, date = '2025-06-01'): TaxItemOperation => ({ id, date, amount, categoryId, rawLabel });

describe('tax items spotted in the cash flow', () => {
    it('reads the rules of each year, the latest known one for a later year, none before', () => {
        expect(getHouseholdCreditRules('2025')?.per.floor).toBe(4637);
        expect(getHouseholdCreditRules('2027')).toMatchObject({ year: '2027', per: { floor: 4710 } });
        expect(getHouseholdCreditRules('2020')).toBeUndefined();
    });

    it('recognises organisations helping people in need', () => {
        expect(isAidOrganisation('PRLV SEPA RESTOS DU COEUR DON')).toBe(true);
        expect(isAidOrganisation('DON WWF FRANCE')).toBe(false);
    });

    it('applies the 75 % rate within its cap, the rest at 66 % within 20 % of income', () => {
        const items = computeTaxItems({
            rules: getHouseholdCreditRules('2024')!,
            operations: [op('r', 'donations', -1200, 'RESTOS DU COEUR'), op('w', 'donations', -100, 'WWF'), op('x', 'dining', -50, 'CAFE')],
            perContributions: [],
            taxableIncome: 1000,
        });
        expect(items.find(i => i.kind === 'donations_aid')).toMatchObject({ paid: 1200, base: 1000, estimate: 750 });
        // 100 + 200 above the cap = 300, within 20 % of 1000 = 200
        expect(items.find(i => i.kind === 'donations')).toMatchObject({ paid: 300, base: 200, estimate: 132, cap: 200 });
    });

    it('raises the 75 % cap to 2,000 for 2025 donations from 14 October', () => {
        const rules = getHouseholdCreditRules('2025')!;
        const before = computeTaxItems({ rules, operations: [op('a', 'donations', -1500, 'SECOURS POPULAIRE', '2025-03-01')], perContributions: [] });
        const after = computeTaxItems({ rules, operations: [op('a', 'donations', -1500, 'SECOURS POPULAIRE', '2025-11-20')], perContributions: [] });
        expect(before.find(i => i.kind === 'donations_aid')?.cap).toBe(1000);
        expect(after.find(i => i.kind === 'donations_aid')).toMatchObject({ cap: 2000, base: 1500, estimate: 1125 });
    });

    it('home help and childcare at 50 % within their caps, the PER at the marginal rate', () => {
        const items = computeTaxItems({
            rules: getHouseholdCreditRules('2025')!,
            operations: [op('h', 'home_services', -13000, 'CESU'), op('c', 'childcare', -4000, 'CRECHE')],
            perContributions: [{ id: 'p', amount: 3000 }],
            marginalRate: 0.3,
        });
        expect(items.find(i => i.kind === 'home_services')).toMatchObject({ base: 12000, estimate: 6000 });
        expect(items.find(i => i.kind === 'childcare')).toMatchObject({ base: 3500, estimate: 1750 });
        expect(items.find(i => i.kind === 'per')).toMatchObject({ paid: 3000, estimate: 900, cap: 4637 });
    });

    it('finds nothing without such operations', () => {
        expect(computeTaxItems({ rules: getHouseholdCreditRules('2025')!, operations: [op('x', 'dining', -50, 'CAFE')], perContributions: [] })).toEqual([]);
    });
});

describe('cash flow alerts', () => {
    it('a series is new within three of its periods', () => {
        const now = Date.parse('2026-11-26T10:00:00Z');
        expect(isNewSeries({ firstDate: '2026-09-05', intervalDays: 30 }, now)).toBe(true);
        expect(isNewSeries({ firstDate: '2026-03-05', intervalDays: 30 }, now)).toBe(false);
    });
});
