/**
 * Cash flow overview (TGLA-250), after Finary: cash available for the month with money in, money out
 * and the savings rate, the month-after-month chart, then this month's income, spending and recurring
 * payments, banks and passive income.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TrendBadge } from '../../components/ui/TrendBadge';
import { TrendValue } from '../../components/ui/TrendValue';
import { CASHFLOW_ROLE_TOKENS } from '../../constants/cashflowPalette';
import { getCashflowCategoryTokens } from '../../constants/cashflowCategories';
import { cashflowService } from '../../services/cashflow/cashflowService';
import { budgetMonthOf } from '../../services/cashflow/aggregator';
import { shiftIsoDay } from '../../services/cashflow/planning';
import type { CashflowCategoryTotal, CashflowMonth, RecurringSeries } from '../../types/cashflow';
import { MonthTrendChart } from '../../components/cashflow/MonthTrendChart';
import { CategoryBadge, ColorDot, MerchantAvatar } from '../../components/cashflow/CategoryBadge';
import type { CashflowLabels } from '../../components/cashflow/useCashflowLabels';
import { CountUpMoney, CountUpPercent } from '../../components/cashflow/CountUp';
import { ForecastCard } from '../../components/cashflow/ForecastCard';
import { useCashflow } from './CashflowLayout';

const card = 'rounded-2xl bg-card p-6 shadow-lg border border-border';

type OverviewTab = 'income' | 'expenses' | 'recurring';

/** Savings rate as shown: none without income, floored at −100 % (a month without salary yet). */
export function formatSavingsRate(income: number, rate: number, labels: CashflowLabels): string {
    if (income <= 0) return '—';
    if (rate < -1) return `< ${labels.percent(-1)}`;
    return labels.percent(rate, 1);
}

/** The savings rate, counting up when it is a plain percentage. */
const SavingsRate: React.FC<{ income: number; rate: number; labels: CashflowLabels }> = ({ income, rate, labels }) =>
    income > 0 && rate >= -1 ? <CountUpPercent ratio={rate} labels={labels} decimals={1} /> : <>{formatSavingsRate(income, rate, labels)}</>;

const relativeChange = (current: number, previous: number | undefined): number | null =>
    previous && previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : null;

const HeroChip: React.FC<{ label: string; value: React.ReactNode; cssVar: string; change?: number | null; goodDirection?: 'up' | 'down' }> = ({ label, value, cssVar, change, goodDirection = 'up' }) => (
    <div className="flex-1 min-w-[9rem] rounded-xl bg-subtle border border-subtle px-4 py-3 space-y-1">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-tertiary"><ColorDot cssVar={cssVar} />{label}</p>
        <p className="text-lg font-bold text-primary tabular-nums">{value}</p>
        {change !== null && change !== undefined && <TrendBadge value={change} goodDirection={goodDirection} showIcon />}
    </div>
);

const CategoryList: React.FC<{
    items: CashflowCategoryTotal[];
    labels: CashflowLabels;
    customCategories: ReturnType<typeof useCashflow>['customCategories'];
    empty: string;
}> = ({ items, labels, customCategories, empty }) => {
    const { t } = useTranslation();
    if (items.length === 0) return <p className="text-sm text-tertiary py-6 text-center">{empty}</p>;
    return (
        <ul className="space-y-3">
            {items.map(item => (
                <li key={item.categoryId} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                        <CategoryBadge categoryId={item.categoryId} name={labels.categoryName(item.categoryId)} customCategories={customCategories} />
                        <span className="text-sm font-bold text-primary tabular-nums">{labels.money(item.amount)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-subtle overflow-hidden" aria-hidden="true">
                        <div className="h-full rounded-full" style={{ width: `${Math.round(item.share * 100)}%`, backgroundColor: getCashflowCategoryTokens(item.categoryId, customCategories).cssVar }} />
                    </div>
                    <p className="text-[11px] text-tertiary">
                        {labels.percent(item.share)} · {t('cashflow:categoriesPage.operations', { count: item.count })}
                    </p>
                </li>
            ))}
        </ul>
    );
};

const CashflowOverview: React.FC = () => {
    const { t } = useTranslation();
    const { summary, month, setMonth, preset, labels, customCategories, currency, version, periodLabel, accountIds, monthStartDay } = useCashflow();
    const [tab, setTab] = useState<OverviewTab>('expenses');
    const [recurring, setRecurring] = useState<RecurringSeries[]>([]);

    useEffect(() => {
        let cancelled = false;
        cashflowService.getRecurringSeries(currency, 6).then(series => { if (!cancelled) setRecurring(series); });
        return () => { cancelled = true; };
    }, [currency, version]);

    const previous: CashflowMonth | undefined = useMemo(() => {
        if (!summary || preset !== 'month') return undefined;
        const index = summary.months.findIndex(m => m.month === month);
        return index > 0 ? summary.months[index - 1] : undefined;
    }, [summary, preset, month]);

    if (!summary) return null;

    const income = summary.categories.filter(c => c.kind === 'income' && c.amount > 0);
    const expenses = summary.categories.filter(c => c.kind === 'expense' && c.amount > 0).slice(0, 8);
    const recurringOut = recurring.filter(s => s.direction === 'out');
    const recurringTotal = recurringOut.reduce((sum, s) => sum + s.lastAmount, 0);
    const heroLabel = t('cashflow:kpi.availableIn', { month: periodLabel });

    return (
        <div className="space-y-6">
            <section className={`${card} space-y-6`}>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                    <div className="space-y-1">
                        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-tertiary">
                            <ColorDot cssVar={CASHFLOW_ROLE_TOKENS.available.cssVar} />{heroLabel}
                        </p>
                        <TrendValue value={summary.available} currency={currency} locale={labels.locale} decimals={0} animated className="text-4xl sm:text-5xl font-bold" />
                    </div>
                    <div className="flex flex-wrap gap-3 lg:max-w-2xl w-full">
                        <HeroChip
                            label={t('cashflow:kpi.income')}
                            value={<CountUpMoney value={summary.income} labels={labels} />}
                            cssVar={CASHFLOW_ROLE_TOKENS.income.cssVar}
                            change={relativeChange(summary.income, previous?.income)}
                        />
                        <HeroChip
                            label={t('cashflow:kpi.expenses')}
                            value={<CountUpMoney value={-summary.expenses} labels={labels} />}
                            cssVar={CASHFLOW_ROLE_TOKENS.expense.cssVar}
                            change={relativeChange(summary.expenses, previous?.expenses)}
                            goodDirection="down"
                        />
                        <HeroChip
                            label={t('cashflow:kpi.savingsRate')}
                            value={<SavingsRate income={summary.income} rate={summary.savingsRate} labels={labels} />}
                            cssVar={CASHFLOW_ROLE_TOKENS.savings.cssVar}
                        />
                    </div>
                </div>
                <div className="space-y-1">
                    <h2 className="text-sm font-bold text-primary">{t('cashflow:overview.trendTitle')}</h2>
                    <p className="text-xs text-tertiary">{t('cashflow:overview.trendHint')}</p>
                </div>
                <MonthTrendChart months={summary.months} firstMonth={budgetMonthOf(summary.periodStart, monthStartDay)} lastMonth={budgetMonthOf(shiftIsoDay(summary.periodEnd, -1), monthStartDay)} onSelect={setMonth} labels={labels} />
            </section>

            <ForecastCard currency={currency} accountIds={accountIds} version={version} labels={labels} />

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <section className={`${card} xl:col-span-2 space-y-4`}>
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-sm font-bold text-primary">{t('cashflow:overview.topCategories')}</h2>
                        <Link to={tab === 'recurring' ? '/cashflow/recurring' : '/cashflow/categories'} className="text-xs font-semibold text-brand hover:underline">{t('cashflow:overview.seeAll')}</Link>
                    </div>
                    <div className="grid grid-cols-3 gap-1 bg-subtle p-1 rounded-xl" role="tablist" aria-label={t('cashflow:overview.tabsTitle')}>
                        {([
                            ['income', t('cashflow:overview.tabIncome'), summary.income],
                            ['expenses', t('cashflow:overview.tabExpenses'), -summary.expenses],
                            ['recurring', t('cashflow:overview.tabRecurring'), -recurringTotal],
                        ] as const).map(([key, label, value]) => (
                            <button
                                key={key}
                                type="button"
                                role="tab"
                                aria-selected={tab === key}
                                onClick={() => setTab(key)}
                                className={`px-3 py-2 rounded-lg text-center transition-all ${tab === key ? 'bg-card shadow-sm border border-subtle' : ''}`}
                            >
                                <span className="block text-[11px] font-semibold text-tertiary">{label}</span>
                                <span className={`block text-sm sm:text-base font-bold tabular-nums ${tab === key ? 'text-brand' : 'text-primary'}`}><CountUpMoney value={value} labels={labels} /></span>
                            </button>
                        ))}
                    </div>
                    {tab === 'income' && <CategoryList items={income} labels={labels} customCategories={customCategories} empty={t('cashflow:overview.noIncome')} />}
                    {tab === 'expenses' && <CategoryList items={expenses} labels={labels} customCategories={customCategories} empty={t('cashflow:overview.noExpenses')} />}
                    {tab === 'recurring' && (recurringOut.length === 0 ? (
                        <p className="text-sm text-tertiary py-6 text-center">{t('cashflow:overview.noRecurring')}</p>
                    ) : (
                        <ul className="divide-y divide-subtle">
                            {recurringOut.slice(0, 8).map(series => (
                                <li key={series.key} className="flex items-center gap-3 py-2.5">
                                    <MerchantAvatar label={series.label} categoryId={series.categoryId} customCategories={customCategories} />
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm font-semibold text-primary truncate">{series.label}</span>
                                        <span className="block text-xs text-tertiary">{new Intl.DateTimeFormat(labels.locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${series.nextDate}T00:00:00Z`))}</span>
                                    </span>
                                    {series.priceChange !== null && <TrendBadge value={series.priceChange * 100} goodDirection="down" decimals={0} />}
                                    <span className="text-sm font-bold text-primary tabular-nums">{labels.money(-series.lastAmount, 2)}</span>
                                </li>
                            ))}
                        </ul>
                    ))}
                </section>

                <div className="space-y-6">
                    <section className={`${card} space-y-2`}>
                        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-tertiary"><ColorDot cssVar={CASHFLOW_ROLE_TOKENS.savings.cssVar} />{t('cashflow:kpi.savingsInvested')}</p>
                        <p className="text-2xl font-bold text-primary tabular-nums"><CountUpMoney value={summary.savingsInvested} labels={labels} /></p>
                    </section>
                    <section className={`${card} space-y-3`}>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-tertiary">{t('cashflow:kpi.passiveCoverage')}</p>
                        <p className="text-2xl font-bold text-primary tabular-nums"><CountUpPercent ratio={summary.passiveCoverage} labels={labels} decimals={1} /></p>
                        <div className="h-2 rounded-full bg-subtle overflow-hidden" aria-hidden="true">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(summary.passiveCoverage * 100))}%`, backgroundColor: getCashflowCategoryTokens('investment_income').cssVar }} />
                        </div>
                        <p className="text-xs text-tertiary">{t('cashflow:overview.passiveHint')}</p>
                    </section>
                    {summary.banks.length > 1 && (
                        <section className={`${card} space-y-3`}>
                            <h2 className="text-sm font-bold text-primary">{t('cashflow:overview.banks')}</h2>
                            <ul className="space-y-2">
                                {summary.banks.map(bank => (
                                    <li key={bank.instituteId} className="flex items-center justify-between gap-3 text-sm">
                                        <span className="truncate text-primary font-semibold">{bank.instituteName}</span>
                                        <span className="text-right tabular-nums">
                                            <span className="block text-primary">{labels.money(bank.income)}</span>
                                            <span className="block text-xs text-tertiary">{labels.money(-bank.expenses)}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CashflowOverview;
