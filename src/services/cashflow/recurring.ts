/**
 * Recurring operations (Epic E52 — TGLA-249 / TGLA-255). Pure functions.
 *
 * Operations of the same merchant, in the same direction, with similar amounts (±25 % of their
 * median) and a regular rhythm form a series: rent, subscriptions, salary, insurance. A series needs
 * at least 3 occurrences; the next date is the last one plus the usual interval.
 */
import type { CashflowOperation, RecurringCadence, RecurringSeries } from '../../types/cashflow';

const DAY_MS = 24 * 60 * 60 * 1000;
const AMOUNT_TOLERANCE = 0.25;
const STEADY_TOLERANCE = 0.03;
const MIN_OCCURRENCES = 3;

const CADENCES: readonly { cadence: RecurringCadence; min: number; max: number; nominal: number }[] = [
    { cadence: 'weekly', min: 6, max: 8, nominal: 7 },
    { cadence: 'biweekly', min: 13, max: 16, nominal: 14 },
    { cadence: 'monthly', min: 26, max: 35, nominal: 30 },
    { cadence: 'quarterly', min: 84, max: 98, nominal: 91 },
    { cadence: 'yearly', min: 350, max: 380, nominal: 365 },
];

const median = (values: readonly number[]): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const dayOf = (iso: string): number => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/** The date one period after `isoDate` (same day of the month for monthly, quarterly and yearly series). */
export const addRecurringInterval = (isoDate: string, cadence: RecurringCadence, intervalDays: number): string => {
    const base = new Date(dayOf(isoDate));
    if (cadence === 'monthly' || cadence === 'quarterly' || cadence === 'yearly') {
        const months = cadence === 'monthly' ? 1 : cadence === 'quarterly' ? 3 : 12;
        const day = base.getUTCDate();
        const next = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1));
        const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
        next.setUTCDate(Math.min(day, lastDay));
        return next.toISOString().slice(0, 10);
    }
    return new Date(base.getTime() + Math.round(intervalDays) * DAY_MS).toISOString().slice(0, 10);
};

/**
 * Latest price change of a steady series: the last amount against the steady amount before it
 * (13.49 ×9 then 15.99 ×3 → +18.5 %). Null when the amount never changed or was never steady.
 */
export function priceChangeOf(amounts: readonly number[]): number | null {
    if (amounts.length < 3) return null;
    const last = amounts[amounts.length - 1];
    let i = amounts.length - 1;
    while (i > 0 && Math.abs(amounts[i - 1] - last) <= last * STEADY_TOLERANCE) i--;
    if (i === 0) return null;
    const previous = amounts[i - 1];
    // The old price must have held at least twice to call it a price
    if (i < 2 || Math.abs(amounts[i - 2] - previous) > previous * STEADY_TOLERANCE) return null;
    const change = (last - previous) / previous;
    return Math.abs(change) >= 0.01 ? change : null;
}

export interface RecurringOptions {
    /** Only operations on or after this ISO date are looked at */
    since?: string;
    /** Keys of series the user dismissed ("not a subscription") */
    dismissedKeys?: ReadonlySet<string>;
}

/** Series found among `operations` (expenses and income; transfers and savings are left out). */
export function detectRecurringSeries(
    operations: readonly CashflowOperation[],
    options: RecurringOptions = {},
): RecurringSeries[] {
    const groups = new Map<string, CashflowOperation[]>();
    for (const op of operations) {
        if (op.excluded || op.categoryKind === 'transfer' || op.categoryKind === 'savings') continue;
        if (options.since && op.date.slice(0, 10) < options.since) continue;
        if (!op.merchantKey) continue;
        const key = `${op.direction}:${op.merchantKey}`;
        const list = groups.get(key) ?? [];
        list.push(op);
        groups.set(key, list);
    }

    const series: RecurringSeries[] = [];
    for (const [key, list] of groups) {
        if (list.length < MIN_OCCURRENCES || options.dismissedKeys?.has(key)) continue;
        const typical = median(list.map(op => Math.abs(op.amount)));
        if (typical <= 0) continue;
        const similar = list
            .filter(op => Math.abs(Math.abs(op.amount) - typical) <= typical * AMOUNT_TOLERANCE)
            .sort((a, b) => a.date.localeCompare(b.date));
        if (similar.length < MIN_OCCURRENCES) continue;

        const intervals: number[] = [];
        for (let i = 1; i < similar.length; i++) {
            intervals.push((dayOf(similar[i].date) - dayOf(similar[i - 1].date)) / DAY_MS);
        }
        const usual = median(intervals);
        const cadence = CADENCES.find(c => usual >= c.min && usual <= c.max);
        if (!cadence) continue;
        // Regular: most intervals sit close to the usual one (a missed month is tolerated once)
        const regular = intervals.filter(gap => Math.abs(gap - usual) <= Math.max(5, usual * 0.25)).length;
        if (regular / intervals.length < 0.7) continue;
        // Steady: most consecutive amounts are (almost) the same; a pharmacy visit every month is not a subscription
        const amounts = similar.map(op => Math.abs(op.amount));
        let steady = 0;
        for (let i = 1; i < amounts.length; i++) if (Math.abs(amounts[i] - amounts[i - 1]) <= amounts[i - 1] * STEADY_TOLERANCE) steady++;
        if (steady / (amounts.length - 1) < 0.6) continue;

        const last = similar[similar.length - 1];
        const lastAmount = amounts[amounts.length - 1];
        const change = priceChangeOf(amounts);
        series.push({
            key,
            merchantKey: last.merchantKey,
            label: last.label,
            categoryId: last.categoryId,
            direction: last.direction,
            cadence: cadence.cadence,
            intervalDays: usual,
            averageAmount: similar.reduce((sum, op) => sum + Math.abs(op.amount), 0) / similar.length,
            lastAmount,
            priceChange: change,
            firstDate: similar[0].date.slice(0, 10),
            lastDate: last.date.slice(0, 10),
            nextDate: addRecurringInterval(last.date, cadence.cadence, usual),
            occurrences: similar.length,
            operationIds: similar.map(op => op.id),
        });
    }
    return series.sort((a, b) => b.averageAmount - a.averageAmount);
}

/** Ids of every operation that belongs to a series (the "fixed" part of the monthly spending). */
export function recurringOperationIds(series: readonly RecurringSeries[]): Set<string> {
    return new Set(series.flatMap(s => s.operationIds));
}
