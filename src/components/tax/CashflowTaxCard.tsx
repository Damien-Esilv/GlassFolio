/**
 * Reductions and credits spotted in the cash flow (Epic E52 — TGLA-259): donations, home help, childcare and PER
 * contributions of the income year, with the estimated benefit under that year's rates and caps. An estimate: the
 * receipts and certificates decide, and nothing here changes the tax computed elsewhere.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HandCoins, Info } from 'lucide-react';
import { cashflowPlanningService } from '../../services/cashflow/cashflowPlanningService';
import type { TaxItem } from '../../services/cashflow/taxItems';
import type { FiscalProfile } from '../../types/types.backend';
import { formatCurrency } from '../../utils/currency';

/** The cash flow category whose operations make each item (the PER: the payments into PER accounts). */
const CATEGORY_OF: Record<TaxItem['kind'], string | null> = {
    donations_aid: 'donations',
    donations: 'donations',
    home_services: 'home_services',
    childcare: 'childcare',
    per: null,
};

export const CashflowTaxCard: React.FC<{ year: string; profile: FiscalProfile; currency: string }> = ({ year, profile, currency }) => {
    const { t, i18n } = useTranslation();
    const [result, setResult] = useState<{ items: TaxItem[]; marginalRate?: number } | null | undefined>(undefined);
    const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-US';
    const money = (value: number): string => formatCurrency(value, currency, locale, { maximumFractionDigits: 0 });
    const percent = (ratio: number): string => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio);

    useEffect(() => {
        let cancelled = false;
        cashflowPlanningService.getTaxItems(year, profile, currency).then(value => { if (!cancelled) setResult(value); });
        return () => { cancelled = true; };
    }, [year, profile, currency]);

    if (result === undefined) return null;
    const items = result?.items ?? [];
    const total = items.reduce((sum, item) => sum + item.estimate, 0);

    return (
        <section className="bg-card border border-subtle rounded-2xl p-6 space-y-4 shadow-md" aria-label={t('tax:optimization.cashflowCredits.title', { year })}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-brand/10 text-brand"><HandCoins size={20} aria-hidden="true" /></div>
                    <div>
                        <h3 className="text-lg font-bold text-primary">{t('tax:optimization.cashflowCredits.title', { year })}</h3>
                        <p className="text-xs text-secondary">{t('tax:optimization.cashflowCredits.subtitle')}</p>
                    </div>
                </div>
                {items.length > 0 && (
                    <div className="text-right">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-tertiary">{t('tax:optimization.cashflowCredits.total')}</p>
                        <p className="text-2xl font-bold text-positive tabular-nums">{money(total)}</p>
                    </div>
                )}
            </div>

            {items.length === 0 ? (
                <p className="text-sm text-secondary rounded-xl bg-subtle p-4">{t('tax:optimization.cashflowCredits.empty', { year })}</p>
            ) : (
                <ul className="divide-y divide-subtle">
                    {items.map(item => {
                        const category = CATEGORY_OF[item.kind];
                        return (
                            <li key={item.kind} className="py-3 flex flex-wrap items-center gap-3">
                                <div className="flex-1 min-w-[14rem]">
                                    <p className="text-sm font-semibold text-primary">{t(`tax:optimization.cashflowCredits.kinds.${item.kind}`)}</p>
                                    <p className="text-xs text-tertiary">
                                        {item.kind === 'per'
                                            ? (result?.marginalRate !== undefined
                                                ? t('tax:optimization.cashflowCredits.perDetail', { paid: money(item.paid), rate: percent(item.rate), floor: money(item.cap ?? 0) })
                                                : t('tax:optimization.cashflowCredits.perNoRate', { paid: money(item.paid), floor: money(item.cap ?? 0) }))
                                            : t('tax:optimization.cashflowCredits.detail', { paid: money(item.paid), rate: percent(item.rate), base: money(item.base) })}
                                        {item.cap !== undefined && item.kind !== 'per' && ` · ${t('tax:optimization.cashflowCredits.cap', { cap: money(item.cap) })}`}
                                    </p>
                                </div>
                                <span className="text-sm font-bold text-positive tabular-nums">{money(item.estimate)}</span>
                                {category && (
                                    <Link to={`/cashflow/operations?category=${category}`} className="text-xs font-semibold text-brand hover:underline">
                                        {t('tax:optimization.cashflowCredits.see', { count: item.operationIds.length })}
                                    </Link>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            <div className="rounded-xl bg-warning/10 border border-warning/30 p-3 flex gap-2">
                <Info size={14} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-secondary">{t('tax:optimization.cashflowCredits.disclaimer')}</p>
            </div>
        </section>
    );
};
