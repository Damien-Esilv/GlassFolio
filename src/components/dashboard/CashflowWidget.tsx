/**
 * Cash flow on the dashboard (Epic E52), a row of two cards. The wide one: the cash left available this month with
 * money in, money out and the savings rate, the last 6 months, the balance expected at the month end, the payments
 * and income coming up and where the money went. The narrow one: the budgets of the month, the most used first (over budget
 * on top), as on the Budgets tab. Hidden while there is no bank operation. Loaded lazily by the dashboard, with
 * its texts (the `cashflow` namespace) and services, so neither the main bundle nor the public site grows.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Target, Wallet } from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import AnimatedCounter from '../AnimatedCounter';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { cashflowService } from '../../services/cashflow/cashflowService';
import { cashflowPlanningService } from '../../services/cashflow/cashflowPlanningService';
import type { BudgetState, BudgetStatus, CashflowForecast, CashflowRecurringItem, CashflowSummary } from '../../types/cashflow';
import { CASHFLOW_ROLE_TOKENS } from '../../constants/cashflowPalette';
import { getBuiltinCashflowCategory } from '../../constants/cashflowCategories';
import { THEME_INTENT } from '../../constants/themeTokens';
import { ANIMATION_DURATION_MS } from '../../constants/animations';
import { ColorDot, MerchantAvatar, MerchantLogosProvider } from '../cashflow/CategoryBadge';
import { cashflowCategoryService } from '../../services/cashflow/cashflowCategoryService';

const card = 'rounded-2xl bg-card p-6 shadow-lg border border-border';
const label = 'text-[11px] font-bold uppercase tracking-wider text-tertiary';
const STATE_INTENT: Record<BudgetState, keyof typeof THEME_INTENT> = { ok: 'positive', near: 'warning', over: 'negative' };
/** Budgets the narrow card has room for */
const SHOWN_BUDGETS = 4;
/** Months of the small chart */
const CHART_MONTHS = 6;

interface ComingPayment {
    key: string;
    label: string;
    categoryId: string;
    date: string;
    amount: number;
}

interface WidgetData {
    summary: CashflowSummary;
    forecast: CashflowForecast | null;
    budgets: BudgetStatus[];
    coming: ComingPayment[];
    merchantLogos: boolean;
}

async function loadWidget(currency: string): Promise<WidgetData | null> {
    // Category names live with the cash flow texts, loaded on demand (outside the main bundle)
    await import('../../pages/cashflow/cashflowI18n');
    const summary = await cashflowService.getSummary({ preset: 'month', currency });
    if (summary.operationCount === 0) return null;
    const today = new Date().toISOString().slice(0, 10);
    const [forecast, budgets, recurring, settings] = await Promise.all([
        cashflowPlanningService.getForecast({ currency }).catch((): CashflowForecast | null => null),
        cashflowPlanningService.getBudgetStatus({ currency }).then(result => result.statuses).catch((): BudgetStatus[] => []),
        cashflowService.listRecurring({ currency }).then(result => result.items).catch((): CashflowRecurringItem[] => []),
        cashflowCategoryService.getSettings(),
    ]);
    const coming = recurring
        .filter(item => item.status !== 'ignored')
        .flatMap(item => item.payments
            .filter(payment => payment.expected && payment.date >= today)
            .map(payment => ({ key: `${item.key}-${payment.date}`, label: item.label, categoryId: item.categoryId, date: payment.date, amount: payment.amount })))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 3);
    return { summary, forecast, budgets, coming, merchantLogos: settings.merchantLogos !== false };
}

const CashflowWidget: React.FC<{ currency: string; locale: string }> = ({ currency, locale }) => {
    const { t } = useTranslation();
    const [data, setData] = useState<WidgetData | null>(null);

    useEffect(() => {
        let cancelled = false;
        loadWidget(currency)
            .then(result => { if (!cancelled) setData(result); })
            .catch(() => { if (!cancelled) setData(null); });
        return () => { cancelled = true; };
    }, [currency]);

    if (!data) return null;
    const { summary, forecast, budgets, coming } = data;
    const money = (value: number) => <AnimatedCounter value={value} currency={currency} locale={locale} options={{ maximumFractionDigits: 0 }} />;
    const plain = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
    const compact = new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
    const monthName = (month: string, style: 'long' | 'short') =>
        new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' }).format(new Date(`${month}-15T00:00:00Z`));
    const dayName = (day: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
    const category = (id: string): string => {
        const builtin = getBuiltinCashflowCategory(id);
        return builtin ? t(`cashflow:categories.${builtin.i18nKey}`) : id;
    };
    const month = summary.months[summary.months.length - 1]?.month ?? summary.periodStart.slice(0, 7);
    const chart = summary.months.slice(-CHART_MONTHS).map(m => ({
        month: m.month,
        name: monthName(m.month, 'short'),
        income: Math.max(0, m.income),
        out: Math.max(0, m.expenses + m.savingsInvested),
    }));
    const topSpending = summary.categories.filter(c => c.kind === 'expense' && c.amount > 0).slice(0, 3);
    const over = budgets.filter(b => b.state === 'over').length;

    return (
        <MerchantLogosProvider value={data.merchantLogos}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in-up">
            <section className={`${card} lg:col-span-2 flex flex-col gap-6`} aria-label={t('cashflow:dashboard.title')}>
                <div className="flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-sm font-medium text-secondary">
                        <Wallet size={16} className="text-brand" aria-hidden="true" />
                        {t('cashflow:dashboard.title')} · <span className="capitalize">{monthName(month, 'long')}</span>
                    </h3>
                    {/* Same look as the other dashboard cards' links ("See all", "View badges") */}
                    <Link to="/cashflow" className="text-xs font-bold text-primary hover:text-primary/80 transition-colors uppercase tracking-wider shrink-0">
                        {t('cashflow:dashboard.open')}
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* The forecast sits at the bottom, level with the chart legend on the right */}
                    <div className="flex flex-col gap-4">
                        <div>
                            <p className={label}>{t('cashflow:dashboard.availableSoFar')}</p>
                            <p className={`text-4xl font-bold tabular-nums ${summary.available < 0 ? 'text-negative' : 'text-positive'}`}>{money(summary.available)}</p>
                        </div>
                        <dl className="grid grid-cols-3 gap-3 text-sm">
                            <div>
                                <dt className={`${label} flex items-center gap-1.5`}><ColorDot cssVar={CASHFLOW_ROLE_TOKENS.income.cssVar} />{t('cashflow:dashboard.income')}</dt>
                                <dd className="font-bold text-primary tabular-nums">{money(summary.income)}</dd>
                            </div>
                            <div>
                                <dt className={`${label} flex items-center gap-1.5`}><ColorDot cssVar={CASHFLOW_ROLE_TOKENS.expense.cssVar} />{t('cashflow:dashboard.expenses')}</dt>
                                <dd className="font-bold text-primary tabular-nums">{money(-summary.expenses)}</dd>
                            </div>
                            <div>
                                <dt className={`${label} flex items-center gap-1.5`}><ColorDot cssVar={CASHFLOW_ROLE_TOKENS.savings.cssVar} />{t('cashflow:dashboard.savingsRate')}</dt>
                                <dd className="font-bold text-primary tabular-nums">
                                    {summary.income > 0 && summary.savingsRate >= -1
                                        ? <AnimatedNumber value={summary.savingsRate} locale={locale} options={{ style: 'percent', maximumFractionDigits: 1 }} />
                                        : '—'}
                                </dd>
                            </div>
                        </dl>
                        {forecast && (
                            <div className="mt-auto rounded-xl bg-subtle border border-subtle px-4 py-3 flex items-center justify-between gap-3">
                                <div>
                                    <p className={label}>{t('cashflow:dashboard.expectedEnd', { date: dayName(forecast.monthEnd) })}</p>
                                    <p className="text-xs text-tertiary">{t('cashflow:dashboard.balanceToday', { amount: plain.format(forecast.balanceToday) })}</p>
                                </div>
                                <p className={`text-lg font-bold tabular-nums ${forecast.projectedEnd < 0 ? 'text-negative' : 'text-primary'}`}>{money(forecast.projectedEnd)}</p>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <p className={label}>{t('cashflow:dashboard.lastMonths', { count: chart.length })}</p>
                        <div className="h-[170px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chart} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barGap={3}>
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontWeight: 600 }} />
                                    <Tooltip
                                        cursor={{ fill: 'var(--bg-subtle)', opacity: 0.4 }}
                                        content={({ active, payload }) => {
                                            const row = active ? (payload?.[0]?.payload as (typeof chart)[number] | undefined) : undefined;
                                            if (!row) return null;
                                            return (
                                                <div className="bg-card border border-border px-3 py-2 rounded-xl shadow-xl text-xs space-y-1">
                                                    <p className="font-bold text-primary capitalize">{monthName(row.month, 'long')}</p>
                                                    <p className="text-secondary tabular-nums">{t('cashflow:dashboard.income')} : {compact.format(row.income)}</p>
                                                    <p className="text-secondary tabular-nums">{t('cashflow:dashboard.outAndSaved')} : {compact.format(row.out)}</p>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Bar dataKey="income" fill={CASHFLOW_ROLE_TOKENS.income.cssVar} radius={[5, 5, 2, 2]} barSize={10} animationDuration={ANIMATION_DURATION_MS} />
                                    <Bar dataKey="out" fill={CASHFLOW_ROLE_TOKENS.expense.cssVar} radius={[5, 5, 2, 2]} barSize={10} animationDuration={ANIMATION_DURATION_MS} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex gap-4 text-xs text-secondary">
                            <span className="flex items-center gap-1.5"><ColorDot cssVar={CASHFLOW_ROLE_TOKENS.income.cssVar} />{t('cashflow:dashboard.income')}</span>
                            <span className="flex items-center gap-1.5"><ColorDot cssVar={CASHFLOW_ROLE_TOKENS.expense.cssVar} />{t('cashflow:dashboard.outAndSaved')}</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5 border-t border-subtle">
                    <div className="space-y-3">
                        <p className={`${label} flex items-center gap-1.5`}><CalendarClock size={12} aria-hidden="true" />{t('cashflow:dashboard.comingUp')}</p>
                        {coming.length === 0 ? (
                            <p className="text-xs text-tertiary">{t('cashflow:dashboard.nothingComing')}</p>
                        ) : (
                            <ul className="space-y-2.5">
                                {coming.map(item => (
                                    <li key={item.key} className="flex items-center gap-3 text-sm">
                                        <MerchantAvatar label={item.label} categoryId={item.categoryId} size={28} />
                                        <span className="flex-1 min-w-0 truncate font-semibold text-primary">{item.label}</span>
                                        <span className="text-xs text-tertiary">{dayName(item.date)}</span>
                                        <span className={`font-bold tabular-nums ${item.amount > 0 ? 'text-positive' : 'text-primary'}`}>{item.amount > 0 ? '+' : ''}{plain.format(item.amount)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div className="space-y-3">
                        <p className={label}>{t('cashflow:dashboard.topSpending')}</p>
                        {topSpending.length === 0 ? (
                            <p className="text-xs text-tertiary">{t('cashflow:dashboard.noSpending')}</p>
                        ) : (
                            <ul className="space-y-2.5">
                                {topSpending.map(item => (
                                    <li key={item.categoryId} className="space-y-1">
                                        <div className="flex items-center justify-between gap-3 text-sm">
                                            <span className="truncate font-semibold text-primary">{category(item.categoryId)}</span>
                                            <span className="font-bold text-primary tabular-nums">{plain.format(item.amount)}</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-subtle overflow-hidden" aria-hidden="true">
                                            <div className="h-full rounded-full animate-grow-width" style={{ '--target-width': `${Math.round(item.share * 100)}%`, backgroundColor: CASHFLOW_ROLE_TOKENS.expense.cssVar } as React.CSSProperties} />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </section>

            <section className={`${card} flex flex-col gap-4`} aria-label={t('cashflow:dashboard.budgetsTitle')}>
                <div className="flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-sm font-medium text-secondary min-w-0">
                        <Target size={16} className="text-brand shrink-0" aria-hidden="true" />
                        <span className="truncate">{t('cashflow:dashboard.budgetsTitle')}</span>
                    </h3>
                    <Link to="/cashflow/budgets" className="text-xs font-bold text-primary hover:text-primary/80 transition-colors uppercase tracking-wider shrink-0">
                        {budgets.length === 0
                            ? t('cashflow:dashboard.setBudgets')
                            : budgets.length > SHOWN_BUDGETS
                                ? t('cashflow:dashboard.moreBudgets', { count: budgets.length - SHOWN_BUDGETS })
                                : t('cashflow:dashboard.manageBudgets')}
                    </Link>
                </div>
                {over > 0 && (
                    <span className={`self-start -mt-2 text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${THEME_INTENT.negative.bgSubtle} ${THEME_INTENT.negative.text}`}>
                        {t('cashflow:dashboard.overCount', { count: over })}
                    </span>
                )}
                {budgets.length === 0 ? (
                    <p className="text-sm text-tertiary my-auto text-center">{t('cashflow:dashboard.noBudgets')}</p>
                ) : (
                    <ul className="space-y-4 flex-1">
                        {budgets.slice(0, SHOWN_BUDGETS).map(budget => {
                            const intent = THEME_INTENT[STATE_INTENT[budget.state]];
                            const name = category(budget.categoryId);
                            return (
                                <li key={budget.categoryId} className="space-y-1.5">
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                        <span className="truncate font-semibold text-primary">{name}</span>
                                        <span className="text-secondary tabular-nums">{plain.format(budget.spent)} / {plain.format(budget.limit)}</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-subtle overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(budget.ratio * 100)} aria-label={name}>
                                        <div className={`h-full rounded-full animate-grow-width ${intent.bg}`} style={{ '--target-width': `${Math.min(100, Math.round(budget.ratio * 100))}%` } as React.CSSProperties} />
                                    </div>
                                    <p className={`text-[11px] ${budget.state === 'ok' ? 'text-tertiary' : intent.text}`}>
                                        {budget.remaining >= 0
                                            ? t('cashflow:dashboard.budgetLeft', { amount: plain.format(budget.remaining) })
                                            : t('cashflow:dashboard.budgetOver', { amount: plain.format(-budget.remaining) })}
                                    </p>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
        </MerchantLogosProvider>
    );
};

export default CashflowWidget;
