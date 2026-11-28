/**
 * End-of-month forecast (Epic E52 — TGLA-257): today's balance of the counted accounts, the balance expected at the
 * month end and what makes it up, and the month as a curve — solid until today, dotted after.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CASHFLOW_ROLE_TOKENS } from '../../constants/cashflowPalette';
import { cashflowPlanningService } from '../../services/cashflow/cashflowPlanningService';
import type { CashflowForecast } from '../../types/cashflow';
import { ColorDot } from './CategoryBadge';
import { CountUpMoney } from './CountUp';
import type { CashflowLabels } from './useCashflowLabels';

const ForecastTooltip: React.FC<{ active?: boolean; payload?: ReadonlyArray<{ payload?: { date: string; known?: number; projected?: number } }>; labels: CashflowLabels }> = ({ active, payload, labels }) => {
    const { t } = useTranslation();
    const point = payload?.[0]?.payload;
    if (!active || !point) return null;
    const projected = point.known === undefined;
    return (
        <div className="bg-card border border-border px-3 py-2 rounded-xl shadow-xl text-xs">
            <p className="font-bold text-primary">{new Intl.DateTimeFormat(labels.locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${point.date}T00:00:00Z`))}</p>
            <p className="text-secondary tabular-nums">
                {t(projected ? 'cashflow:forecast.projectedBalance' : 'cashflow:forecast.balance')} {labels.money((projected ? point.projected : point.known) ?? 0)}
            </p>
        </div>
    );
};

export const ForecastCard: React.FC<{ currency: string; accountIds?: string[]; version: number; labels: CashflowLabels }> = ({ currency, accountIds, version, labels }) => {
    const { t } = useTranslation();
    const [forecast, setForecast] = useState<CashflowForecast | null>(null);

    useEffect(() => {
        let cancelled = false;
        cashflowPlanningService.getForecast({ currency, accountIds }).then(result => { if (!cancelled) setForecast(result); });
        return () => { cancelled = true; };
    }, [currency, accountIds, version]);

    // Two series sharing today, so the dotted part starts where the solid one stops
    const data = useMemo(() => (forecast?.points ?? []).map(point => ({
        date: point.date,
        known: point.projected ? undefined : point.balance,
        projected: point.projected || point.date === forecast?.today ? point.balance : undefined,
    })), [forecast]);

    if (!forecast) return null;
    const monthEnd = new Intl.DateTimeFormat(labels.locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${forecast.monthEnd}T00:00:00Z`));
    const parts = [
        { key: 'upcoming', value: forecast.upcomingTotal },
        { key: 'recurring', value: forecast.recurringTotal },
        { key: 'variable', value: forecast.variableTotal },
    ] as const;
    const available = CASHFLOW_ROLE_TOKENS.available.cssVar;
    const projectedColor = CASHFLOW_ROLE_TOKENS.forecast.cssVar;

    return (
        <section className="rounded-2xl bg-card p-6 shadow-lg border border-border space-y-4" aria-label={t('cashflow:forecast.title', { date: monthEnd })}>
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="text-sm font-bold text-primary">{t('cashflow:forecast.title', { date: monthEnd })}</h2>
                    <p className="text-xs text-tertiary">{t('cashflow:forecast.hint')}</p>
                </div>
                <div className="flex flex-wrap gap-6">
                    <div>
                        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-tertiary"><ColorDot cssVar={available} />{t('cashflow:forecast.today')}</p>
                        <p className="text-lg font-bold text-primary tabular-nums"><CountUpMoney value={forecast.balanceToday} labels={labels} /></p>
                    </div>
                    <div>
                        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-tertiary"><ColorDot cssVar={projectedColor} />{t('cashflow:forecast.end')}</p>
                        <p className={`text-2xl font-bold tabular-nums ${forecast.projectedEnd < 0 ? 'text-negative' : 'text-brand'}`}><CountUpMoney value={forecast.projectedEnd} labels={labels} /></p>
                    </div>
                </div>
            </div>
            <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <XAxis dataKey="date" tickFormatter={value => String(Number(String(value).slice(8, 10)))} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
                        <YAxis hide domain={['auto', 'auto']} />
                        <ReferenceLine y={0} stroke="var(--border-subtle)" />
                        <Tooltip content={({ active, payload }) => <ForecastTooltip active={active} payload={payload as ReadonlyArray<{ payload?: { date: string; known?: number; projected?: number } }>} labels={labels} />} />
                        <Line type="monotone" dataKey="known" stroke={available} strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive animationDuration={900} />
                        <Line type="monotone" dataKey="projected" stroke={projectedColor} strokeWidth={2.5} strokeDasharray="6 5" dot={false} connectNulls={false} isAnimationActive animationBegin={700} animationDuration={900} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {parts.map(part => (
                    <li key={part.key} className="rounded-xl bg-subtle border border-subtle px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-tertiary">{t(`cashflow:forecast.parts.${part.key}`)}</p>
                        <p className="text-sm font-bold text-primary tabular-nums"><CountUpMoney value={part.value} labels={labels} /></p>
                    </li>
                ))}
            </ul>
        </section>
    );
};
