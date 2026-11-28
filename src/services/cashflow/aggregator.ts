/**
 * Cash flow totals for a period (Epic E52 — TGLA-249). Pure functions.
 *
 * Signs: income and spending are netted per category (a refund filed under "groceries" lowers the
 * groceries spending). Internal transfers and excluded operations count nowhere. Savings invested is
 * neither income nor spending.
 *  - available   = income − expenses − savings invested
 *  - savingsRate = (income − expenses) / income
 */
import { CASHFLOW_CATEGORIES, topLevelCashflowCategoryId, resolveCashflowCategory } from '../../constants/cashflowCategories';
import type {
    AmountBucket,
    BankTotal,
    CashflowCategoryKind,
    CashflowCategoryTotal,
    CashflowMonth,
    CashflowOperation,
    CashflowSankey,
    CashflowSankeyNode,
    CashflowSummary,
    CustomCashflowCategory,
    MerchantTotal,
} from '../../types/cashflow';

/** Amount buckets of the distribution chart (euros or base currency units). */
export const DISTRIBUTION_BOUNDS: readonly number[] = [0, 5, 10, 50, 100, 500, 1000];

/** Flows under this share of the income are grouped into "others" in the Sankey. */
const SANKEY_MIN_SHARE = 0.01;
const SANKEY_MAX_DETAILS = 4;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** YYYY-MM of the budget month an ISO date belongs to (a month starts on `monthStartDay`). */
export function budgetMonthOf(isoDate: string, monthStartDay: number = 1): string {
    const year = Number(isoDate.slice(0, 4));
    const month = Number(isoDate.slice(5, 7));
    const day = Number(isoDate.slice(8, 10));
    if (day >= monthStartDay || monthStartDay <= 1) return isoDate.slice(0, 7);
    const previous = new Date(Date.UTC(year, month - 2, 1));
    return previous.toISOString().slice(0, 7);
}

/** Every YYYY-MM from `start` to `end` (both YYYY-MM, inclusive). */
export function monthRange(start: string, end: string): string[] {
    const out: string[] = [];
    let year = Number(start.slice(0, 4));
    let month = Number(start.slice(5, 7));
    const endKey = end.slice(0, 7);
    for (let guard = 0; guard < 600; guard++) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        if (key > endKey) break;
        out.push(key);
        month += 1;
        if (month > 12) {
            month = 1;
            year += 1;
        }
    }
    return out;
}

/** Contribution of an operation to the total of its kind (positive = more income / more spending / more savings). */
export function contribution(op: CashflowOperation): number {
    return op.categoryKind === 'income' ? op.amount : -op.amount;
}

const counts = (op: CashflowOperation): boolean => !op.excluded && op.categoryKind !== 'transfer';

interface Totals {
    income: number;
    expenses: number;
    savingsInvested: number;
}

function totalsOf(ops: readonly CashflowOperation[]): Totals {
    const totals: Totals = { income: 0, expenses: 0, savingsInvested: 0 };
    for (const op of ops) {
        if (!counts(op)) continue;
        if (op.categoryKind === 'income') totals.income += op.amount;
        else if (op.categoryKind === 'expense') totals.expenses -= op.amount;
        else if (op.categoryKind === 'savings') totals.savingsInvested -= op.amount;
    }
    return totals;
}

const savingsRateOf = (income: number, expenses: number): number => (income > 0 ? (income - expenses) / income : 0);

export interface SummaryOptions {
    /** YYYY-MM-DD, inclusive */
    periodStart: string;
    /** YYYY-MM-DD, exclusive */
    periodEnd: string;
    /** First day of the monthly trend (defaults to the period start) */
    trendStart?: string;
    currency: string;
    monthStartDay?: number;
    /** Operations that belong to a recurring series (fixed spending) */
    recurringIds?: ReadonlySet<string>;
    customCategories?: readonly CustomCashflowCategory[];
}

const inPeriod = (op: CashflowOperation, start: string, end: string): boolean => {
    const day = op.date.slice(0, 10);
    return day >= start && day < end;
};

function monthsOf(ops: readonly CashflowOperation[], options: SummaryOptions): CashflowMonth[] {
    const startDay = options.monthStartDay ?? 1;
    const lastDay = new Date(Date.parse(`${options.periodEnd}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const keys = monthRange(budgetMonthOf(options.trendStart ?? options.periodStart, startDay), budgetMonthOf(lastDay, startDay));
    const byMonth = new Map<string, CashflowMonth>(keys.map(month => [month, {
        month, income: 0, expenses: 0, fixedExpenses: 0, variableExpenses: 0, savingsInvested: 0, available: 0, savingsRate: 0,
    }]));
    for (const op of ops) {
        if (!counts(op)) continue;
        const entry = byMonth.get(budgetMonthOf(op.date.slice(0, 10), startDay));
        if (!entry) continue;
        if (op.categoryKind === 'income') entry.income += op.amount;
        else if (op.categoryKind === 'savings') entry.savingsInvested -= op.amount;
        else if (op.categoryKind === 'expense') {
            entry.expenses -= op.amount;
            if (options.recurringIds?.has(op.id)) entry.fixedExpenses -= op.amount;
            else entry.variableExpenses -= op.amount;
        }
    }
    return keys.map(key => {
        const entry = byMonth.get(key) as CashflowMonth;
        const available = entry.income - entry.expenses - entry.savingsInvested;
        return {
            ...entry,
            income: round2(entry.income),
            expenses: round2(entry.expenses),
            fixedExpenses: round2(entry.fixedExpenses),
            variableExpenses: round2(entry.variableExpenses),
            savingsInvested: round2(entry.savingsInvested),
            available: round2(available),
            savingsRate: savingsRateOf(entry.income, entry.expenses),
        };
    });
}

const monthsBetween = (startIso: string, endIso: string): number => {
    const start = new Date(`${startIso}T00:00:00Z`);
    const end = new Date(`${endIso}T00:00:00Z`);
    const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth())
        + (end.getUTCDate() - start.getUTCDate()) / 30;
    return Math.max(months, 1 / 30);
};

const shiftMonths = (iso: string, months: number): string => {
    const date = new Date(`${iso}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + months);
    return date.toISOString().slice(0, 10);
};

function categoriesOf(
    periodOps: readonly CashflowOperation[],
    allOps: readonly CashflowOperation[],
    options: SummaryOptions,
): CashflowCategoryTotal[] {
    const custom = options.customCategories ?? [];
    const top = new Map<string, { kind: CashflowCategoryKind; amount: number; count: number; children: Map<string, { amount: number; count: number }> }>();
    for (const op of periodOps) {
        if (!counts(op)) continue;
        const topId = topLevelCashflowCategoryId(op.categoryId, custom);
        const entry = top.get(topId) ?? { kind: op.categoryKind, amount: 0, count: 0, children: new Map() };
        entry.amount += contribution(op);
        entry.count += 1;
        if (topId !== op.categoryId) {
            const child = entry.children.get(op.categoryId) ?? { amount: 0, count: 0 };
            child.amount += contribution(op);
            child.count += 1;
            entry.children.set(op.categoryId, child);
        }
        top.set(topId, entry);
    }

    // Monthly average over the 12 months before the period (only months with data)
    const historyStart = shiftMonths(options.periodStart, -12);
    const history = allOps.filter(op => counts(op) && inPeriod(op, historyStart, options.periodStart));
    const firstHistoryDay = history.reduce<string | undefined>((min, op) => (!min || op.date < min ? op.date.slice(0, 10) : min), undefined);
    const historyMonths = firstHistoryDay ? monthsBetween(firstHistoryDay, options.periodStart) : 0;
    const historyByTop = new Map<string, number>();
    for (const op of history) {
        const topId = topLevelCashflowCategoryId(op.categoryId, custom);
        historyByTop.set(topId, (historyByTop.get(topId) ?? 0) + contribution(op));
    }
    const periodMonths = monthsBetween(options.periodStart, options.periodEnd);

    const kindTotals = new Map<CashflowCategoryKind, number>();
    for (const entry of top.values()) {
        if (entry.amount > 0) kindTotals.set(entry.kind, (kindTotals.get(entry.kind) ?? 0) + entry.amount);
    }

    return [...top.entries()]
        .map(([categoryId, entry]) => {
            const averageMonthly = historyMonths >= 1 ? (historyByTop.get(categoryId) ?? 0) / Math.min(12, historyMonths) : 0;
            const perMonth = entry.amount / periodMonths;
            const total = kindTotals.get(entry.kind) ?? 0;
            return {
                categoryId,
                kind: entry.kind,
                amount: round2(entry.amount),
                share: total > 0 && entry.amount > 0 ? entry.amount / total : 0,
                count: entry.count,
                averageMonthly: round2(averageMonthly),
                deltaVsAverage: averageMonthly > 0 ? (perMonth - averageMonthly) / averageMonthly : null,
                children: [...entry.children.entries()]
                    .map(([childId, child]) => ({ categoryId: childId, amount: round2(child.amount), count: child.count }))
                    .sort((a, b) => b.amount - a.amount),
            };
        })
        .sort((a, b) => b.amount - a.amount);
}

/** Groups small values into "others" and keeps at most `max` details. */
function topDetails<T extends { value: number }>(items: T[], minValue: number, max: number): { kept: T[]; others: number } {
    const sorted = [...items].filter(item => item.value > 0).sort((a, b) => b.value - a.value);
    const kept: T[] = [];
    let others = 0;
    for (const item of sorted) {
        if (kept.length < max && item.value >= minValue) kept.push(item);
        else others += item.value;
    }
    return { kept, others };
}

/**
 * Four columns: income sources → income → taxes / savings / expenses → details. When spending and
 * savings exceed income, a "drawn from savings" source balances the flow.
 */
export function buildSankey(
    periodOps: readonly CashflowOperation[],
    categories: readonly CashflowCategoryTotal[],
    custom: readonly CustomCashflowCategory[] = [],
): CashflowSankey {
    const counted = periodOps.filter(counts);
    const income = categories.filter(c => c.kind === 'income' && c.amount > 0);
    const totalIncome = income.reduce((sum, c) => sum + c.amount, 0);
    const taxes = categories.find(c => c.categoryId === 'taxes' && c.amount > 0)?.amount ?? 0;
    const expenses = categories.filter(c => c.kind === 'expense' && c.categoryId !== 'taxes' && c.amount > 0);
    const totalExpenses = expenses.reduce((sum, c) => sum + c.amount, 0);
    const savingsInvested = Math.max(0, categories.filter(c => c.kind === 'savings').reduce((sum, c) => sum + c.amount, 0));
    const outflows = taxes + totalExpenses + savingsInvested;
    const available = totalIncome - outflows;
    if (totalIncome <= 0 && outflows <= 0) return { nodes: [], links: [] };

    const nodes: CashflowSankeyNode[] = [];
    const links: { source: number; target: number; value: number }[] = [];
    const add = (node: CashflowSankeyNode): number => {
        nodes.push({ ...node, value: round2(node.value) });
        return nodes.length - 1;
    };
    const link = (source: number, target: number, value: number) => {
        if (value > 0) links.push({ source, target, value: round2(value) });
    };

    const minFlow = Math.max(totalIncome, outflows) * SANKEY_MIN_SHARE;
    const incomeTotalValue = Math.max(totalIncome, outflows);
    const sourceIndexes: { index: number; value: number }[] = [];
    const sources = topDetails(income.map(c => ({ categoryId: c.categoryId, value: c.amount })), minFlow, 6);
    for (const source of sources.kept) {
        sourceIndexes.push({ index: add({ id: `source:${source.categoryId}`, kind: 'source', categoryId: source.categoryId, value: source.value }), value: source.value });
    }
    if (sources.others > 0) {
        sourceIndexes.push({ index: add({ id: 'source:others', kind: 'source', categoryId: 'others', value: sources.others }), value: sources.others });
    }
    if (available < 0) {
        sourceIndexes.push({ index: add({ id: 'source:from_savings', kind: 'source', categoryId: 'from_savings', value: -available }), value: -available });
    }
    const incomeNode = add({ id: 'income', kind: 'income', categoryId: 'income_total', value: incomeTotalValue });
    for (const source of sourceIndexes) link(source.index, incomeNode, source.value);

    // Taxes: detailed by merchant (income tax, property tax…)
    if (taxes > 0) {
        const taxNode = add({ id: 'group:taxes', kind: 'group', categoryId: 'group_taxes', value: taxes });
        link(incomeNode, taxNode, taxes);
        const byMerchant = new Map<string, { label: string; value: number }>();
        for (const op of counted) {
            if (topLevelCashflowCategoryId(op.categoryId, custom) !== 'taxes') continue;
            const entry = byMerchant.get(op.merchantKey) ?? { label: op.label, value: 0 };
            entry.value -= op.amount;
            byMerchant.set(op.merchantKey, entry);
        }
        const details = topDetails([...byMerchant.entries()].map(([key, v]) => ({ key, ...v })), 0, SANKEY_MAX_DETAILS);
        let shown = 0;
        for (const detail of details.kept) {
            const value = Math.min(detail.value, taxes - shown);
            if (value <= 0) continue;
            shown += value;
            link(taxNode, add({ id: `tax:${detail.key}`, kind: 'detail', label: detail.label, value }), value);
        }
        // Whatever the merchants do not explain (sub-categories, refunds) keeps the flow balanced
        const rest = taxes - shown;
        if (rest > 0.005) link(taxNode, add({ id: 'tax:others', kind: 'detail', categoryId: 'others', value: rest }), rest);
    }

    // Savings: invested (by destination label) and what is left available
    const savingsGroup = savingsInvested + Math.max(available, 0);
    if (savingsGroup > 0) {
        const savingsNode = add({ id: 'group:savings', kind: 'group', categoryId: 'group_savings', value: savingsGroup });
        link(incomeNode, savingsNode, savingsGroup);
        const byDestination = new Map<string, { label: string; value: number }>();
        for (const op of counted) {
            if (op.categoryKind !== 'savings') continue;
            const entry = byDestination.get(op.merchantKey) ?? { label: op.label, value: 0 };
            entry.value -= op.amount;
            byDestination.set(op.merchantKey, entry);
        }
        const details = topDetails([...byDestination.entries()].map(([key, v]) => ({ key, ...v })), 0, SANKEY_MAX_DETAILS);
        let shown = 0;
        for (const detail of details.kept) {
            const value = Math.min(detail.value, savingsInvested - shown);
            if (value <= 0) continue;
            shown += value;
            link(savingsNode, add({ id: `savings:${detail.key}`, kind: 'detail', label: detail.label, value }), value);
        }
        const rest = savingsInvested - shown;
        if (rest > 0.005) link(savingsNode, add({ id: 'savings:others', kind: 'detail', categoryId: 'savings_invested', value: rest }), rest);
        if (available > 0) link(savingsNode, add({ id: 'savings:available', kind: 'detail', categoryId: 'available', value: available }), available);
    }

    // Expenses: by category
    if (totalExpenses > 0) {
        const expensesNode = add({ id: 'group:expenses', kind: 'group', categoryId: 'group_expenses', value: totalExpenses });
        link(incomeNode, expensesNode, totalExpenses);
        const details = topDetails(expenses.map(c => ({ categoryId: c.categoryId, value: c.amount })), minFlow, 10);
        for (const detail of details.kept) link(expensesNode, add({ id: `expense:${detail.categoryId}`, kind: 'detail', categoryId: detail.categoryId, value: detail.value }), detail.value);
        if (details.others > 0) link(expensesNode, add({ id: 'expense:others', kind: 'detail', categoryId: 'others', value: details.others }), details.others);
    }

    return { nodes, links };
}

function distributionOf(ops: readonly CashflowOperation[]): { buckets: AmountBucket[]; weekdays: number[] } {
    const buckets: AmountBucket[] = DISTRIBUTION_BOUNDS.map((min, index) => ({
        min,
        max: index + 1 < DISTRIBUTION_BOUNDS.length ? DISTRIBUTION_BOUNDS[index + 1] : null,
        count: 0,
        total: 0,
    }));
    const weekdays = [0, 0, 0, 0, 0, 0, 0];
    for (const op of ops) {
        if (!counts(op) || op.categoryKind !== 'expense' || op.amount >= 0) continue;
        const value = -op.amount;
        const bucket = buckets.find(b => value >= b.min && (b.max === null || value < b.max));
        if (bucket) {
            bucket.count += 1;
            bucket.total += value;
        }
        // Monday = 0 … Sunday = 6
        const day = new Date(`${op.date.slice(0, 10)}T00:00:00Z`).getUTCDay();
        weekdays[(day + 6) % 7] += value;
    }
    return {
        buckets: buckets.map(b => ({ ...b, total: round2(b.total) })),
        weekdays: weekdays.map(round2),
    };
}

function merchantsOf(ops: readonly CashflowOperation[]): MerchantTotal[] {
    const byKey = new Map<string, MerchantTotal & { lastDate: string }>();
    for (const op of ops) {
        if (!counts(op) || op.categoryKind !== 'expense') continue;
        const entry = byKey.get(op.merchantKey) ?? { merchantKey: op.merchantKey, label: op.label, categoryId: op.categoryId, amount: 0, count: 0, lastDate: '' };
        entry.amount -= op.amount;
        entry.count += 1;
        if (op.date > entry.lastDate) {
            entry.lastDate = op.date;
            entry.label = op.label;
            entry.categoryId = op.categoryId;
        }
        byKey.set(op.merchantKey, entry);
    }
    return [...byKey.values()]
        .filter(m => m.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8)
        .map(({ lastDate: _lastDate, ...rest }) => ({ ...rest, amount: round2(rest.amount) }));
}

function banksOf(ops: readonly CashflowOperation[]): BankTotal[] {
    const byInstitute = new Map<string, BankTotal>();
    for (const op of ops) {
        if (!counts(op)) continue;
        const id = op.instituteId ?? op.accountId;
        const entry = byInstitute.get(id) ?? { instituteId: id, instituteName: op.instituteName ?? op.accountName, income: 0, expenses: 0 };
        if (op.categoryKind === 'income') entry.income += op.amount;
        else if (op.categoryKind === 'expense') entry.expenses -= op.amount;
        byInstitute.set(id, entry);
    }
    return [...byInstitute.values()]
        .map(b => ({ ...b, income: round2(b.income), expenses: round2(b.expenses) }))
        .sort((a, b) => b.expenses - a.expenses);
}

/** Everything the cash flow pages show for one period. `operations` may cover more than the period. */
export function summarizeCashflow(operations: readonly CashflowOperation[], options: SummaryOptions): CashflowSummary {
    const periodOps = operations.filter(op => inPeriod(op, options.periodStart, options.periodEnd));
    const totals = totalsOf(periodOps);
    const categories = categoriesOf(periodOps, operations, options);
    const investmentIncome = categories.find(c => c.categoryId === 'investment_income')?.amount ?? 0;
    const { buckets, weekdays } = distributionOf(periodOps);
    return {
        periodStart: options.periodStart,
        periodEnd: options.periodEnd,
        currency: options.currency,
        income: round2(totals.income),
        expenses: round2(totals.expenses),
        savingsInvested: round2(totals.savingsInvested),
        available: round2(totals.income - totals.expenses - totals.savingsInvested),
        savingsRate: savingsRateOf(totals.income, totals.expenses),
        passiveCoverage: totals.expenses > 0 ? Math.max(0, investmentIncome) / totals.expenses : 0,
        months: monthsOf(operations, options),
        categories,
        sankey: buildSankey(periodOps, categories, options.customCategories ?? []),
        distribution: buckets,
        weekdays,
        topMerchants: merchantsOf(periodOps),
        banks: banksOf(periodOps),
        operationCount: periodOps.length,
        uncategorizedCount: periodOps.filter(op => counts(op) && op.categorySource === 'fallback').length,
    };
}

/** Kind of a category id, built-in or custom (convenience for callers outside the engine). */
export function kindOfCategory(categoryId: string, custom: readonly CustomCashflowCategory[] = []): CashflowCategoryKind {
    return resolveCashflowCategory(categoryId, custom).kind;
}

/** Built-in categories of a kind, in display order (for pickers). */
export function categoriesOfKind(kind: CashflowCategoryKind): string[] {
    return CASHFLOW_CATEGORIES.filter(c => c.kind === kind && !c.parentId).map(c => c.id);
}
