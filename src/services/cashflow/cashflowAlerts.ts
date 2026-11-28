/**
 * Notifications of the cash flow (Epic E52 — TGLA-255, TGLA-256), category "cashflow": a budget over its cap this
 * month, a new subscription detected, a recurring payment whose price went up. Each one has a dedupKey, so it is
 * shown once (and never again once dismissed).
 */
import type { Alert } from '../../types';
import type { CashflowRecurringItem } from '../../types/cashflow';
import { getBuiltinCashflowCategory } from '../../constants/cashflowCategories';
import { cashflowPlanningService } from './cashflowPlanningService';
import { cashflowService } from './cashflowService';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A price change below this is rounding, not a rise. */
const PRICE_RISE_MIN = 0.02;
/** A rise or a new series is news while its last payment is this recent. */
const RECENT_DAYS = 45;

/** A series is new when its first payment came within three of its periods (plus a little slack). */
export function isNewSeries(item: Pick<CashflowRecurringItem, 'firstDate' | 'intervalDays'>, now: number): boolean {
    return now - Date.parse(`${item.firstDate.slice(0, 10)}T00:00:00Z`) <= (3 * item.intervalDays + 15) * DAY_MS;
}

const recent = (date: string, now: number): boolean => now - Date.parse(`${date.slice(0, 10)}T00:00:00Z`) <= RECENT_DAYS * DAY_MS;

/** A payment that went up by 2 % or more on its latest occurrence, in the last 45 days: the same rule for the
 * notification and the "Price rises" panel of the Recurring tab. */
export function isRecentPriceRise(item: Pick<CashflowRecurringItem, 'direction' | 'status' | 'priceChange' | 'lastDate'>, now: number): boolean {
    return item.direction === 'out' && item.status !== 'ignored' && item.priceChange !== null && item.priceChange >= PRICE_RISE_MIN && recent(item.lastDate, now);
}

/** Deduplication key of the "Price rise" notification of a series' latest payment (shared with the Recurring tab). */
export const priceRiseKey = (item: Pick<CashflowRecurringItem, 'key' | 'lastDate'>): string => `recurring-rise-${item.key}-${item.lastDate.slice(0, 10)}`;

/** The "Price rise" notification of a series. */
export function priceRiseAlert(item: Pick<CashflowRecurringItem, 'key' | 'label' | 'lastDate' | 'lastAmount' | 'priceChange'>, currency: string, nowIso: string, read = false): Alert {
    const percent = Math.round((item.priceChange ?? 0) * 100);
    return {
        id: `cf-${priceRiseKey(item)}`,
        type: 'warning',
        category: 'cashflow',
        title: 'Price rise',
        message: `${item.label} went up ${percent}% (${item.lastAmount.toFixed(2)} ${currency}).`,
        titleKey: 'notifications:engine.priceRiseTitle',
        messageKey: 'notifications:engine.priceRise',
        params: { merchant: item.label, percent, amount: item.lastAmount.toFixed(2), currency },
        date: nowIso,
        read,
        dedupKey: priceRiseKey(item),
        actionUrl: '/cashflow/recurring',
        actionLabelKey: 'common:actions.review',
    };
}

export async function cashflowAlertCandidates(currency: string, nowIso: string = new Date().toISOString()): Promise<Alert[]> {
    const now = Date.parse(nowIso);
    const candidates: Alert[] = [];
    const [{ month, statuses }, recurring] = await Promise.all([
        cashflowPlanningService.getBudgetStatus({ currency }),
        cashflowService.listRecurring({ currency }),
    ]);

    const over = statuses.filter(item => item.state === 'over');
    // Category names come with the cash flow texts, loaded on demand (they stay out of the main bundle)
    const i18n = over.length > 0
        ? await import('../../pages/cashflow/cashflowI18n').then(() => import('../../i18n')).then(module => module.default).catch(() => undefined)
        : undefined;
    const categoryName = (id: string): string => {
        const key = getBuiltinCashflowCategory(id)?.i18nKey ?? id;
        return i18n ? i18n.t(`cashflow:categories.${key}`, { defaultValue: id }) : id;
    };
    for (const status of over) {
        candidates.push({
            id: `cf-budget-${status.categoryId}-${month}`,
            type: 'warning',
            category: 'cashflow',
            title: 'Budget exceeded',
            message: `${categoryName(status.categoryId)}: ${Math.round(status.spent)} of ${Math.round(status.limit)} ${currency} this month.`,
            titleKey: 'notifications:engine.budgetOverTitle',
            messageKey: 'notifications:engine.budgetOver',
            params: { category: categoryName(status.categoryId), spent: Math.round(status.spent), limit: Math.round(status.limit), currency },
            date: nowIso,
            read: false,
            dedupKey: `budget-${status.categoryId}-${month}`,
            actionUrl: '/cashflow/budgets',
            actionLabelKey: 'common:actions.review',
        });
    }

    for (const item of recurring.items.filter(series => series.direction === 'out' && series.status !== 'ignored')) {
        if (item.status === 'detected' && isNewSeries(item, now) && recent(item.lastDate, now)) {
            candidates.push({
                id: `cf-recurring-new-${item.key}`,
                type: 'info',
                category: 'cashflow',
                title: 'New subscription detected',
                message: `${item.label}: ${item.lastAmount.toFixed(2)} ${currency} (${item.cadence}).`,
                titleKey: 'notifications:engine.newSubscriptionTitle',
                messageKey: 'notifications:engine.newSubscription',
                params: { merchant: item.label, amount: item.lastAmount.toFixed(2), currency, cadence: item.cadence },
                date: nowIso,
                read: false,
                dedupKey: `recurring-new-${item.key}`,
                actionUrl: '/cashflow/recurring',
                actionLabelKey: 'common:actions.review',
            });
        }
        if (isRecentPriceRise(item, now)) candidates.push(priceRiseAlert(item, currency, nowIso));
    }
    return candidates;
}
