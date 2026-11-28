/**
 * Periods of the cash flow pages (Epic E52). Pure functions, dates as YYYY-MM-DD (end exclusive).
 */

export type CashflowPeriodPreset = 'month' | '3m' | '6m' | '12m' | 'ytd' | 'all';

export interface CashflowPeriod {
    start: string;
    /** Exclusive */
    end: string;
    /** First day of the monthly trend shown with the period (12 budget months by default) */
    trendStart: string;
}

const pad = (value: number): string => String(value).padStart(2, '0');

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/** YYYY-MM-DD of `day` (clamped to the month length) in month `monthIndex` (0-based, may overflow) of `year`. */
function dayInMonth(year: number, monthIndex: number, day: number): string {
    const first = new Date(Date.UTC(year, monthIndex, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(day, last))}`;
}

/** YYYY-MM of the budget month containing `today`. */
export function currentBudgetMonth(today: Date, monthStartDay: number = 1): string {
    const day = today.getUTCDate();
    const shift = monthStartDay > 1 && day < monthStartDay ? -1 : 0;
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + shift, 1));
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

/** Budget month YYYY-MM shifted by `offset` months. */
export function shiftBudgetMonth(month: string, offset: number): string {
    const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + offset, 1));
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

/** Start (inclusive) and end (exclusive) of a budget month. */
export function budgetMonthBounds(month: string, monthStartDay: number = 1): { start: string; end: string } {
    const year = Number(month.slice(0, 4));
    const index = Number(month.slice(5, 7)) - 1;
    const day = Math.max(1, Math.min(28, monthStartDay));
    return { start: dayInMonth(year, index, day), end: dayInMonth(year, index + 1, day) };
}

export interface PeriodQuery {
    preset: CashflowPeriodPreset;
    /** Budget month for the 'month' preset (YYYY-MM); the current one by default */
    month?: string;
    /** Earliest operation date, for the 'all' preset */
    firstOperationDate?: string;
    monthStartDay?: number;
    today?: Date;
}

/** Resolves a preset to concrete bounds; the trend always covers the 12 budget months up to the period end. */
export function resolvePeriod(query: PeriodQuery): CashflowPeriod {
    const today = query.today ?? new Date();
    const startDay = query.monthStartDay ?? 1;
    const tomorrow = isoDay(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1)));
    const current = currentBudgetMonth(today, startDay);

    let start: string;
    let end: string = tomorrow;
    let lastMonth = current;
    switch (query.preset) {
        case 'month': {
            const month = query.month ?? current;
            const bounds = budgetMonthBounds(month, startDay);
            start = bounds.start;
            end = bounds.end < tomorrow ? bounds.end : tomorrow;
            lastMonth = month;
            break;
        }
        case '3m':
        case '6m':
        case '12m': {
            const months = Number(query.preset.replace('m', ''));
            start = budgetMonthBounds(shiftBudgetMonth(current, -(months - 1)), startDay).start;
            break;
        }
        case 'ytd':
            start = `${today.getUTCFullYear()}-01-01`;
            break;
        case 'all':
        default:
            start = (query.firstOperationDate ?? `${today.getUTCFullYear()}-01-01`).slice(0, 10);
            break;
    }
    const trendStart = budgetMonthBounds(shiftBudgetMonth(lastMonth, -11), startDay).start;
    return { start, end, trendStart: trendStart < start ? trendStart : start };
}
