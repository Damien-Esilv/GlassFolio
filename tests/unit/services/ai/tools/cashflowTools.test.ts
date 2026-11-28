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
        recordManualOperation: vi.fn(),
    },
}));
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
    setTransactionCategoryTool,
    createCashflowCategoryTool,
    createCategorizationRuleTool,
    recordCashOperationTool,
} from '../../../../../src/services/ai/tools/cashflowTools';
import { aiToolRegistry } from '../../../../../src/services/ai/aiToolRegistry';
import '../../../../../src/services/ai/tools';
import { cashflowService } from '../../../../../src/services/cashflow/cashflowService';
import { cashflowCategoryService } from '../../../../../src/services/cashflow/cashflowCategoryService';

const service = cashflowService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const categories = cashflowCategoryService as unknown as Record<string, ReturnType<typeof vi.fn>>;

const READS = [getCashflowSummaryTool, listCashflowTransactionsTool, listCashflowCategoriesTool, listCashflowRulesTool];
const WRITES = [setTransactionCategoryTool, createCashflowCategoryTool, createCategorizationRuleTool, recordCashOperationTool];

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
