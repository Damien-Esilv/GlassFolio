/**
 * Budgets and end-of-month forecast of the cash flow (Epic E52 — TGLA-256, TGLA-257). Pure functions; the service
 * gathers the data (summary, operations, coming operations, recurring series, balances).
 */
import type { BudgetState, BudgetStatus, CashflowBudget, CashflowCategoryTotal, ForecastPoint } from '../../types/cashflow';

/** A budget is "near" from 80 % of its cap. */
export const BUDGET_NEAR_RATIO = 0.8;

export function budgetState(ratio: number): BudgetState {
    if (ratio > 1) return 'over';
    if (ratio >= BUDGET_NEAR_RATIO) return 'near';
    return 'ok';
}

/** Each budget against what its category (and its sub-categories) spent in the month. */
export function budgetStatuses(budgets: readonly CashflowBudget[], categories: readonly CashflowCategoryTotal[]): BudgetStatus[] {
    const spentBy = new Map(categories.filter(c => c.kind === 'expense').map(c => [c.categoryId, Math.max(c.amount, 0)]));
    return budgets
        .filter(budget => budget.monthlyLimit > 0)
        .map(budget => {
            const spent = Math.round((spentBy.get(budget.categoryId) ?? 0) * 100) / 100;
            const ratio = spent / budget.monthlyLimit;
            return {
                categoryId: budget.categoryId,
                limit: budget.monthlyLimit,
                spent,
                ratio,
                remaining: Math.round((budget.monthlyLimit - spent) * 100) / 100,
                state: budgetState(ratio),
            };
        })
        .sort((a, b) => b.ratio - a.ratio);
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const shiftIsoDay = (day: string, days: number): string =>
    new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);

export interface ForecastInput {
    /** First day of the budget month and today (YYYY-MM-DD) */
    start: string;
    today: string;
    /** Exclusive end of the budget month */
    end: string;
    balanceToday: number;
    /** Operations of the month already made (base currency, signed): used to draw the days before today */
    pastOperations: ReadonlyArray<{ date: string; amount: number }>;
    /** Operations expected from tomorrow on (announced by the bank, recurring), signed */
    expected: ReadonlyArray<{ date: string; amount: number }>;
    /** Day-to-day spending per day, positive */
    variablePerDay: number;
}

/**
 * The month as a curve: the known balance of each day until today (today's balance minus what happened after),
 * then a projection to the month end (expected operations on their day, day-to-day spending every day).
 */
export function forecastPoints(input: ForecastInput): ForecastPoint[] {
    const points: ForecastPoint[] = [];
    const lastDay = shiftIsoDay(input.end, -1);
    const sortedPast = [...input.pastOperations].sort((a, b) => a.date.localeCompare(b.date));
    for (let day = input.start; day <= input.today; day = shiftIsoDay(day, 1)) {
        const after = sortedPast.filter(op => op.date.slice(0, 10) > day).reduce((sum, op) => sum + op.amount, 0);
        points.push({ date: day, balance: round(input.balanceToday - after), projected: false });
    }
    let balance = input.balanceToday;
    for (let day = shiftIsoDay(input.today, 1); day <= lastDay; day = shiftIsoDay(day, 1)) {
        balance += input.expected.filter(op => op.date.slice(0, 10) === day).reduce((sum, op) => sum + op.amount, 0);
        balance -= input.variablePerDay;
        points.push({ date: day, balance: round(balance), projected: true });
    }
    return points;
}

const round = (value: number): number => Math.round(value * 100) / 100;
