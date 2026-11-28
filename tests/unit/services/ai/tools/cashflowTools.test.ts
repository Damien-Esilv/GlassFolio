/**
 * Unit Tests — cashflowTools.ts (Epic E52 — TGLA-252)
 *
 * Reads run without confirmation; every change asks for it, validates its arguments and reports
 * service errors without throwing. Nothing deletes data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../src/services/cashflow/cashflowService', () => ({
    cashflowService: {
        getSummary: vi.fn(),
        listOperations: vi.fn(),
        listUpcoming: vi.fn(),
        listRecurring: vi.fn(),
        setRecurringStatus: vi.fn(),
        updateOperation: vi.fn(),
        recordManualOperation: vi.fn(),
    },
}));
vi.mock('../../../../../src/services/cashflow/cashflowPlanningService', () => ({
    cashflowPlanningService: { getBudgetStatus: vi.fn(), setBudget: vi.fn(), getForecast: vi.fn(), getTaxItems: vi.fn() },
}));
vi.mock('../../../../../src/services/repositories', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../../../src/services/repositories')>();
    return { ...actual, userRepository: { ...actual.userRepository, getUser: vi.fn().mockResolvedValue({ preferences: { fiscalProfile: { estimatedTMI: 30 } } }) } };
});
vi.mock('../../../../../src/services/cashflow/cashflowCategoryService', () => ({
    cashflowCategoryService: {
        listCategories: vi.fn(),
        listRules: vi.fn(),
        setCategory: vi.fn(),
        createCategory: vi.fn(),
        createRule: vi.fn(),
    },
}));

import {
    getCashflowSummaryTool,
    listCashflowTransactionsTool,
    listCashflowCategoriesTool,
    listCashflowRulesTool,
    listUpcomingOperationsTool,
    listRecurringExpensesTool,
    setRecurringStatusTool,
    getBudgetStatusTool,
    setBudgetTool,
    getCashflowForecastTool,
    getCashflowTaxItemsTool,
    updateCashflowOperationTool,
    setTransactionCategoryTool,
    createCashflowCategoryTool,
    createCategorizationRuleTool,
    recordCashOperationTool,
} from '../../../../../src/services/ai/tools/cashflowTools';
import { aiToolRegistry } from '../../../../../src/services/ai/aiToolRegistry';
import '../../../../../src/services/ai/tools';
import { cashflowService } from '../../../../../src/services/cashflow/cashflowService';
import { cashflowCategoryService } from '../../../../../src/services/cashflow/cashflowCategoryService';
import { cashflowPlanningService } from '../../../../../src/services/cashflow/cashflowPlanningService';

const planning = cashflowPlanningService as unknown as Record<string, ReturnType<typeof vi.fn>>;

const service = cashflowService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const categories = cashflowCategoryService as unknown as Record<string, ReturnType<typeof vi.fn>>;

const READS = [getCashflowSummaryTool, listCashflowTransactionsTool, listCashflowCategoriesTool, listCashflowRulesTool, listUpcomingOperationsTool,
    listRecurringExpensesTool, getBudgetStatusTool, getCashflowForecastTool, getCashflowTaxItemsTool];
const WRITES = [setTransactionCategoryTool, createCashflowCategoryTool, createCategorizationRuleTool, recordCashOperationTool, setRecurringStatusTool,
    setBudgetTool, updateCashflowOperationTool];

describe('cashflowTools (AI & MCP)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('registers every tool, reads without confirmation, changes with confirmation', () => {
        for (const tool of READS) {
            expect(aiToolRegistry.getTool(tool.name)).toBe(tool);
            expect(tool.requiresConfirmation).toBeFalsy();
        }
        for (const tool of WRITES) {
            expect(aiToolRegistry.getTool(tool.name)).toBe(tool);
            expect(tool.requiresConfirmation).toBe(true);
            expect(tool.description).toMatch(/confirmation/i);
        }
        expect([...READS, ...WRITES].some(tool => /delete|remove/.test(tool.name))).toBe(false);
    });

    it('summarises a period without the chart-only data', async () => {
        service.getSummary.mockResolvedValue({
            income: 3000, expenses: 1200, categories: [{ categoryId: 'housing', kind: 'expense', amount: 950, share: 0.8, deltaVsAverage: 0.1 }],
            sankey: { nodes: [], links: [] }, distribution: [], weekdays: [], months: [],
        });
        const result = await getCashflowSummaryTool.execute({ period: '12m', currency: 'EUR' });
        expect(service.getSummary).toHaveBeenCalledWith({ preset: '12m', month: undefined, currency: 'EUR' });
        expect(result).not.toHaveProperty('sankey');
        expect(result.topCategories[0]).toMatchObject({ categoryId: 'housing', amount: 950 });
        await getCashflowSummaryTool.execute({ period: 'nonsense' });
        expect(service.getSummary).toHaveBeenLastCalledWith({ preset: 'month', month: undefined, currency: 'EUR' });
    });

    it('lists operations with a bounded limit', async () => {
        service.listOperations.mockResolvedValue([{
            id: 'op', date: '2026-03-12T10:00:00Z', label: 'Carrefour', rawLabel: 'CARTE CARREFOUR', amount: -42, currency: 'EUR',
            categoryId: 'groceries', categorySource: 'keyword', accountName: 'Courant', instituteName: 'Bourso', excluded: false,
        }]);
        const rows = await listCashflowTransactionsTool.execute({ uncategorizedOnly: true, limit: 10_000 });
        expect(service.listOperations).toHaveBeenCalledWith(expect.objectContaining({ uncategorizedOnly: true, limit: 500 }));
        expect(rows[0]).toMatchObject({ id: 'op', date: '2026-03-12', account: 'Courant', bank: 'Bourso' });
    });

    it('lists categories and rules', async () => {
        categories.listCategories.mockResolvedValue([{ id: 'housing', kind: 'expense', custom: false }]);
        categories.listRules.mockResolvedValue([{ id: 'r', labelContains: 'NETFLIX', categoryId: 'subscriptions', direction: 'out', source: 'user', ownerId: 'u', createdAt: '', updatedAt: '' }]);
        expect(await listCashflowCategoriesTool.execute({})).toHaveLength(1);
        expect(await listCashflowRulesTool.execute({})).toEqual([expect.objectContaining({ id: 'r', labelContains: 'NETFLIX' })]);
    });

    it('lists the operations the banks announce as coming', async () => {
        service.listUpcoming.mockResolvedValue([{
            id: 'cfu', ownerId: 'u', accountId: 'acc', connectionId: 'c', externalId: 'x', date: '2026-11-26T00:00:00.000Z', amount: '-42.00',
            currency: 'EUR', label: 'SNCF', rawLabel: 'CARTE SNCF', bankHints: { category: 'Transports' }, readAt: '', accountName: 'Courant', instituteName: 'Bourso',
        }]);
        expect(await listUpcomingOperationsTool.execute({ accountId: 'acc' })).toEqual([
            { date: '2026-11-26', label: 'SNCF', amount: -42, currency: 'EUR', account: 'Courant', bank: 'Bourso', bankCategory: 'Transports' },
        ]);
        expect(service.listUpcoming).toHaveBeenCalledWith('acc');
    });

    it('lists recurring payments and confirms or sets aside a series', async () => {
        service.listRecurring.mockResolvedValue({ month: '2026-11', start: '2026-11-01', end: '2026-12-01', items: [
            { key: 'out:NETFLIX', label: 'Netflix', categoryId: 'subscriptions', direction: 'out', cadence: 'monthly', averageAmount: 13.49, lastAmount: 15.99,
                priceChange: 0.185, nextDate: '2026-12-05', status: 'detected', payments: [{ date: '2026-11-05', amount: -15.99, expected: false, operationId: 'x' }] },
            { key: 'out:GYM', label: 'Gym', categoryId: 'leisure', direction: 'out', cadence: 'monthly', averageAmount: 30, lastAmount: 30,
                priceChange: null, nextDate: '2026-12-10', status: 'ignored', payments: [] },
        ] });
        const listed = await listRecurringExpensesTool.execute({ month: '2026-11' });
        expect(listed).toEqual([expect.objectContaining({ key: 'out:NETFLIX', priceChange: 0.185, paymentsThisMonth: [{ date: '2026-11-05', amount: -15.99, expected: false }] })]);
        expect(await listRecurringExpensesTool.execute({ includeIgnored: true })).toHaveLength(2);

        service.setRecurringStatus.mockResolvedValue({ success: true, value: undefined });
        expect((await setRecurringStatusTool.execute({ key: 'out:GYM', status: 'detected' })).success).toBe(true);
        expect(service.setRecurringStatus).toHaveBeenCalledWith('out:GYM', 'detected');
        expect((await setRecurringStatusTool.execute({ key: 'out:GYM', status: 'deleted' })).success).toBe(false);
    });

    it('reads the budgets and sets one, refusing a negative cap', async () => {
        planning.getBudgetStatus.mockResolvedValue({ month: '2026-11', statuses: [{ categoryId: 'dining', limit: 200, spent: 230, ratio: 1.15, remaining: -30, state: 'over' }] });
        expect(await getBudgetStatusTool.execute({ month: '2026-11' })).toEqual({ month: '2026-11', budgets: [expect.objectContaining({ categoryId: 'dining', state: 'over' })] });
        planning.setBudget.mockResolvedValue({ success: true, value: undefined });
        expect(await setBudgetTool.execute({ categoryId: 'dining', monthlyLimit: 250 })).toMatchObject({ success: true, message: 'Budget set.' });
        expect(planning.setBudget).toHaveBeenCalledWith('dining', 250);
        expect(await setBudgetTool.execute({ categoryId: 'dining', monthlyLimit: null })).toMatchObject({ success: true, message: 'Budget removed.' });
        expect((await setBudgetTool.execute({ categoryId: 'dining', monthlyLimit: -5 })).success).toBe(false);
        planning.setBudget.mockResolvedValue({ success: false, error: 'not_expense_category' });
        expect(await setBudgetTool.execute({ categoryId: 'salary', monthlyLimit: 10 })).toEqual({ success: false, message: 'not_expense_category' });
    });

    it('gives the forecast with its curve and the tax items with the marginal rate of the profile', async () => {
        planning.getForecast.mockResolvedValue({ month: '2026-11', balanceToday: 1000, projectedEnd: 640, points: [{ date: '2026-11-30', balance: 640, projected: true }] });
        expect(await getCashflowForecastTool.execute({})).toMatchObject({ projectedEnd: 640, curve: [{ date: '2026-11-30', balance: 640, projected: true }] });
        planning.getTaxItems.mockResolvedValue({ year: '2025', items: [{ kind: 'per', paid: 3000, base: 3000, rate: 0.3, estimate: 900, operationIds: [] }], marginalRate: 0.3 });
        const tax = await getCashflowTaxItemsTool.execute({ year: '2025' });
        expect(planning.getTaxItems).toHaveBeenCalledWith('2025', { estimatedTMI: 30 }, 'EUR');
        expect(tax).toMatchObject({ year: '2025', items: [expect.objectContaining({ kind: 'per', estimate: 900 })] });
        planning.getTaxItems.mockResolvedValue(null);
        expect(await getCashflowTaxItemsTool.execute({ year: '2019' })).toMatchObject({ items: [], note: 'No rules for this year.' });
    });

    it('changes the note, label or exclusion of an operation, never its amount', async () => {
        service.updateOperation.mockResolvedValue({ success: true, value: undefined });
        expect(await updateCashflowOperationTool.execute({ transactionId: 'op', note: 'Avec Paul', excluded: true })).toMatchObject({ success: true });
        expect(service.updateOperation).toHaveBeenCalledWith('op', { note: 'Avec Paul', excluded: true });
        expect((await updateCashflowOperationTool.execute({ transactionId: 'op' })).success).toBe(false);
        // An amount is not something this tool changes: nothing left to change, nothing called
        expect((await updateCashflowOperationTool.execute({ transactionId: 'op', amount: 5 } as never)).success).toBe(false);
        expect(service.updateOperation).toHaveBeenCalledTimes(1);
    });

    it('categorises operations and reports invalid arguments or service errors', async () => {
        categories.setCategory.mockResolvedValue({ success: true, value: { updated: 2, ruleId: 'rule-1' } });
        expect(await setTransactionCategoryTool.execute({ transactionIds: ['a', 'b'], categoryId: 'dining', createRule: true }))
            .toMatchObject({ success: true, updated: 2, ruleId: 'rule-1' });
        expect(categories.setCategory).toHaveBeenCalledWith(['a', 'b'], 'dining', { createRule: true });
        expect((await setTransactionCategoryTool.execute({ transactionIds: [], categoryId: 'dining' })).success).toBe(false);
        categories.setCategory.mockResolvedValue({ success: false, error: 'unknown_category' });
        expect(await setTransactionCategoryTool.execute({ transactionIds: ['a'], categoryId: 'nope' })).toEqual({ success: false, message: 'unknown_category' });
    });

    it('creates a category and an AI-sourced rule', async () => {
        categories.createCategory.mockResolvedValue({ success: true, value: { id: 'cfc-1', name: 'Garage' } });
        expect(await createCashflowCategoryTool.execute({ parentId: 'housing', name: 'Garage' })).toMatchObject({ success: true, categoryId: 'cfc-1' });
        expect((await createCashflowCategoryTool.execute({ parentId: 'housing', name: '' })).success).toBe(false);

        categories.createRule.mockResolvedValue({ success: true, value: { id: 'cfr-1', labelContains: 'NETFLIX' } });
        expect(await createCategorizationRuleTool.execute({ labelContains: 'NETFLIX', categoryId: 'subscriptions', direction: 'out' })).toMatchObject({ success: true, ruleId: 'cfr-1' });
        expect(categories.createRule).toHaveBeenCalledWith(expect.objectContaining({ source: 'ai', labelContains: 'NETFLIX' }));
        expect((await createCategorizationRuleTool.execute({ labelContains: 'N', categoryId: 'subscriptions' })).success).toBe(false);
    });

    it('records an operation typed by hand', async () => {
        service.recordManualOperation.mockResolvedValue({ success: true, value: 'utx-manual-1' });
        expect(await recordCashOperationTool.execute({ accountId: 'acc', date: '2026-03-18', amount: -12.5, label: 'Marché' }))
            .toMatchObject({ success: true, transactionId: 'utx-manual-1' });
        expect((await recordCashOperationTool.execute({ accountId: 'acc', date: 'not a date', amount: -1, label: 'x' })).success).toBe(false);
        expect((await recordCashOperationTool.execute({ accountId: 'acc', date: '2026-03-18', amount: 0, label: 'x' })).success).toBe(false);
    });
});
