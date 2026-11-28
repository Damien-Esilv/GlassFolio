/**
 * Cash flow tools for the in-app assistant and MCP clients (Epic E52 — TGLA-252, TGLA-254).
 *
 * Reads: summary of a period, operations (with filters, the uncategorised ones), categories, rules, operations the
 * banks announce as coming, recurring payments (TGLA-255). Changes also confirm or set aside a recurring series.
 * Changes (always confirmed by the user): put operations in a category (optionally with a rule),
 * create a sub-category, create a rule, record an operation typed by hand. Nothing is deleted by the AI.
 */
import { AIToolDefinition } from '../types';
import { cashflowService } from '../../cashflow/cashflowService';
import { cashflowPlanningService } from '../../cashflow/cashflowPlanningService';
import type { TaxItem } from '../../cashflow/taxItems';
import { userRepository } from '../../repositories';
import type { BudgetStatus, CashflowForecast } from '../../../types/cashflow';
import type { FiscalProfile } from '../../../types/types.backend';
import { cashflowCategoryService, type CategoryOption } from '../../cashflow/cashflowCategoryService';
import type { CashflowPeriodPreset } from '../../cashflow/period';
import type { CashflowSummary } from '../../../types/cashflow';
import {
    CreateCashflowCategoryArgsSchema,
    CreateCategorizationRuleArgsSchema,
    RecordCashOperationArgsSchema,
    SetBudgetArgsSchema,
    SetRecurringStatusArgsSchema,
    UpdateCashflowOperationArgsSchema,
    SetTransactionCategoryArgsSchema,
} from '../../contracts/externalSchemas';

const PRESETS: readonly CashflowPeriodPreset[] = ['month', '3m', '6m', '12m', 'ytd', 'all'];

type ToolResult = { success: boolean; message: string };

const failure = (message: string): ToolResult => ({ success: false, message });

export const getCashflowSummaryTool: AIToolDefinition<
    { period?: string; month?: string; currency?: string },
    Omit<CashflowSummary, 'sankey' | 'distribution' | 'weekdays'> & { topCategories: Array<{ categoryId: string; kind: string; amount: number; share: number; deltaVsAverage: number | null }> }
> = {
    name: 'get_cashflow_summary',
    description:
        'Cash flow of the user\'s checking and savings accounts for a period: money in, money out, savings invested, cash left available, savings rate, passive income coverage, monthly trend (12 months), totals per category and per bank, top merchants and the count of operations not categorised yet. Amounts are in the base currency, spending as positive numbers.',
    parameters: {
        type: 'object',
        properties: {
            period: { type: 'string', enum: [...PRESETS], description: 'Period: month (one budget month), 3m, 6m or 12m (the months up to month), ytd (the calendar year of month, up to today for this one) or all. Default: month.' },
            month: { type: 'string', description: 'Budget month YYYY-MM anchoring the period: the month itself, the last month of 3m/6m/12m, a month of the year for ytd. Default: the current month.' },
            currency: { type: 'string', description: 'Base currency ISO code, e.g. EUR. Default: EUR.' },
        },
    },
    execute: async params => {
        const preset = (PRESETS as readonly string[]).includes(params.period ?? '') ? (params.period as CashflowPeriodPreset) : 'month';
        const summary = await cashflowService.getSummary({ preset, month: params.month, currency: params.currency ?? 'EUR' });
        const { sankey: _sankey, distribution: _distribution, weekdays: _weekdays, categories, ...rest } = summary;
        return {
            ...rest,
            categories,
            topCategories: categories.slice(0, 12).map(c => ({ categoryId: c.categoryId, kind: c.kind, amount: c.amount, share: c.share, deltaVsAverage: c.deltaVsAverage })),
        };
    },
};

export const listCashflowTransactionsTool: AIToolDefinition<
    { start?: string; end?: string; categoryId?: string; uncategorizedOnly?: boolean; direction?: 'in' | 'out'; search?: string; limit?: number; currency?: string },
    Array<{ id: string; date: string; label: string; rawLabel: string; amount: number; currency: string; categoryId: string; categorySource: string; account: string; bank?: string; excluded: boolean; note?: string }>
> = {
    name: 'list_cashflow_transactions',
    description:
        'Bank operations counted in the cash flow, newest first, with their category and why it was chosen (categorySource: override, transfer, rule, type, bank, keyword, fallback). Use uncategorizedOnly=true to get the operations still waiting for a category (fallback) before proposing categories with set_transaction_category.',
    parameters: {
        type: 'object',
        properties: {
            start: { type: 'string', description: 'First day included, YYYY-MM-DD.' },
            end: { type: 'string', description: 'Day after the last one included, YYYY-MM-DD.' },
            categoryId: { type: 'string', description: 'Only this category (and its sub-categories). Ids come from list_cashflow_categories.' },
            uncategorizedOnly: { type: 'boolean', description: 'Only operations not categorised yet.' },
            direction: { type: 'string', enum: ['in', 'out'], description: 'Only money in or only money out.' },
            search: { type: 'string', description: 'Text searched in the label and the note.' },
            limit: { type: 'number', description: 'Maximum number of operations (default 100, at most 500).' },
            currency: { type: 'string', description: 'Base currency ISO code. Default: EUR.' },
        },
    },
    execute: async params => {
        const limit = Math.min(500, Math.max(1, Math.trunc(params.limit ?? 100)));
        const operations = await cashflowService.listOperations({
            start: params.start,
            end: params.end,
            categoryId: params.categoryId,
            uncategorizedOnly: params.uncategorizedOnly,
            direction: params.direction,
            search: params.search,
            limit,
            currency: params.currency ?? 'EUR',
        });
        return operations.map(op => ({
            id: op.id,
            date: op.date.slice(0, 10),
            label: op.label,
            rawLabel: op.rawLabel,
            amount: op.amount,
            currency: op.currency,
            categoryId: op.categoryId,
            categorySource: op.categorySource,
            account: op.accountName,
            bank: op.instituteName,
            excluded: op.excluded,
            note: op.note,
        }));
    },
};

export const listCashflowCategoriesTool: AIToolDefinition<Record<string, never>, CategoryOption[]> = {
    name: 'list_cashflow_categories',
    description:
        'Categories of the cash flow: built-in ones (kind income, expense, savings or transfer; built-in sub-categories have a parentId) and the user\'s own sub-categories (custom=true, with their name). Use these ids with set_transaction_category and create_categorization_rule.',
    parameters: { type: 'object', properties: {} },
    execute: async () => cashflowCategoryService.listCategories(),
};

export const listCashflowRulesTool: AIToolDefinition<
    Record<string, never>,
    Array<{ id: string; labelContains: string; categoryId: string; direction: string; accountId?: string; minAmount?: number; maxAmount?: number; source: string }>
> = {
    name: 'list_cashflow_rules',
    description: 'The user\'s categorisation rules: an operation whose label contains the text (and matches direction, account and amount bounds) goes to the category.',
    parameters: { type: 'object', properties: {} },
    execute: async () => (await cashflowCategoryService.listRules()).map(rule => ({
        id: rule.id,
        labelContains: rule.labelContains,
        categoryId: rule.categoryId,
        direction: rule.direction,
        accountId: rule.accountId,
        minAmount: rule.minAmount,
        maxAmount: rule.maxAmount,
        source: rule.source,
    })),
};

export const listUpcomingOperationsTool: AIToolDefinition<
    { accountId?: string },
    Array<{ date: string; label: string; amount: number; currency: string; account: string; bank?: string; bankCategory?: string }>
> = {
    name: 'list_upcoming_operations',
    description:
        'Operations the user\'s banks announce as coming on checking and savings accounts (card payments not booked yet, scheduled transfers), as read by the last bank sync of the desktop app or Docker (online, the list is empty). They are not in the journal yet and change no balance. Soonest first; negative amount = money out.',
    parameters: {
        type: 'object',
        properties: {
            accountId: { type: 'string', description: 'Only this checking or savings account (ids from list_institutions).' },
        },
    },
    execute: async params => (await cashflowService.listUpcoming(params.accountId)).map(item => ({
        date: item.date.slice(0, 10),
        label: item.label,
        amount: Number(item.amount),
        currency: item.currency,
        account: item.accountName,
        bank: item.instituteName,
        bankCategory: item.bankHints?.category,
    })),
};

export const listRecurringExpensesTool: AIToolDefinition<
    { month?: string; includeIgnored?: boolean; currency?: string },
    Array<{ key: string; label: string; categoryId: string; direction: string; cadence: string; averageAmount: number; lastAmount: number; priceChange: number | null; nextDate: string; status: string; paymentsThisMonth: Array<{ date: string; amount: number; expected: boolean }> }>
> = {
    name: 'list_recurring_expenses',
    description:
        'Recurring payments and income detected over the last 6 months (subscriptions, rent, salary…): rhythm, average and last amount, price change (0.185 = +18.5 %), next expected date, the user\'s decision (detected, confirmed, ignored) and the payments of the month asked, made or expected. Amounts in the base currency; averageAmount and lastAmount are absolute, payments are signed.',
    parameters: {
        type: 'object',
        properties: {
            month: { type: 'string', description: 'Budget month YYYY-MM for the payments of the month. Default: the current one.' },
            includeIgnored: { type: 'boolean', description: 'Also list the series the user set aside.' },
            currency: { type: 'string', description: 'Base currency ISO code. Default: EUR.' },
        },
    },
    execute: async params => {
        const result = await cashflowService.listRecurring({ currency: params.currency ?? 'EUR', month: params.month });
        return result.items
            .filter(item => params.includeIgnored || item.status !== 'ignored')
            .map(item => ({
                key: item.key,
                label: item.label,
                categoryId: item.categoryId,
                direction: item.direction,
                cadence: item.cadence,
                averageAmount: item.averageAmount,
                lastAmount: item.lastAmount,
                priceChange: item.priceChange,
                nextDate: item.nextDate,
                status: item.status,
                paymentsThisMonth: item.payments.map(payment => ({ date: payment.date, amount: payment.amount, expected: payment.expected })),
            }));
    },
};

export const setRecurringStatusTool: AIToolDefinition<{ key: string; status: string }, ToolResult> = {
    name: 'set_recurring_status',
    description:
        'Confirm a detected recurring series (confirmed), set it aside because it is not a recurring payment (ignored: its operations then count as day-to-day spending), or forget the decision (detected). Keys come from list_recurring_expenses. Requires explicit human confirmation before execution.',
    requiresConfirmation: true,
    parameters: {
        type: 'object',
        properties: {
            key: { type: 'string', description: 'Series key from list_recurring_expenses.' },
            status: { type: 'string', enum: ['confirmed', 'ignored', 'detected'], description: 'The decision.' },
        },
        required: ['key', 'status'],
    },
    execute: async params => {
        const validated = SetRecurringStatusArgsSchema.safeParse(params);
        if (!validated.success) return failure(validated.error.issues[0]?.message || 'Invalid parameters.');
        const result = await cashflowService.setRecurringStatus(validated.data.key, validated.data.status);
        if (result.success === false) return failure(result.error);
        return { success: true, message: `Series marked ${validated.data.status}.` };
    },
};

export const getBudgetStatusTool: AIToolDefinition<{ month?: string; currency?: string }, { month: string; budgets: BudgetStatus[] }> = {
    name: 'get_budget_status',
    description:
        'The user\'s monthly budgets (a spending cap per category) against what each category spent in a budget month: limit, spent, ratio, remaining and state (ok under 80 %, near from 80 %, over above the cap). Amounts in the base currency.',
    parameters: {
        type: 'object',
        properties: {
            month: { type: 'string', description: 'Budget month YYYY-MM. Default: the current one.' },
            currency: { type: 'string', description: 'Base currency ISO code. Default: EUR.' },
        },
    },
    execute: async params => {
        const result = await cashflowPlanningService.getBudgetStatus({ month: params.month, currency: params.currency ?? 'EUR' });
        return { month: result.month, budgets: result.statuses };
    },
};

export const setBudgetTool: AIToolDefinition<{ categoryId: string; monthlyLimit: number | null }, ToolResult> = {
    name: 'set_budget',
    description:
        'Set the monthly spending cap of a top-level expense category (ids from list_cashflow_categories, kind expense, without parentId), or remove it with monthlyLimit null or 0. The user is notified when the category goes over its cap. Requires explicit human confirmation before execution.',
    requiresConfirmation: true,
    parameters: {
        type: 'object',
        properties: {
            categoryId: { type: 'string', description: 'Top-level expense category id, e.g. dining.' },
            monthlyLimit: { type: 'number', description: 'Cap per budget month in the base currency; null or 0 removes the budget.' },
        },
        required: ['categoryId', 'monthlyLimit'],
    },
    execute: async params => {
        const validated = SetBudgetArgsSchema.safeParse(params);
        if (!validated.success) return failure(validated.error.issues[0]?.message || 'Invalid parameters.');
        const result = await cashflowPlanningService.setBudget(validated.data.categoryId, validated.data.monthlyLimit);
        if (result.success === false) return failure(result.error);
        return { success: true, message: validated.data.monthlyLimit ? 'Budget set.' : 'Budget removed.' };
    },
};

export const getCashflowForecastTool: AIToolDefinition<{ currency?: string }, Omit<CashflowForecast, 'points'> & { curve: Array<{ date: string; balance: number; projected: boolean }> }> = {
    name: 'get_cashflow_forecast',
    description:
        'End-of-month forecast of the checking and savings accounts counted in the cash flow: today\'s balance, the balance expected at the end of the budget month (lowest point too), and what makes it up (operations the banks announce as coming, recurring payments and income expected, day-to-day spending at the daily average of the last 3 months), with the daily curve.',
    parameters: { type: 'object', properties: { currency: { type: 'string', description: 'Base currency ISO code. Default: EUR.' } } },
    execute: async params => {
        const { points, ...rest } = await cashflowPlanningService.getForecast({ currency: params.currency ?? 'EUR' });
        return { ...rest, curve: points };
    },
};

export const getCashflowTaxItemsTool: AIToolDefinition<{ year: string; currency?: string }, { year: string; items: TaxItem[]; marginalRate?: number; note: string } | { year: string; items: []; note: string }> = {
    name: 'get_cashflow_tax_items',
    description:
        'Tax reductions and credits spotted in the cash flow of an income year (France): donations (75 % for organisations helping people in need within its cap, else 66 % within 20 % of taxable income), home help and childcare (50 % credits within their caps), PER contributions (deductible within the cap on the tax notice; saving = contributions × marginal rate). Paid, base after caps, rate, estimated benefit and the operation ids. An estimate, not tax advice.',
    parameters: {
        type: 'object',
        properties: {
            year: { type: 'string', description: 'Income year, e.g. 2025.' },
            currency: { type: 'string', description: 'Base currency ISO code. Default: EUR.' },
        },
        required: ['year'],
    },
    execute: async params => {
        const user = await userRepository.getUser().catch(() => null);
        const profile: FiscalProfile = user?.preferences?.fiscalProfile ?? {};
        const note = 'Estimate from bank operations; the receipts and certificates decide, caps depend on the household.';
        const result = await cashflowPlanningService.getTaxItems(String(params.year), profile, params.currency ?? 'EUR');
        return result ? { ...result, note } : { year: String(params.year), items: [], note: 'No rules for this year.' };
    },
};

export const updateCashflowOperationTool: AIToolDefinition<
    { transactionId: string; note?: string | null; displayLabel?: string | null; excluded?: boolean },
    ToolResult
> = {
    name: 'update_cashflow_operation',
    description:
        'Change how one cash flow operation shows (ids from list_cashflow_transactions): its note, its displayed label (null restores the bank\'s), or whether it is left out of the cash flow (excluded). The amount, date and account never change here. Requires explicit human confirmation before execution.',
    requiresConfirmation: true,
    parameters: {
        type: 'object',
        properties: {
            transactionId: { type: 'string', description: 'Operation id.' },
            note: { type: 'string', description: 'Note (500 characters at most); empty or null removes it.' },
            displayLabel: { type: 'string', description: 'Label shown instead of the bank\'s (140 characters at most); null restores the bank\'s.' },
            excluded: { type: 'boolean', description: 'true leaves the operation out of the cash flow totals.' },
        },
        required: ['transactionId'],
    },
    execute: async params => {
        const validated = UpdateCashflowOperationArgsSchema.safeParse(params);
        if (!validated.success) return failure(validated.error.issues[0]?.message || 'Invalid parameters.');
        const { transactionId, ...edit } = validated.data;
        const result = await cashflowService.updateOperation(transactionId, edit);
        if (result.success === false) return failure(result.error);
        return { success: true, message: 'Operation updated.' };
    },
};

export const setTransactionCategoryTool: AIToolDefinition<
    { transactionIds: string[]; categoryId: string; createRule?: boolean },
    ToolResult & { updated?: number; ruleId?: string }
> = {
    name: 'set_transaction_category',
    description:
        'Put one or more cash flow operations (ids from list_cashflow_transactions) in a category. With createRule=true, the merchant of the first operation also becomes a rule so similar operations follow. Requires explicit human confirmation before execution.',
    requiresConfirmation: true,
    parameters: {
        type: 'object',
        properties: {
            transactionIds: { type: 'array', items: { type: 'string', description: 'Operation id.' }, description: 'Ids of the operations (at most 500).' },
            categoryId: { type: 'string', description: 'Category id from list_cashflow_categories.' },
            createRule: { type: 'boolean', description: 'Also create a rule from the merchant of the first operation.' },
        },
        required: ['transactionIds', 'categoryId'],
    },
    execute: async params => {
        const validated = SetTransactionCategoryArgsSchema.safeParse(params);
        if (!validated.success) return failure(validated.error.issues[0]?.message || 'Invalid parameters.');
        const result = await cashflowCategoryService.setCategory(validated.data.transactionIds, validated.data.categoryId, { createRule: validated.data.createRule });
        if (result.success === false) return failure(result.error);
        return { success: true, message: `${result.value.updated} operation(s) categorised.`, updated: result.value.updated, ruleId: result.value.ruleId };
    },
};

export const createCashflowCategoryTool: AIToolDefinition<
    { parentId: string; name: string },
    ToolResult & { categoryId?: string }
> = {
    name: 'create_cashflow_category',
    description:
        'Create a sub-category of the user under a built-in category (it takes the parent\'s colour and kind), e.g. "Garage" under housing. Requires explicit human confirmation before execution.',
    requiresConfirmation: true,
    parameters: {
        type: 'object',
        properties: {
            parentId: { type: 'string', description: 'Built-in category id from list_cashflow_categories (not internal_transfer).' },
            name: { type: 'string', description: 'Name of the new sub-category (40 characters at most).' },
        },
        required: ['parentId', 'name'],
    },
    execute: async params => {
        const validated = CreateCashflowCategoryArgsSchema.safeParse(params);
        if (!validated.success) return failure(validated.error.issues[0]?.message || 'Invalid parameters.');
        const result = await cashflowCategoryService.createCategory(validated.data.parentId, validated.data.name);
        if (result.success === false) return failure(result.error);
        return { success: true, message: `Category "${result.value.name}" created.`, categoryId: result.value.id };
    },
};

export const createCategorizationRuleTool: AIToolDefinition<
    { labelContains: string; categoryId: string; direction?: 'in' | 'out' | 'any'; accountId?: string; minAmount?: number; maxAmount?: number },
    ToolResult & { ruleId?: string }
> = {
    name: 'create_categorization_rule',
    description:
        'Create a categorisation rule: every operation (past and future) whose label contains the text goes to the category, optionally only money in or out, one account, or an amount range. Requires explicit human confirmation before execution.',
    requiresConfirmation: true,
    parameters: {
        type: 'object',
        properties: {
            labelContains: { type: 'string', description: 'Text to find in the label (case and accents ignored), e.g. NETFLIX.' },
            categoryId: { type: 'string', description: 'Category id from list_cashflow_categories.' },
            direction: { type: 'string', enum: ['in', 'out', 'any'], description: 'Money in, money out or both (default).' },
            accountId: { type: 'string', description: 'Only operations of this account.' },
            minAmount: { type: 'number', description: 'Only operations of at least this absolute amount.' },
            maxAmount: { type: 'number', description: 'Only operations of at most this absolute amount.' },
        },
        required: ['labelContains', 'categoryId'],
    },
    execute: async params => {
        const validated = CreateCategorizationRuleArgsSchema.safeParse(params);
        if (!validated.success) return failure(validated.error.issues[0]?.message || 'Invalid parameters.');
        const result = await cashflowCategoryService.createRule({ ...validated.data, source: 'ai' });
        if (result.success === false) return failure(result.error);
        return { success: true, message: `Rule "${result.value.labelContains}" created.`, ruleId: result.value.id };
    },
};

export const recordCashOperationTool: AIToolDefinition<
    { accountId: string; date: string; amount: number; label: string; categoryId?: string; note?: string },
    ToolResult & { transactionId?: string }
> = {
    name: 'record_cash_operation',
    description:
        'Record a bank operation typed by hand in a checking or savings account (negative amount = money out). Account ids come from list_institutions. Requires explicit human confirmation before execution.',
    requiresConfirmation: true,
    parameters: {
        type: 'object',
        properties: {
            accountId: { type: 'string', description: 'Checking or savings account id.' },
            date: { type: 'string', description: 'Date of the operation, YYYY-MM-DD (not in the future).' },
            amount: { type: 'number', description: 'Signed amount in the account currency: negative for money out.' },
            label: { type: 'string', description: 'Label of the operation.' },
            categoryId: { type: 'string', description: 'Category id (optional: categorised automatically otherwise).' },
            note: { type: 'string', description: 'Optional note.' },
        },
        required: ['accountId', 'date', 'amount', 'label'],
    },
    execute: async params => {
        const validated = RecordCashOperationArgsSchema.safeParse(params);
        if (!validated.success) return failure(validated.error.issues[0]?.message || 'Invalid parameters.');
        const result = await cashflowService.recordManualOperation(validated.data);
        if (result.success === false) return failure(result.error);
        return { success: true, message: 'Operation recorded.', transactionId: result.value };
    },
};
