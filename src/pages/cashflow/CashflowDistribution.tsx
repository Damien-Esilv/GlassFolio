/**
 * Distribution (TGLA-251), after the "Distribution" screens: a ring of payments by amount bucket
 * with the total and the count in the middle, the number of payments per bucket in gradient bars,
 * and spending by day of the week.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CASHFLOW_ROLE_TOKENS, getCashflowRampTokens } from '../../constants/cashflowPalette';
import { ANIMATION_DURATION_MS, ANIMATION_EASING } from '../../constants/animations';
import type { AmountBucket } from '../../types/cashflow';
import type { CashflowLabels } from '../../components/cashflow/useCashflowLabels';
import { ColorDot } from '../../components/cashflow/CategoryBadge';
import { useCashflow } from './CashflowLayout';

const card = 'rounded-2xl bg-card p-6 shadow-lg border border-border';

/** "< 5 €", "10–50 €", "> 1 000 €" in the user's currency. */
export function bucketLabel(bucket: AmountBucket, labels: CashflowLabels, t: TFunction): string {
    if (bucket.min === 0 && bucket.max !== null) return t('cashflow:distribution.bucketUnder', { max: labels.money(bucket.max) });
    if (bucket.max === null) return t('cashflow:distribution.bucketOver', { min: labels.money(bucket.min) });
    return t('cashflow:distribution.bucketRange', { min: bucket.min, max: labels.money(bucket.max) });
}

const CashflowDistribution: React.FC = () => {
    const { t } = useTranslation();
    const { summary, labels } = useCashflow();
    if (!summary) return null;

    const rows = summary.distribution.map((bucket, index) => ({ ...bucket, index, label: bucketLabel(bucket, labels, t) }));
    const count = rows.reduce((sum, row) => sum + row.count, 0);
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const weekdays = summary.weekdays.map((value, index) => ({ day: t(`cashflow:distribution.days.${index}`), value }));

    if (count === 0) {
        return <section className={card}><p className="text-sm text-tertiary py-16 text-center">{t('cashflow:distribution.empty')}</p></section>;
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <section className={`${card} space-y-4`}>
                    <div>
                        <h2 className="text-lg font-bold text-primary">{t('cashflow:distribution.title')}</h2>
                        <p className="text-sm text-secondary">{t('cashflow:distribution.subtitle')}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                        <div className="relative h-[260px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={rows} dataKey="count" nameKey="label" innerRadius="70%" outerRadius="94%" paddingAngle={1.5} stroke="var(--bg-card)" strokeWidth={2} animationDuration={ANIMATION_DURATION_MS} animationEasing={ANIMATION_EASING}>
                                        {rows.map(row => <Cell key={row.index} fill={getCashflowRampTokens(row.index).cssVar} />)}
                                    </Pie>
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            const row = active ? (payload?.[0]?.payload as (typeof rows)[number] | undefined) : undefined;
                                            if (!row) return null;
                                            return (
                                                <div className="bg-card border border-border px-3 py-2 rounded-xl shadow-xl text-xs">
                                                    <p className="font-bold text-primary">{row.label}</p>
                                                    <p className="text-secondary tabular-nums">{t('cashflow:distribution.operations', { count: row.count })} · {labels.money(row.total)}</p>
                                                </div>
                                            );
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                                <span className="text-sm text-secondary tabular-nums">{labels.money(total)}</span>
                                <span className="text-3xl font-bold text-primary tabular-nums">{count}</span>
                                <span className="text-xs text-tertiary">{t('cashflow:distribution.operations', { count })}</span>
                            </div>
                        </div>
                        <ul className="space-y-1.5">
                            {rows.map(row => (
                                <li key={row.index} className="flex items-center justify-between gap-3 text-sm">
                                    <span className="flex items-center gap-2 text-secondary"><ColorDot cssVar={getCashflowRampTokens(row.index).cssVar} />{row.label}</span>
                                    <span className="font-bold text-primary tabular-nums">{row.count}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section className={`${card} space-y-4`}>
                    <h2 className="text-sm font-bold text-primary">{t('cashflow:distribution.countAxis')}</h2>
                    <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={rows} margin={{ top: 16, right: 0, left: 0, bottom: 0 }}>
                                <defs>
                                    {rows.map(row => (
                                        <linearGradient key={row.index} id={`cashflow-bucket-${row.index}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={getCashflowRampTokens(row.index).cssVar} stopOpacity={1} />
                                            <stop offset="100%" stopColor={getCashflowRampTokens(row.index).cssVar} stopOpacity={0.35} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="3 6" />
                                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 10, fontWeight: 600 }} interval={0} angle={-30} textAnchor="end" height={50} />
                                <YAxis axisLine={false} tickLine={false} allowDecimals={false} width={32} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                                <Tooltip
                                    cursor={{ fill: 'var(--bg-subtle)', opacity: 0.4 }}
                                    content={({ active, payload }) => {
                                        const row = active ? (payload?.[0]?.payload as (typeof rows)[number] | undefined) : undefined;
                                        if (!row) return null;
                                        return (
                                            <div className="bg-card border border-border px-3 py-2 rounded-xl shadow-xl text-xs">
                                                <p className="font-bold text-primary">{row.label}</p>
                                                <p className="text-secondary tabular-nums">{t('cashflow:distribution.operations', { count: row.count })}</p>
                                            </div>
                                        );
                                    }}
                                />
                                <Bar dataKey="count" radius={[8, 8, 2, 2]} barSize={34} animationDuration={ANIMATION_DURATION_MS} label={{ position: 'top', fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }}>
                                    {rows.map(row => <Cell key={row.index} fill={`url(#cashflow-bucket-${row.index})`} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            </div>

            <section className={`${card} space-y-4`}>
                <h2 className="text-sm font-bold text-primary">{t('cashflow:distribution.weekdays')}</h2>
                <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weekdays} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontWeight: 600 }} />
                            <Tooltip
                                cursor={{ fill: 'var(--bg-subtle)', opacity: 0.4 }}
                                content={({ active, payload }) => {
                                    const row = active ? (payload?.[0]?.payload as { day: string; value: number } | undefined) : undefined;
                                    if (!row) return null;
                                    return (
                                        <div className="bg-card border border-border px-3 py-2 rounded-xl shadow-xl text-xs">
                                            <p className="font-bold text-primary">{row.day}</p>
                                            <p className="text-secondary tabular-nums">{labels.money(row.value)}</p>
                                        </div>
                                    );
                                }}
                            />
                            <Bar dataKey="value" fill={CASHFLOW_ROLE_TOKENS.expense.cssVar} radius={[8, 8, 2, 2]} barSize={28} animationDuration={ANIMATION_DURATION_MS} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </section>
        </div>
    );
};

export default CashflowDistribution;
