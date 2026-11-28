/**
 * Month after month (TGLA-250), after Finary's cash flow chart: for each month a thin bar of money
 * in, next to a stacked bar of money out (recurring, day-to-day, savings) topped by what stayed
 * available, and the savings rate as a filled line. The months of the chosen period sit on a tinted band with
 * their bars lit and their names bold; the months shown for context are dimmed. A new period redraws the chart,
 * every bar growing from the axis together. A click on a month selects it.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Area, Bar, CartesianGrid, Cell, ComposedChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CASHFLOW_ROLE_TOKENS } from '../../constants/cashflowPalette';
import { ANIMATION_DURATION_MS, ANIMATION_EASING } from '../../constants/animations';
import type { CashflowMonth } from '../../types/cashflow';
import type { CashflowLabels } from './useCashflowLabels';
import { ColorDot } from './CategoryBadge';

interface TrendRow {
    month: string;
    label: string;
    income: number;
    fixed: number;
    variable: number;
    savings: number;
    available: number;
    savingsRate: number;
}

const ROLES = CASHFLOW_ROLE_TOKENS;

const SERIES: readonly { key: keyof Omit<TrendRow, 'month' | 'label'>; legend: string; cssVar: string }[] = [
    { key: 'income', legend: 'income', cssVar: ROLES.income.cssVar },
    { key: 'fixed', legend: 'fixed', cssVar: ROLES.expenseFixed.cssVar },
    { key: 'variable', legend: 'variable', cssVar: ROLES.expense.cssVar },
    { key: 'savings', legend: 'savings', cssVar: ROLES.savings.cssVar },
    { key: 'available', legend: 'available', cssVar: ROLES.available.cssVar },
];

const TrendTooltip: React.FC<{ row?: TrendRow; labels: CashflowLabels }> = ({ row, labels }) => {
    const { t } = useTranslation();
    if (!row) return null;
    return (
        <div className="bg-card border border-border p-3 rounded-xl shadow-xl text-xs space-y-1.5 min-w-[200px]">
            <p className="text-[10px] text-tertiary font-bold uppercase tracking-wider capitalize">{labels.monthName(row.month)}</p>
            {SERIES.map(series => (
                <div key={series.key} className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-2 text-secondary"><ColorDot cssVar={series.cssVar} />{t(`cashflow:overview.legend.${series.legend}`)}</span>
                    <span className="font-bold text-primary tabular-nums">{labels.money(row[series.key])}</span>
                </div>
            ))}
            <div className="flex items-center justify-between gap-4 pt-1 border-t border-subtle">
                <span className="text-secondary">{t('cashflow:overview.legend.savingsRate')}</span>
                <span className="font-bold text-primary tabular-nums">{row.income > 0 ? labels.percent(row.savingsRate / 100) : '—'}</span>
            </div>
        </div>
    );
};

/** Tinted band behind the chosen months. */
const periodBand = (props: { x?: number; y?: number; width?: number; height?: number }): React.ReactElement<SVGElement> => (
    <rect
        x={props.x ?? 0}
        y={props.y ?? 0}
        width={Math.max(0, props.width ?? 0)}
        height={Math.max(0, props.height ?? 0)}
        rx={12}
        fill={ROLES.available.cssVar}
        fillOpacity={0.08}
        stroke={ROLES.available.cssVar}
        strokeOpacity={0.25}
    />
);

/** Month name under the axis: bold and bright inside the chosen period, faded outside. */
const MonthTick: React.FC<{ x?: number; y?: number; payload?: { value: string }; firstMonth: string; lastMonth: string; labels: CashflowLabels }> = ({ x = 0, y = 0, payload, firstMonth, lastMonth, labels }) => {
    const month = payload?.value ?? '';
    const chosen = month >= firstMonth && month <= lastMonth;
    return (
        <text x={x} y={y} dy={16} textAnchor="middle" fontSize={11} fontWeight={chosen ? 800 : 600} fill={chosen ? 'var(--text-primary)' : 'var(--text-tertiary)'} opacity={chosen ? 1 : 0.6}>
            {labels.monthName(month, 'short')}
        </text>
    );
};

export const MonthTrendChart: React.FC<{
    months: CashflowMonth[];
    /** Months of the chosen period (YYYY-MM, inclusive), lit */
    firstMonth: string;
    lastMonth: string;
    onSelect: (month: string) => void;
    labels: CashflowLabels;
}> = ({ months, firstMonth, lastMonth, onSelect, labels }) => {
    const { t } = useTranslation();
    const rows: TrendRow[] = months.map(m => ({
        month: m.month,
        label: labels.monthName(m.month, 'short'),
        income: Math.max(0, m.income),
        fixed: Math.max(0, m.fixedExpenses),
        variable: Math.max(0, m.variableExpenses),
        savings: Math.max(0, m.savingsInvested),
        available: Math.max(0, m.available),
        // The line stays readable: a month with almost no income would push it far off the chart
        savingsRate: Math.max(-100, Math.min(100, Math.round(m.savingsRate * 1000) / 10)),
    }));
    const opacity = (row: TrendRow): number => (row.month >= firstMonth && row.month <= lastMonth ? 1 : 0.25);
    // The band covers the chosen months that the chart shows
    const shown = rows.map(row => row.month);
    const bandStart = shown.find(month => month >= firstMonth);
    const bandEnd = [...shown].reverse().find(month => month <= lastMonth);
    // The band frames a period shorter than the chart (a month, a quarter); when every bar is chosen it adds nothing
    const framed = shown.filter(month => month >= firstMonth && month <= lastMonth).length < shown.length;
    // Any new period redraws the chart, so every bar grows from the axis the same way, whatever the switch
    const chartKey = `${firstMonth}-${lastMonth}-${shown[0] ?? ''}-${shown.length}`;
    const compact = new Intl.NumberFormat(labels.locale, { notation: 'compact', maximumFractionDigits: 1 });

    return (
        <div className="space-y-4">
            <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                        key={chartKey}
                        data={rows}
                        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                        barGap={4}
                        onClick={state => {
                            const index = typeof state?.activeIndex === 'number' ? state.activeIndex : Number(state?.activeIndex);
                            const row = Number.isFinite(index) ? rows[index] : undefined;
                            if (row) onSelect(row.month);
                        }}
                    >
                        <defs>
                            <linearGradient id="cashflow-rate-fill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={ROLES.savings.cssVar} stopOpacity={0.35} />
                                <stop offset="100%" stopColor={ROLES.savings.cssVar} stopOpacity={0.02} />
                            </linearGradient>
                        </defs>
                        {framed && bandStart && bandEnd && bandStart <= bandEnd && (
                            <ReferenceArea
                                yAxisId="amount"
                                x1={bandStart}
                                x2={bandEnd}
                                ifOverflow="visible"
                                shape={periodBand}
                            />
                        )}
                        <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="3 6" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} interval={0} tick={<MonthTick firstMonth={firstMonth} lastMonth={lastMonth} labels={labels} />} />
                        <YAxis yAxisId="amount" axisLine={false} tickLine={false} width={48} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickFormatter={value => compact.format(Number(value))} />
                        <YAxis yAxisId="rate" orientation="right" hide domain={[-100, 100]} allowDataOverflow />
                        <Tooltip
                            cursor={{ fill: 'var(--bg-subtle)', opacity: 0.4 }}
                            content={({ active, payload }) => (active && payload?.length ? <TrendTooltip row={payload[0].payload as TrendRow} labels={labels} /> : null)}
                        />
                        <Area
                            yAxisId="rate"
                            type="monotone"
                            dataKey="savingsRate"
                            baseValue={-100}
                            stroke={ROLES.savings.cssVar}
                            strokeWidth={2}
                            fill="url(#cashflow-rate-fill)"
                            dot={{ r: 3, fill: 'var(--bg-card)', stroke: ROLES.savings.cssVar, strokeWidth: 2 }}
                            activeDot={{ r: 5 }}
                            animationDuration={ANIMATION_DURATION_MS}
                            animationEasing={ANIMATION_EASING}
                        />
                        <Bar yAxisId="amount" dataKey="income" barSize={9} radius={[5, 5, 5, 5]} fill={ROLES.income.cssVar} animationDuration={ANIMATION_DURATION_MS}>
                            {rows.map(row => <Cell key={row.month} fillOpacity={opacity(row)} className="cursor-pointer" />)}
                        </Bar>
                        <Bar yAxisId="amount" dataKey="fixed" stackId="out" barSize={9} radius={[0, 0, 5, 5]} fill={ROLES.expenseFixed.cssVar} animationDuration={ANIMATION_DURATION_MS}>
                            {rows.map(row => <Cell key={row.month} fillOpacity={opacity(row)} className="cursor-pointer" />)}
                        </Bar>
                        <Bar yAxisId="amount" dataKey="variable" stackId="out" barSize={9} fill={ROLES.expense.cssVar} animationDuration={ANIMATION_DURATION_MS}>
                            {rows.map(row => <Cell key={row.month} fillOpacity={opacity(row)} className="cursor-pointer" />)}
                        </Bar>
                        <Bar yAxisId="amount" dataKey="savings" stackId="out" barSize={9} fill={ROLES.savings.cssVar} animationDuration={ANIMATION_DURATION_MS}>
                            {rows.map(row => <Cell key={row.month} fillOpacity={opacity(row)} className="cursor-pointer" />)}
                        </Bar>
                        <Bar yAxisId="amount" dataKey="available" stackId="out" barSize={9} radius={[5, 5, 0, 0]} fill={ROLES.available.cssVar} animationDuration={ANIMATION_DURATION_MS}>
                            {rows.map(row => <Cell key={row.month} fillOpacity={opacity(row)} className="cursor-pointer" />)}
                        </Bar>
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary">
                {SERIES.map(series => (
                    <span key={series.key} className="flex items-center gap-1.5"><ColorDot cssVar={series.cssVar} />{t(`cashflow:overview.legend.${series.legend}`)}</span>
                ))}
                <span className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block w-4 h-0.5 rounded" style={{ backgroundColor: ROLES.savings.cssVar }} />{t('cashflow:overview.legend.savingsRate')}</span>
            </div>
        </div>
    );
};
