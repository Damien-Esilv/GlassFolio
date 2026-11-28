/**
 * Bank operations of checking and savings accounts read by a sync (Epic E52 — TGLA-254).
 *
 * - Nothing read once is lost: an operation the bank no longer shows (older than its website keeps) stays in the
 *   journal, and stays editable.
 * - The last 45 days are alive: the bank may still change them (a pending card payment booked, an amount or a date
 *   fixed, an operation cancelled). Each sync matches them again, keeping the journal row (its id, so its category
 *   and note follow), and removes the ones the bank dropped. Older rows are never touched by a sync.
 * - An operation the user deleted is remembered (tombstone) and never comes back.
 *
 * The planning here is pure; the sync engine applies it.
 */
import type { NormalizedActivity } from '../../types/connections';
import type { CashflowUpcoming } from '../../types/cashflow';
import type { UnifiedTransaction } from '../../types/types.backend';
import { merchantKey, normalizeText } from '../cashflow/text';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days a bank may still change: read again and matched at every sync. */
export const LIVE_WINDOW_DAYS = 45;
/** History read at the first sync of an account (or after "Reconnect") when no start date is set. */
export const DEFAULT_HISTORY_MONTHS = 12;
/** A cash balance closer than half a cent to the bank's is the same balance (sums of many 2-decimal amounts drift). */
export const CASH_BALANCE_TOLERANCE = 0.005;
/** The same operation, its id changed: same direction, amount within 1 %, date within 5 days, a similar label. */
const MATCH_DAYS = 5;
const MATCH_AMOUNT_SHARE = 0.01;

export const dayOf = (iso: string): string => iso.slice(0, 10);

export function shiftDay(day: string, days: number): string {
    return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export interface OperationsWindow {
    /** First day read from the bank. */
    since: string;
    /** First day of the live window (matched, updated and removed). */
    liveStart: string;
    /** A full read (first sync of the account, or right after the user reconnected the bank). */
    deep: boolean;
}

/**
 * What one sync reads for one account: the whole history (12 months, or from the connection's start date) the first
 * time or when asked, else the live window only.
 */
export function operationsWindow(input: { now: number; historyStartDate?: string; operationsFrom?: string; deep?: boolean }): OperationsWindow {
    const today = new Date(input.now).toISOString().slice(0, 10);
    const start = input.historyStartDate ? dayOf(input.historyStartDate) : undefined;
    const yearAgo = new Date(input.now);
    yearAgo.setUTCMonth(yearAgo.getUTCMonth() - DEFAULT_HISTORY_MONTHS);
    const deepStart = start ?? yearAgo.toISOString().slice(0, 10);
    const live = shiftDay(today, -LIVE_WINDOW_DAYS);
    const liveStart = start && start > live ? start : live;
    const deep = input.deep === true || !input.operationsFrom;
    return { since: deep && deepStart < liveStart ? deepStart : liveStart, liveStart, deep };
}

const words = (label: string): Set<string> => new Set(normalizeText(label).split(' ').filter(word => word.length > 2 && !/^\d+$/.test(word)));

/** Two labels of the same operation: same merchant, one inside the other, or most words shared. */
export function similarLabels(a: string | undefined, b: string | undefined): boolean {
    const left = merchantKey(a);
    const right = merchantKey(b);
    if (left && left === right) return true;
    const na = normalizeText(a);
    const nb = normalizeText(b);
    if (na && nb && (na.includes(nb) || nb.includes(na))) return true;
    const wa = words(a ?? '');
    const wb = words(b ?? '');
    if (wa.size === 0 || wb.size === 0) return false;
    const shared = [...wa].filter(word => wb.has(word)).length;
    return shared / Math.min(wa.size, wb.size) >= 0.5;
}

/** The raw label a synced row keeps (the sync engine stores the same fallback). */
export const rawLabelOf = (activity: NormalizedActivity): string => activity.rawLabel ?? activity.label ?? activity.rawType;
const labelOf = rawLabelOf;

/** Whether a stored row says something else than the bank now. */
export function differs(row: UnifiedTransaction, activity: NormalizedActivity): boolean {
    return dayOf(row.transactionDate) !== dayOf(activity.date)
        || Math.abs(Number(row.amountPrimary) - Number(activity.amount)) > 1e-6
        || (row.rawLabel || '') !== labelOf(activity)
        || (row.label || '') !== (activity.label ?? '')
        || row.externalId !== activity.externalId
        || row.subType !== activity.subType;
}

export interface CashPlanInput {
    /** Operations of the bank, already limited to the days read. */
    read: NormalizedActivity[];
    /** Rows this connection synced into the account. */
    existing: UnifiedTransaction[];
    liveStart: string;
    /** External ids of the operations the user deleted. */
    deletedIds: ReadonlySet<string>;
    /** False when the read may have missed operations (cut short): nothing is removed then. */
    complete: boolean;
}

export interface CashPlan {
    add: NormalizedActivity[];
    update: Array<{ row: UnifiedTransaction; activity: NormalizedActivity }>;
    remove: UnifiedTransaction[];
}

/**
 * Matches the bank's operations with the stored rows: by id, then (live window only) by direction, amount, date and
 * label for an operation whose id changed. Unmatched live rows are removed, unless the read looks incomplete (cut
 * short, or no operation at all in the live window: an empty page is likelier than every operation cancelled).
 */
export function planCashOperations(input: CashPlanInput): CashPlan {
    const live = (iso: string): boolean => dayOf(iso) >= input.liveStart;
    const byId = new Map<string, UnifiedTransaction>();
    for (const row of input.existing) if (row.externalId && !byId.has(row.externalId)) byId.set(row.externalId, row);

    const used = new Set<string>();
    const plan: CashPlan = { add: [], update: [], remove: [] };
    const pending: NormalizedActivity[] = [];
    for (const activity of input.read) {
        if (input.deletedIds.has(activity.externalId)) continue;
        const row = byId.get(activity.externalId);
        if (row && !used.has(row.id)) {
            used.add(row.id);
            if ((live(row.transactionDate) || live(activity.date)) && differs(row, activity)) plan.update.push({ row, activity });
            continue;
        }
        pending.push(activity);
    }

    const candidates = input.existing.filter(row => !used.has(row.id) && live(row.transactionDate));
    for (const activity of pending) {
        if (!live(activity.date)) {
            plan.add.push(activity);
            continue;
        }
        const amount = Number(activity.amount);
        const time = Date.parse(activity.date);
        let best: { row: UnifiedTransaction; score: number } | undefined;
        for (const row of candidates) {
            if (used.has(row.id)) continue;
            const stored = Number(row.amountPrimary);
            if (Math.sign(stored) !== Math.sign(amount)) continue;
            if (Math.abs(stored - amount) > Math.max(0.01, Math.abs(amount) * MATCH_AMOUNT_SHARE)) continue;
            const days = Math.abs(Date.parse(row.transactionDate) - time) / DAY_MS;
            if (days > MATCH_DAYS) continue;
            if (!similarLabels(row.rawLabel || row.label, labelOf(activity))) continue;
            const score = days + Math.abs(stored - amount);
            if (!best || score < best.score) best = { row, score };
        }
        if (best) {
            used.add(best.row.id);
            plan.update.push({ row: best.row, activity });
        } else {
            plan.add.push(activity);
        }
    }

    const readsLive = input.read.some(activity => live(activity.date));
    if (input.complete && readsLive) plan.remove = candidates.filter(row => !used.has(row.id));
    return plan;
}

/** The coming operations of an account, as the collection keeps them. */
export function toUpcoming(
    activities: NormalizedActivity[],
    context: { accountId: string; connectionId: string; ownerId: string; readAt: string },
): CashflowUpcoming[] {
    return activities.map(activity => ({
        id: `cfu-${context.accountId}-${activity.externalId}`,
        ownerId: context.ownerId,
        accountId: context.accountId,
        connectionId: context.connectionId,
        externalId: activity.externalId,
        date: activity.date,
        amount: activity.amount,
        currency: activity.currency,
        label: activity.label ?? activity.rawLabel ?? '',
        rawLabel: activity.rawLabel ?? activity.label ?? '',
        bankHints: activity.bankHints,
        readAt: context.readAt,
    }));
}
