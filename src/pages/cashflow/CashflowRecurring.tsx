/**
 * Recurring payments (Epic E52 — TGLA-255), after Finary: money in, money out, available and recurring for the
 * month; the month as a calendar (or a list) with each payment on its day, made or expected; the series detected
 * over the last 6 months, which the user confirms or sets aside.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Check, EyeOff, List, RotateCcw, TrendingUp } from 'lucide-react';
import { TrendBadge } from '../../components/ui/TrendBadge';
import { CASHFLOW_ROLE_TOKENS } from '../../constants/cashflowPalette';
import { isRecentPriceRise, priceRiseAlert, priceRiseKey } from '../../services/cashflow/cashflowAlerts';
import { alertService } from '../../services/alertService';
import { useData } from '../../context/DataContext';
import { cashflowService } from '../../services/cashflow/cashflowService';
import { shiftDay } from '../../services/connectors/cashHistory';
import type { CashflowRecurringItem, RecurringStatus } from '../../types/cashflow';
import { ColorDot, MerchantAvatar } from '../../components/cashflow/CategoryBadge';
import { CountUpMoney } from '../../components/cashflow/CountUp';
import type { CashflowLabels } from '../../components/cashflow/useCashflowLabels';
import { useCashflow } from './CashflowLayout';

const card = 'rounded-2xl bg-card p-6 shadow-lg border border-border';
const AVATARS_PER_DAY = 2;
const STAGGER_MS = 40;

type View = 'calendar' | 'list';

interface DayPayment {
    item: CashflowRecurringItem;
    amount: number;
    expected: boolean;
}

/** Monday-first weekday of a YYYY-MM-DD (0 = Monday). */
const weekday = (day: string): number => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;

/** The calendar of the budget month: whole weeks from the Monday before its first day to the Sunday after its last. */
function calendarDays(start: string, end: string): string[] {
    const last = shiftDay(end, -1);
    const days: string[] = [];
    let day = shiftDay(start, -weekday(start));
    const stop = shiftDay(last, 6 - weekday(last));
    while (day <= stop && days.length < 42) {
        days.push(day);
        day = shiftDay(day, 1);
    }
    return days;
}

const Kpi: React.FC<{ label: string; value: number; cssVar: string; labels: CashflowLabels; highlighted?: boolean }> = ({ label, value, cssVar, labels, highlighted = false }) => (
    <div className={`rounded-xl bg-subtle border px-4 py-3 space-y-1 ${highlighted ? 'border-brand' : 'border-subtle'}`}>
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-tertiary"><ColorDot cssVar={cssVar} />{label}</p>
        <p className={`text-xl font-bold tabular-nums ${highlighted ? 'text-brand' : 'text-primary'}`}><CountUpMoney value={value} labels={labels} /></p>
    </div>
);

const StatusActions: React.FC<{ item: CashflowRecurringItem; onChange: (status: RecurringStatus) => void }> = ({ item, onChange }) => {
    const { t } = useTranslation();
    const button = 'inline-flex items-center justify-center w-9 h-9 rounded-lg border border-subtle text-secondary hover:text-primary hover:bg-subtle';
    if (item.status === 'ignored') {
        return (
            <button type="button" onClick={() => onChange('detected')} className={button} title={t('cashflow:recurring.restore')} aria-label={`${t('cashflow:recurring.restore')} ${item.label}`}>
                <RotateCcw size={16} />
            </button>
        );
    }
    return (
        <div className="flex items-center gap-1.5">
            {item.status === 'confirmed' ? (
                <span className="text-[11px] font-bold uppercase px-2 py-1 rounded-full bg-positive-subtle text-positive">{t('cashflow:recurring.confirmed')}</span>
            ) : (
                <button type="button" onClick={() => onChange('confirmed')} className={button} title={t('cashflow:recurring.confirm')} aria-label={`${t('cashflow:recurring.confirm')} ${item.label}`}>
                    <Check size={16} />
                </button>
            )}
            <button type="button" onClick={() => onChange('ignored')} className={button} title={t('cashflow:recurring.ignore')} aria-label={`${t('cashflow:recurring.ignore')} ${item.label}`}>
                <EyeOff size={16} />
            </button>
        </div>
    );
};

const CashflowRecurring: React.FC = () => {
    const { t } = useTranslation();
    const { summary, month, accountIds, currency, version, refresh, labels, customCategories } = useCashflow();
    const [data, setData] = useState<{ start: string; end: string; items: CashflowRecurringItem[] } | null>(null);
    const [view, setView] = useState<View>('calendar');
    const [selectedDay, setSelectedDay] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        cashflowService.listRecurring({ currency, month, accountIds }).then(result => { if (!cancelled) setData(result); });
        return () => { cancelled = true; };
    }, [currency, month, accountIds, version]);

    useEffect(() => setSelectedDay(null), [month]);

    const active = useMemo(() => (data?.items ?? []).filter(item => item.status !== 'ignored'), [data]);
    const ignored = useMemo(() => (data?.items ?? []).filter(item => item.status === 'ignored'), [data]);
    const { alerts, refreshData } = useData();
    // A rise read here or in the notification centre is read in both: the panel follows the "Price rise" notification
    const rises = useMemo(() => {
        const now = Date.now();
        const read = new Set((alerts ?? []).filter(alert => alert.read && alert.dedupKey).map(alert => alert.dedupKey as string));
        return active
            .filter(item => isRecentPriceRise(item, now) && !read.has(priceRiseKey(item)))
            .sort((a, b) => (b.priceChange ?? 0) - (a.priceChange ?? 0));
    }, [active, alerts]);

    const acknowledgeRise = async (item: CashflowRecurringItem): Promise<void> => {
        const stored = await alertService.getAlerts();
        const existing = stored.find(alert => alert.dedupKey === priceRiseKey(item));
        if (existing) await alertService.markAlertAsRead(existing.id);
        else await alertService.saveAlerts([...stored, priceRiseAlert(item, currency, new Date().toISOString(), true)]);
        await refreshData();
    };
    const byDay = useMemo(() => {
        const map = new Map<string, DayPayment[]>();
        for (const item of active) {
            for (const payment of item.payments) {
                const list = map.get(payment.date) ?? [];
                list.push({ item, amount: payment.amount, expected: payment.expected });
                map.set(payment.date, list);
            }
        }
        return map;
    }, [active]);
    const recurringOut = useMemo(() => active
        .filter(item => item.direction === 'out')
        .reduce((sum, item) => sum + item.payments.reduce((total, payment) => total + payment.amount, 0), 0), [active]);

    if (!summary || !data) return null;

    const setStatus = async (item: CashflowRecurringItem, status: RecurringStatus): Promise<void> => {
        await cashflowService.setRecurringStatus(item.key, status);
        refresh();
    };

    const today = new Date().toISOString().slice(0, 10);
    const dayFormat = new Intl.DateTimeFormat(labels.locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
    const longDay = new Intl.DateTimeFormat(labels.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    const weekdayNames = Array.from({ length: 7 }, (_, index) =>
        new Intl.DateTimeFormat(labels.locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + index))).toUpperCase());
    const shownItems = selectedDay ? (byDay.get(selectedDay) ?? []).map(payment => payment.item) : active;

    const row = (item: CashflowRecurringItem, index: number) => {
        const payment = selectedDay ? item.payments.find(entry => entry.date === selectedDay) : undefined;
        const date = payment?.date ?? (item.nextDate >= today ? item.nextDate : item.lastDate);
        const amount = payment?.amount ?? (item.direction === 'out' ? -item.lastAmount : item.lastAmount);
        return (
            <li key={item.key} className="animate-row-in flex items-center gap-3 py-3" style={{ animationDelay: `${Math.min(index, 15) * STAGGER_MS}ms` }}>
                <MerchantAvatar label={item.label} categoryId={item.categoryId} customCategories={customCategories} size={40} />
                <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-primary truncate">{item.label}</span>
                    <span className="block text-xs text-tertiary">
                        {t(`cashflow:recurring.cadence.${item.cadence}`)} · {t(date === item.nextDate ? 'cashflow:recurring.next' : 'cashflow:recurring.last', { date: dayFormat.format(new Date(`${date}T00:00:00Z`)) })}
                    </span>
                </span>
                {item.priceChange !== null && <TrendBadge value={item.priceChange * 100} goodDirection={item.direction === 'out' ? 'down' : 'up'} decimals={0} />}
                <span className={`text-sm font-bold tabular-nums whitespace-nowrap ${amount > 0 ? 'text-positive' : 'text-primary'}`}>{labels.money(amount, 2)}</span>
                <StatusActions item={item} onChange={status => void setStatus(item, status)} />
            </li>
        );
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi label={t('cashflow:kpi.income')} value={summary.income} cssVar={CASHFLOW_ROLE_TOKENS.income.cssVar} labels={labels} />
                <Kpi label={t('cashflow:kpi.expenses')} value={-summary.expenses} cssVar={CASHFLOW_ROLE_TOKENS.expense.cssVar} labels={labels} />
                <Kpi label={t('cashflow:kpi.available')} value={summary.available} cssVar={CASHFLOW_ROLE_TOKENS.available.cssVar} labels={labels} />
                <Kpi label={t('cashflow:recurring.total')} value={recurringOut} cssVar={CASHFLOW_ROLE_TOKENS.expenseFixed.cssVar} labels={labels} highlighted />
            </div>

            {/* Price rises first: the same rule as the "Price rise" notification */}
            {rises.length > 0 && (
                <section className="rounded-2xl border border-warning/40 bg-warning/10 p-5 space-y-3" aria-label={t('cashflow:recurring.rises.title', { count: rises.length })}>
                    <div className="space-y-0.5">
                        <h2 className="flex items-center gap-2 text-sm font-bold text-primary">
                            <TrendingUp size={16} className="text-warning" aria-hidden="true" />
                            {t('cashflow:recurring.rises.title', { count: rises.length })}
                        </h2>
                        <p className="text-xs text-secondary">{t('cashflow:recurring.rises.hint')}</p>
                    </div>
                    <ul className="space-y-2">
                        {rises.map(item => {
                            const before = item.lastAmount / (1 + (item.priceChange ?? 0));
                            return (
                                <li key={item.key} className="flex flex-wrap items-center gap-3 rounded-xl bg-card border border-subtle px-3 py-2.5">
                                    <MerchantAvatar label={item.label} categoryId={item.categoryId} customCategories={customCategories} size={32} />
                                    <span className="flex-1 min-w-[10rem]">
                                        <span className="block text-sm font-semibold text-primary truncate">{item.label}</span>
                                        <span className="block text-xs text-tertiary">
                                            {t('cashflow:recurring.rises.since', { date: dayFormat.format(new Date(`${item.lastDate.slice(0, 10)}T00:00:00Z`)) })}
                                        </span>
                                    </span>
                                    <span className="text-sm tabular-nums text-secondary whitespace-nowrap">
                                        {labels.money(before, 2)} → <span className="font-bold text-primary">{labels.money(item.lastAmount, 2)}</span>
                                    </span>
                                    <TrendBadge value={(item.priceChange ?? 0) * 100} goodDirection="down" decimals={0} />
                                    <button
                                        type="button"
                                        onClick={() => void acknowledgeRise(item)}
                                        className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border border-subtle text-secondary hover:text-primary hover:bg-subtle"
                                        aria-label={t('cashflow:recurring.rises.acknowledgeFor', { merchant: item.label })}
                                    >
                                        <Check size={14} aria-hidden="true" /> {t('cashflow:recurring.rises.acknowledge')}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            <section className={`${card} space-y-5`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex gap-1 bg-subtle p-1 rounded-xl" role="group" aria-label={t('cashflow:recurring.viewLabel')}>
                        {([['calendar', CalendarDays], ['list', List]] as const).map(([key, Icon]) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={view === key}
                                onClick={() => setView(key)}
                                className={`flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-bold transition-all ${view === key ? 'bg-card text-brand shadow-sm border border-subtle' : 'text-secondary hover:text-primary'}`}
                            >
                                <Icon size={14} /> {t(`cashflow:recurring.views.${key}`)}
                            </button>
                        ))}
                    </div>
                    {selectedDay && (
                        <button type="button" onClick={() => setSelectedDay(null)} className="text-xs font-semibold text-brand hover:underline">
                            {t('cashflow:recurring.showAll')}
                        </button>
                    )}
                </div>

                {view === 'calendar' && (
                    <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="grid" aria-label={t('cashflow:recurring.calendarLabel')}>
                        {weekdayNames.map(name => (
                            <div key={name} role="columnheader" className="text-center text-[11px] font-bold text-tertiary pb-1">{name}</div>
                        ))}
                        {calendarDays(data.start, data.end).map((day, index) => {
                            const inMonth = day >= data.start && day < data.end;
                            const payments = byDay.get(day) ?? [];
                            const selected = selectedDay === day;
                            const isToday = day === today;
                            return (
                                <button
                                    key={day}
                                    type="button"
                                    role="gridcell"
                                    disabled={!inMonth}
                                    onClick={() => setSelectedDay(selected ? null : day)}
                                    aria-pressed={selected}
                                    aria-label={`${longDay.format(new Date(`${day}T00:00:00Z`))}${payments.length ? ` · ${payments.map(p => p.item.label).join(', ')}` : ''}`}
                                    className={`animate-row-in min-h-[4.5rem] sm:min-h-[5.5rem] rounded-xl p-1.5 sm:p-2 flex flex-col items-center gap-1.5 border transition-colors ${
                                        // A selected day fills with the accent; today keeps a plain cell and is marked by its number
                                        !inMonth ? 'bg-transparent border-transparent text-tertiary opacity-40'
                                            : selected ? 'bg-brand/20 border-brand' : 'bg-subtle border-subtle hover:border-strong'
                                    }`}
                                    style={{ animationDelay: `${Math.min(index, 35) * 12}ms` }}
                                >
                                    <span className={`text-sm w-8 h-8 flex items-center justify-center rounded-full ${isToday ? 'font-bold bg-primary text-white shadow-md shadow-primary/40 ring-4 ring-primary/25' : 'font-semibold text-primary'}`}>
                                        {Number(day.slice(8, 10))}
                                    </span>
                                    {payments.length > 0 && (
                                        <span className="flex items-center -space-x-2">
                                            {payments.slice(0, AVATARS_PER_DAY).map(payment => (
                                                <span key={`${payment.item.key}-${payment.expected}`} className={`flex rounded-full p-0.5 bg-card ${payment.expected ? 'opacity-60' : ''}`}>
                                                    <MerchantAvatar label={payment.item.label} categoryId={payment.item.categoryId} customCategories={customCategories} size={24} />
                                                </span>
                                            ))}
                                            {payments.length > AVATARS_PER_DAY && (
                                                <span className="w-7 h-7 rounded-full bg-card border border-subtle text-[10px] font-bold text-secondary flex items-center justify-center">
                                                    +{payments.length - AVATARS_PER_DAY}
                                                </span>
                                            )}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="space-y-1">
                    <h2 className="text-sm font-bold text-primary">
                        {selectedDay ? t('cashflow:recurring.onDay', { day: longDay.format(new Date(`${selectedDay}T00:00:00Z`)) }) : t('cashflow:recurring.listTitle')}
                    </h2>
                    {!selectedDay && <p className="text-xs text-tertiary">{t('cashflow:recurring.listHint')}</p>}
                </div>
                {shownItems.length === 0 ? (
                    <p className="text-sm text-tertiary py-8 text-center">{t(selectedDay ? 'cashflow:recurring.noneOnDay' : 'cashflow:recurring.none')}</p>
                ) : (
                    <ul className="divide-y divide-subtle">{shownItems.map(row)}</ul>
                )}
            </section>

            {ignored.length > 0 && (
                <details className={`${card} group`}>
                    <summary className="cursor-pointer text-sm font-bold text-primary">{t('cashflow:recurring.ignoredTitle', { count: ignored.length })}</summary>
                    <p className="text-xs text-tertiary mt-1">{t('cashflow:recurring.ignoredHint')}</p>
                    <ul className="divide-y divide-subtle mt-2">{ignored.map(row)}</ul>
                </details>
            )}
        </div>
    );
};

export default CashflowRecurring;
