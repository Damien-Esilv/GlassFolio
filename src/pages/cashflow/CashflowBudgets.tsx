/**
 * Budgets (Epic E52 — TGLA-256): a monthly cap per spending category, its gauge for the month shown (ok, near from
 * 80 %, over), the cap edited in place, and the 12-month average next to it to help set it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { THEME_INTENT } from '../../constants/themeTokens';
import { TOP_LEVEL_CASHFLOW_CATEGORIES } from '../../constants/cashflowCategories';
import { cashflowPlanningService } from '../../services/cashflow/cashflowPlanningService';
import type { BudgetState, BudgetStatus } from '../../types/cashflow';
import { CategoryBadge } from '../../components/cashflow/CategoryBadge';
import { CountUpMoney, CountUpNumber } from '../../components/cashflow/CountUp';
import { CASHFLOW_FIELD } from '../../components/cashflow/formStyles';
import { useCashflow } from './CashflowLayout';

const card = 'rounded-2xl bg-card p-6 shadow-lg border border-border';
const STATE_INTENT: Record<BudgetState, keyof typeof THEME_INTENT> = { ok: 'positive', near: 'warning', over: 'negative' };
const STAGGER_MS = 40;

const CapInput: React.FC<{ label: string; value: number | undefined; onSave: (value: number | null) => void }> = ({ label, value, onSave }) => {
    const [draft, setDraft] = useState(value === undefined ? '' : String(value));
    useEffect(() => setDraft(value === undefined ? '' : String(value)), [value]);
    const commit = () => {
        const parsed = draft.trim() === '' ? null : Number(draft.replace(',', '.'));
        if (parsed === null && value === undefined) return;
        if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return setDraft(value === undefined ? '' : String(value));
        if (parsed === value) return;
        onSave(parsed);
    };
    return (
        <input
            type="text"
            inputMode="decimal"
            value={draft}
            aria-label={label}
            placeholder="—"
            onChange={event => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
            className={`${CASHFLOW_FIELD} w-28 text-right tabular-nums`}
        />
    );
};

const CashflowBudgets: React.FC = () => {
    const { t } = useTranslation();
    const { summary, month, accountIds, currency, version, refresh, labels, customCategories, periodLabel } = useCashflow();
    const [statuses, setStatuses] = useState<BudgetStatus[]>([]);

    useEffect(() => {
        let cancelled = false;
        cashflowPlanningService.getBudgetStatus({ month, currency, accountIds }).then(result => { if (!cancelled) setStatuses(result.statuses); });
        return () => { cancelled = true; };
    }, [month, currency, accountIds, version]);

    const rows = useMemo(() => {
        const byCategory = new Map((summary?.categories ?? []).map(category => [category.categoryId, category]));
        const status = new Map<string, BudgetStatus>(statuses.map(item => [item.categoryId, item]));
        return TOP_LEVEL_CASHFLOW_CATEGORIES
            .filter(category => category.kind === 'expense')
            .map(category => ({ id: category.id, total: byCategory.get(category.id), status: status.get(category.id) }))
            // Budgets first, the most used on top: over the cap (furthest over first), then close to it, then fine;
            // the same order as the dashboard card. Then the categories without a cap, the biggest spending first.
            .sort((a, b) => Number(Boolean(b.status)) - Number(Boolean(a.status))
                || (b.status?.ratio ?? 0) - (a.status?.ratio ?? 0)
                || (b.total?.amount ?? 0) - (a.total?.amount ?? 0));
    }, [summary, statuses]);

    if (!summary) return null;

    const save = async (categoryId: string, value: number | null) => {
        await cashflowPlanningService.setBudget(categoryId, value);
        refresh();
    };
    const budgeted = statuses.reduce((sum, item) => sum + item.limit, 0);
    const spent = statuses.reduce((sum, item) => sum + item.spent, 0);
    const over = statuses.filter(item => item.state === 'over').length;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-subtle border border-subtle px-4 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-tertiary">{t('cashflow:budgets.budgeted')}</p>
                    <p className="text-xl font-bold text-primary tabular-nums"><CountUpMoney value={budgeted} labels={labels} /></p>
                </div>
                <div className="rounded-xl bg-subtle border border-subtle px-4 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-tertiary">{t('cashflow:budgets.spent')}</p>
                    <p className="text-xl font-bold text-primary tabular-nums"><CountUpMoney value={spent} labels={labels} /></p>
                </div>
                <div className={`rounded-xl border px-4 py-3 ${over > 0 ? 'bg-negative-subtle border-negative' : 'bg-subtle border-subtle'}`}>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-tertiary">{t('cashflow:budgets.over')}</p>
                    <p className={`text-xl font-bold tabular-nums ${over > 0 ? 'text-negative' : 'text-primary'}`}><CountUpNumber value={over} labels={labels} /></p>
                </div>
            </div>

            <section className={`${card} space-y-1`}>
                <div className="pb-3">
                    <h2 className="text-sm font-bold text-primary">{t('cashflow:budgets.title', { month: periodLabel })}</h2>
                    <p className="text-xs text-tertiary">{t('cashflow:budgets.hint')}</p>
                </div>
                <ul className="divide-y divide-subtle">
                    {rows.map((row, index) => {
                        const intent = row.status ? THEME_INTENT[STATE_INTENT[row.status.state]] : undefined;
                        const width = row.status ? Math.min(100, Math.round(row.status.ratio * 100)) : 0;
                        const name = labels.categoryName(row.id);
                        return (
                            <li key={row.id} className="animate-row-in py-3 space-y-2" style={{ animationDelay: `${Math.min(index, 16) * STAGGER_MS}ms` }}>
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="flex-1 min-w-[10rem]"><CategoryBadge categoryId={row.id} name={name} customCategories={customCategories} size="md" /></span>
                                    <span className="text-sm text-secondary tabular-nums">
                                        {labels.money(row.total?.amount ?? 0)}
                                        {row.status && <> / {labels.money(row.status.limit)}</>}
                                    </span>
                                    {row.status && (
                                        <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${intent?.bgSubtle} ${intent?.text}`}>
                                            {t(`cashflow:budgets.state.${row.status.state}`)}
                                        </span>
                                    )}
                                    <CapInput label={t('cashflow:budgets.capFor', { category: name })} value={row.status?.limit} onSave={value => void save(row.id, value)} />
                                </div>
                                {row.status ? (
                                    <div className="h-2 rounded-full bg-subtle overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(row.status.ratio * 100)} aria-label={name}>
                                        <div className={`h-full rounded-full animate-grow-width ${intent?.bg}`} style={{ '--target-width': `${width}%` } as React.CSSProperties} />
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-tertiary">
                                        {t('cashflow:budgets.average', { amount: labels.money(row.total?.averageMonthly ?? 0) })}
                                    </p>
                                )}
                                {row.status && (
                                    <p className="text-[11px] text-tertiary">
                                        {row.status.remaining >= 0
                                            ? t('cashflow:budgets.remaining', { amount: labels.money(row.status.remaining) })
                                            : t('cashflow:budgets.exceeded', { amount: labels.money(-row.status.remaining) })}
                                        {' · '}{t('cashflow:budgets.average', { amount: labels.money(row.total?.averageMonthly ?? 0) })}
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </section>
        </div>
    );
};

export default CashflowBudgets;
