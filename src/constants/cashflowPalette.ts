/**
 * Cash flow palette (Epic E52 — TGLA-247).
 *
 * The cash flow needs far more colours than the 8 comparison slots (`CHART_SERIES_PALETTE`): one per
 * spending category, flow roles (money in, money out, available, savings), and a sequential ramp for
 * amount buckets. Every colour is a CSS variable declared once per theme in src/index.css
 * (`--color-cashflow-*`, contrast >= 3:1 on the cards, checked by tests/unit/standards/cashflowPalette.test.ts).
 *
 * Gains and losses keep their meaning: budget states and deltas use `THEME_INTENT` / `TrendBadge`
 * (with `goodDirection="down"` for spending), never these colours.
 *
 * Class names are written out in full so the Tailwind build finds them; only the text and tint
 * classes the pages use are listed, so the stylesheet stays small.
 */

export interface CashflowColorTokens {
    id: string;
    /** For SVG and Recharts props: `var(--color-cashflow-…)` */
    cssVar: string;
    text: string;
    /** 10 % tint for pills and row backgrounds */
    bgSubtle: string;
}

/** Ramp steps only paint charts: a CSS variable, no utility class. */
export interface CashflowRampToken {
    id: string;
    cssVar: string;
}

export type CashflowRole = 'income' | 'expense' | 'expenseFixed' | 'available' | 'savings' | 'transfer' | 'forecast';

/** Flow roles: money in, money out (variable / recurring), available cash, savings, internal transfers, forecast. */
export const CASHFLOW_ROLE_TOKENS: Readonly<Record<CashflowRole, CashflowColorTokens>> = {
    income: { id: 'income', cssVar: 'var(--color-cashflow-income)', text: 'text-cashflow-income', bgSubtle: 'bg-cashflow-income/10' },
    expense: { id: 'expense', cssVar: 'var(--color-cashflow-expense)', text: 'text-cashflow-expense', bgSubtle: 'bg-cashflow-expense/10' },
    expenseFixed: { id: 'expense-fixed', cssVar: 'var(--color-cashflow-expense-fixed)', text: 'text-cashflow-expense-fixed', bgSubtle: 'bg-cashflow-expense-fixed/10' },
    available: { id: 'available', cssVar: 'var(--color-cashflow-available)', text: 'text-cashflow-available', bgSubtle: 'bg-cashflow-available/10' },
    savings: { id: 'savings', cssVar: 'var(--color-cashflow-savings)', text: 'text-cashflow-savings', bgSubtle: 'bg-cashflow-savings/10' },
    transfer: { id: 'transfer', cssVar: 'var(--color-cashflow-transfer)', text: 'text-cashflow-transfer', bgSubtle: 'bg-cashflow-transfer/10' },
    forecast: { id: 'forecast', cssVar: 'var(--color-cashflow-forecast)', text: 'text-cashflow-forecast', bgSubtle: 'bg-cashflow-forecast/10' },
};

/** 16 spending-category slots, ordered so that neighbouring slots are far apart on the colour wheel. */
export const CASHFLOW_CATEGORY_PALETTE: readonly CashflowColorTokens[] = [
    { id: 'cat-1', cssVar: 'var(--color-cashflow-cat-1)', text: 'text-cashflow-cat-1', bgSubtle: 'bg-cashflow-cat-1/10' },
    { id: 'cat-2', cssVar: 'var(--color-cashflow-cat-2)', text: 'text-cashflow-cat-2', bgSubtle: 'bg-cashflow-cat-2/10' },
    { id: 'cat-3', cssVar: 'var(--color-cashflow-cat-3)', text: 'text-cashflow-cat-3', bgSubtle: 'bg-cashflow-cat-3/10' },
    { id: 'cat-4', cssVar: 'var(--color-cashflow-cat-4)', text: 'text-cashflow-cat-4', bgSubtle: 'bg-cashflow-cat-4/10' },
    { id: 'cat-5', cssVar: 'var(--color-cashflow-cat-5)', text: 'text-cashflow-cat-5', bgSubtle: 'bg-cashflow-cat-5/10' },
    { id: 'cat-6', cssVar: 'var(--color-cashflow-cat-6)', text: 'text-cashflow-cat-6', bgSubtle: 'bg-cashflow-cat-6/10' },
    { id: 'cat-7', cssVar: 'var(--color-cashflow-cat-7)', text: 'text-cashflow-cat-7', bgSubtle: 'bg-cashflow-cat-7/10' },
    { id: 'cat-8', cssVar: 'var(--color-cashflow-cat-8)', text: 'text-cashflow-cat-8', bgSubtle: 'bg-cashflow-cat-8/10' },
    { id: 'cat-9', cssVar: 'var(--color-cashflow-cat-9)', text: 'text-cashflow-cat-9', bgSubtle: 'bg-cashflow-cat-9/10' },
    { id: 'cat-10', cssVar: 'var(--color-cashflow-cat-10)', text: 'text-cashflow-cat-10', bgSubtle: 'bg-cashflow-cat-10/10' },
    { id: 'cat-11', cssVar: 'var(--color-cashflow-cat-11)', text: 'text-cashflow-cat-11', bgSubtle: 'bg-cashflow-cat-11/10' },
    { id: 'cat-12', cssVar: 'var(--color-cashflow-cat-12)', text: 'text-cashflow-cat-12', bgSubtle: 'bg-cashflow-cat-12/10' },
    { id: 'cat-13', cssVar: 'var(--color-cashflow-cat-13)', text: 'text-cashflow-cat-13', bgSubtle: 'bg-cashflow-cat-13/10' },
    { id: 'cat-14', cssVar: 'var(--color-cashflow-cat-14)', text: 'text-cashflow-cat-14', bgSubtle: 'bg-cashflow-cat-14/10' },
    { id: 'cat-15', cssVar: 'var(--color-cashflow-cat-15)', text: 'text-cashflow-cat-15', bgSubtle: 'bg-cashflow-cat-15/10' },
    { id: 'cat-16', cssVar: 'var(--color-cashflow-cat-16)', text: 'text-cashflow-cat-16', bgSubtle: 'bg-cashflow-cat-16/10' },
];

/** 4 shades for income categories (salary, investment income, benefits, other). */
export const CASHFLOW_INCOME_PALETTE: readonly CashflowColorTokens[] = [
    { id: 'income-1', cssVar: 'var(--color-cashflow-income-1)', text: 'text-cashflow-income-1', bgSubtle: 'bg-cashflow-income-1/10' },
    { id: 'income-2', cssVar: 'var(--color-cashflow-income-2)', text: 'text-cashflow-income-2', bgSubtle: 'bg-cashflow-income-2/10' },
    { id: 'income-3', cssVar: 'var(--color-cashflow-income-3)', text: 'text-cashflow-income-3', bgSubtle: 'bg-cashflow-income-3/10' },
    { id: 'income-4', cssVar: 'var(--color-cashflow-income-4)', text: 'text-cashflow-income-4', bgSubtle: 'bg-cashflow-income-4/10' },
];

/** Sequential ramp, small amounts (1) to large amounts (7): amount buckets of the distribution. */
export const CASHFLOW_RAMP: readonly CashflowRampToken[] = [
    { id: 'ramp-1', cssVar: 'var(--color-cashflow-ramp-1)' },
    { id: 'ramp-2', cssVar: 'var(--color-cashflow-ramp-2)' },
    { id: 'ramp-3', cssVar: 'var(--color-cashflow-ramp-3)' },
    { id: 'ramp-4', cssVar: 'var(--color-cashflow-ramp-4)' },
    { id: 'ramp-5', cssVar: 'var(--color-cashflow-ramp-5)' },
    { id: 'ramp-6', cssVar: 'var(--color-cashflow-ramp-6)' },
    { id: 'ramp-7', cssVar: 'var(--color-cashflow-ramp-7)' },
];

/** Ramp token for bucket `index` (clamped to the 7 steps). */
export function getCashflowRampTokens(index: number): CashflowRampToken {
    const step = Math.min(CASHFLOW_RAMP.length - 1, Math.max(0, Math.trunc(index)));
    return CASHFLOW_RAMP[step];
}
