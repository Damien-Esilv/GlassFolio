/**
 * Periods of the cash flow pages (Epic E52). Pure functions, dates as YYYY-MM-DD (end exclusive).
 */

export type CashflowPeriodPreset = 'month' | '3m' | '6m' | '12m' | 'ytd' | 'all';

export interface CashflowPeriod {
    start: string;
    /** Exclusive */
    end: string;
    /** First day of the monthly trend shown with the period: its own months, at least the last 6 */
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
    /**
     * Anchor of the period (YYYY-MM), the current budget month by default: the month itself ('month'), the last month
     * of a 3, 6 or 12-month window, or a month of the year ('ytd': that calendar year, up to today for this one).
     */
    month?: string;
    /** Earliest operation date, for the 'all' preset */
    firstOperationDate?: string;
    monthStartDay?: number;
    today?: Date;
}

/** Fewest months the month-after-month chart shows: a month or a quarter is read against the half-year before it. */
export const MIN_TREND_MONTHS = 6;

/** Resolves a preset to concrete bounds; the trend covers the period's months, at least the 6 up to its end. */
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
            const anchor = query.month && query.month < current ? query.month : current;
            start = budgetMonthBounds(shiftBudgetMonth(anchor, -(presetSpan(query.preset) - 1)), startDay).start;
            const anchorEnd = budgetMonthBounds(anchor, startDay).end;
            end = anchorEnd < tomorrow ? anchorEnd : tomorrow;
            lastMonth = anchor;
            break;
        }
        case 'ytd': {
            const year = Math.min(Number((query.month ?? current).slice(0, 4)), today.getUTCFullYear());
            start = `${year}-01-01`;
            const nextYear = `${year + 1}-01-01`;
            end = nextYear < tomorrow ? nextYear : tomorrow;
            lastMonth = year === today.getUTCFullYear() ? current : `${year}-12`;
            break;
        }
        case 'all':
        default:
            start = (query.firstOperationDate ?? `${today.getUTCFullYear()}-01-01`).slice(0, 10);
            break;
    }
    // The trend shows the months of the period, with at least the 6 months up to its end for context
    const trendStart = budgetMonthBounds(shiftBudgetMonth(lastMonth, -(MIN_TREND_MONTHS - 1)), startDay).start;
    return { start, end, trendStart: trendStart < start ? trendStart : start };
}

/** Months one step of the period carousel covers: 1, 3, 6 or 12 (a calendar year for 'ytd'). */
export function presetSpan(preset: CashflowPeriodPreset): number {
    if (preset === '3m') return 3;
    if (preset === '6m') return 6;
    if (preset === '12m' || preset === 'ytd') return 12;
    return 1;
}

/**
 * The anchor one step back (-1) or forward (+1) in the period carousel: a month, a block of 3, 6 or 12 months, or a
 * calendar year. Never past the current budget month.
 */
export function shiftPeriodAnchor(preset: CashflowPeriodPreset, anchor: string, step: -1 | 1, current: string): string {
    const next = preset === 'ytd'
        ? `${Number(anchor.slice(0, 4)) + step}-12`
        : shiftBudgetMonth(anchor, step * presetSpan(preset));
    return next > current ? current : next;
}

/** Whether the carousel can move forward from this anchor. */
export function canMoveForward(preset: CashflowPeriodPreset, anchor: string, current: string): boolean {
    return preset === 'ytd' ? anchor.slice(0, 4) < current.slice(0, 4) : anchor < current;
}

/** First and last month of the period the carousel shows for an anchor. */
export function periodMonths(preset: CashflowPeriodPreset, anchor: string, current: string): { first: string; last: string } {
    if (preset === 'ytd') {
        const year = anchor.slice(0, 4);
        return { first: `${year}-01`, last: year === current.slice(0, 4) ? current : `${year}-12` };
    }
    const last = anchor > current ? current : anchor;
    return { first: shiftBudgetMonth(last, -(presetSpan(preset) - 1)), last };
}
