/**
 * Categories (TGLA-251): a ring per kind (spending / income) with the total in the middle, the list
 * with share and the gap to the 12-month average, and the detail of one category (12 months,
 * sub-categories, main merchants).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { TrendBadge } from '../../components/ui/TrendBadge';
import { getCashflowCategoryTokens, topLevelCashflowCategoryId } from '../../constants/cashflowCategories';
import { ANIMATION_DURATION_MS, ANIMATION_EASING } from '../../constants/animations';
import { cashflowService } from '../../services/cashflow/cashflowService';
import { summarizeCashflow, contribution, budgetMonthOf } from '../../services/cashflow/aggregator';
import type { CashflowCategoryTotal, CashflowOperation, CustomCashflowCategory } from '../../types/cashflow';
import { CategoryBadge, MerchantAvatar } from '../../components/cashflow/CategoryBadge';
import type { CashflowLabels } from '../../components/cashflow/useCashflowLabels';
import { useCashflow } from './CashflowLayout';
import { resolvePeriod } from '../../services/cashflow/period';

const card = 'rounded-2xl bg-card p-6 shadow-lg border border-border';

const CategoryRing: React.FC<{
    items: CashflowCategoryTotal[];
    total: number;
    labels: CashflowLabels;
    custom: readonly CustomCashflowCategory[];
    selected: string | null;
    onSelect: (id: string) => void;
    title: string;
}> = ({ items, total, labels, custom, selected, onSelect, title }) => {
    const { t } = useTranslation();
    const count = items.reduce((sum, item) => sum + item.count, 0);
    return (
        <div className="relative h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={items}
                        dataKey="amount"
                        nameKey="categoryId"
                        innerRadius="68%"
                        outerRadius="92%"
                        paddingAngle={2}
                        stroke="var(--bg-card)"
                        strokeWidth={2}
                        animationDuration={ANIMATION_DURATION_MS}
                        animationEasing={ANIMATION_EASING}
                        onClick={(_, index) => { const item = items[index]; if (item) onSelect(item.categoryId); }}
                    >
                        {items.map(item => (
                            <Cell
                                key={item.categoryId}
                                fill={getCashflowCategoryTokens(item.categoryId, custom).cssVar}
                                fillOpacity={!selected || selected === item.categoryId ? 1 : 0.35}
                                className="cursor-pointer"
                            />
                        ))}
                    </Pie>
                    <Tooltip
                        content={({ active, payload }) => {
                            const item = active ? (payload?.[0]?.payload as CashflowCategoryTotal | undefined) : undefined;
                            if (!item) return null;
                            return (
                                <div className="bg-card border border-border px-3 py-2 rounded-xl shadow-xl text-xs">
                                    <p className="font-bold text-primary">{labels.categoryName(item.categoryId)}</p>
                                    <p className="text-secondary tabular-nums">{labels.money(item.amount)} · {labels.percent(item.share)}</p>
                                </div>
                            );
                        }}
                    />
                </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-[11px] font-bold uppercase tracking-wider text-tertiary">{title}</span>
                <span className="text-2xl font-bold text-primary tabular-nums">{labels.money(total)}</span>
                <span className="text-xs text-tertiary">{t('cashflow:categoriesPage.operations', { count })}</span>
            </div>
        </div>
    );
};

const CategoryDetail: React.FC<{
    category: CashflowCategoryTotal;
    operations: CashflowOperation[];
    labels: CashflowLabels;
    custom: readonly CustomCashflowCategory[];
    monthStartDay: number;
}> = ({ category, operations, labels, custom, monthStartDay }) => {
    const { t } = useTranslation();
    const color = getCashflowCategoryTokens(category.categoryId, custom).cssVar;
    const history = useMemo(() => {
        const period = resolvePeriod({ preset: '12m', monthStartDay });
        const mine = operations.filter(op => !op.excluded && topLevelCashflowCategoryId(op.categoryId, custom) === category.categoryId);
        const months = summarizeCashflow(mine, { periodStart: period.start, periodEnd: period.end, currency: labels.currency, monthStartDay }).months;
        const totals = new Map<string, number>(months.map(m => [m.month, 0]));
        for (const op of mine) {
            const key = budgetMonthOf(op.date.slice(0, 10), monthStartDay);
            if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + contribution(op));
        }
        return months.map(m => ({ month: m.month, label: labels.monthName(m.month, 'short'), amount: Math.max(0, Math.round((totals.get(m.month) ?? 0) * 100) / 100) }));
    }, [operations, category.categoryId, custom, labels, monthStartDay]);
    const merchants = useMemo(() => {
        const byKey = new Map<string, { label: string; amount: number; count: number; categoryId: string }>();
        for (const op of operations) {
            if (op.excluded || topLevelCashflowCategoryId(op.categoryId, custom) !== category.categoryId) continue;
            const entry = byKey.get(op.merchantKey) ?? { label: op.label, amount: 0, count: 0, categoryId: op.categoryId };
            entry.amount += contribution(op);
            entry.count += 1;
            byKey.set(op.merchantKey, entry);
        }
        return [...byKey.values()].sort((a, b) => b.amount - a.amount).slice(0, 6);
    }, [operations, category.categoryId, custom]);

    return (
        <section className={`${card} space-y-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <CategoryBadge categoryId={category.categoryId} name={labels.categoryName(category.categoryId)} customCategories={custom} size="md" />
                <Link to={`/cashflow/operations?category=${encodeURIComponent(category.categoryId)}`} className="text-xs font-semibold text-brand hover:underline">
                    {t('cashflow:categoriesPage.seeOperations')}
                </Link>
            </div>
            <div>
                <p className="text-xs font-bold uppercase tracking-wider text-tertiary mb-2">{t('cashflow:categoriesPage.detailTitle')}</p>
                <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={history} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 10, fontWeight: 600 }} />
                            <Tooltip
                                cursor={{ fill: 'var(--bg-subtle)', opacity: 0.4 }}
                                content={({ active, payload }) => {
                                    const row = active ? (payload?.[0]?.payload as { month: string; amount: number } | undefined) : undefined;
                                    if (!row) return null;
                                    return (
                                        <div className="bg-card border border-border px-3 py-2 rounded-xl shadow-xl text-xs">
                                            <p className="font-bold text-primary capitalize">{labels.monthName(row.month)}</p>
                                            <p className="text-secondary tabular-nums">{labels.money(row.amount)}</p>
                                        </div>
                                    );
                                }}
                            />
                            <Bar dataKey="amount" fill={color} radius={[6, 6, 2, 2]} barSize={14} animationDuration={ANIMATION_DURATION_MS} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
            {category.children.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-tertiary">{t('cashflow:categoriesPage.subcategories')}</p>
                    <ul className="space-y-1.5">
                        {category.children.map(child => (
                            <li key={child.categoryId} className="flex items-center justify-between gap-3 text-sm">
                                <CategoryBadge categoryId={child.categoryId} name={labels.categoryName(child.categoryId)} customCategories={custom} />
                                <span className="font-bold text-primary tabular-nums">{labels.money(child.amount)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {merchants.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-tertiary">{t('cashflow:categoriesPage.merchants')}</p>
                    <ul className="divide-y divide-subtle">
                        {merchants.map(merchant => (
                            <li key={merchant.label} className="flex items-center gap-3 py-2">
                                <MerchantAvatar label={merchant.label} categoryId={merchant.categoryId} customCategories={custom} size={30} />
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm font-semibold text-primary truncate">{merchant.label}</span>
                                    <span className="block text-xs text-tertiary">{t('cashflow:categoriesPage.operations', { count: merchant.count })}</span>
                                </span>
                                <span className="text-sm font-bold text-primary tabular-nums">{labels.money(merchant.amount)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
};

const CashflowCategories: React.FC = () => {
    const { t } = useTranslation();
    const { summary, labels, customCategories, currency, accountIds, version, monthStartDay } = useCashflow();
    const [kind, setKind] = useState<'expense' | 'income'>('expense');
    const [selected, setSelected] = useState<string | null>(null);
    const [operations, setOperations] = useState<CashflowOperation[]>([]);

    useEffect(() => {
        let cancelled = false;
        cashflowService.listOperations({ currency, accountIds }).then(ops => { if (!cancelled) setOperations(ops); });
        return () => { cancelled = true; };
    }, [currency, accountIds, version]);

    if (!summary) return null;
    const items = summary.categories.filter(c => c.kind === kind && c.amount > 0);
    const total = items.reduce((sum, c) => sum + c.amount, 0);
    const current = items.find(c => c.categoryId === selected) ?? items[0];

    return (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            <section className={`${card} xl:col-span-3 space-y-5`}>
                <div className="flex gap-1 bg-subtle p-1 rounded-xl w-fit" role="group">
                    {(['expense', 'income'] as const).map(option => (
                        <button
                            key={option}
                            type="button"
                            aria-pressed={kind === option}
                            onClick={() => { setKind(option); setSelected(null); }}
                            className={`px-4 py-1.5 rounded-lg text-sm font-bold ${kind === option ? 'bg-card text-brand shadow-sm border border-subtle' : 'text-secondary'}`}
                        >
                            {t(option === 'expense' ? 'cashflow:categoriesPage.expenses' : 'cashflow:categoriesPage.income')}
                        </button>
                    ))}
                </div>
                {items.length === 0 ? (
                    <p className="text-sm text-tertiary py-16 text-center">{t('cashflow:categoriesPage.empty')}</p>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                        <CategoryRing
                            items={items}
                            total={total}
                            labels={labels}
                            custom={customCategories}
                            selected={current?.categoryId ?? null}
                            onSelect={setSelected}
                            title={t(kind === 'expense' ? 'cashflow:categoriesPage.expenses' : 'cashflow:categoriesPage.income')}
                        />
                        <ul className="space-y-1">
                            {items.map(item => (
                                <li key={item.categoryId}>
                                    <button
                                        type="button"
                                        onClick={() => setSelected(item.categoryId)}
                                        aria-pressed={current?.categoryId === item.categoryId}
                                        className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left transition-colors ${current?.categoryId === item.categoryId ? 'bg-subtle' : 'hover:bg-subtle'}`}
                                    >
                                        <span className="min-w-0">
                                            <CategoryBadge categoryId={item.categoryId} name={labels.categoryName(item.categoryId)} customCategories={customCategories} />
                                            <span className="block text-[11px] text-tertiary mt-1">
                                                {labels.percent(item.share)} · {item.deltaVsAverage === null ? t('cashflow:categoriesPage.noAverage') : t('cashflow:categoriesPage.vsAverage')}
                                            </span>
                                        </span>
                                        <span className="text-right shrink-0">
                                            <span className="block text-sm font-bold text-primary tabular-nums">{labels.money(item.amount)}</span>
                                            {item.deltaVsAverage !== null && (
                                                <TrendBadge value={item.deltaVsAverage * 100} goodDirection={kind === 'expense' ? 'down' : 'up'} decimals={0} />
                                            )}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </section>
            <div className="xl:col-span-2">
                {current && (
                    <CategoryDetail category={current} operations={operations} labels={labels} custom={customCategories} monthStartDay={monthStartDay} />
                )}
            </div>
        </div>
    );
};

export default CashflowCategories;
