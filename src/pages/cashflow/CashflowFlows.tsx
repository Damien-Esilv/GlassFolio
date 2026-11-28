/**
 * Flows (TGLA-251): the 4-column Sankey of the period, from income sources to taxes, savings and
 * spending, with the totals above it.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { CASHFLOW_ROLE_TOKENS } from '../../constants/cashflowPalette';
import { CashflowSankeyChart } from '../../components/cashflow/CashflowSankeyChart';
import { ColorDot } from '../../components/cashflow/CategoryBadge';
import { CountUpMoney } from '../../components/cashflow/CountUp';
import { useCashflow } from './CashflowLayout';

const card = 'rounded-2xl bg-card p-6 shadow-lg border border-border';

const CashflowFlows: React.FC = () => {
    const { t } = useTranslation();
    const { summary, labels, customCategories } = useCashflow();
    if (!summary) return null;

    const totals = [
        { key: 'income', value: summary.income, cssVar: CASHFLOW_ROLE_TOKENS.income.cssVar },
        { key: 'expenses', value: -summary.expenses, cssVar: CASHFLOW_ROLE_TOKENS.expense.cssVar },
        { key: 'savingsInvested', value: summary.savingsInvested, cssVar: CASHFLOW_ROLE_TOKENS.savings.cssVar },
    ] as const;

    return (
        <section className={`${card} space-y-6`}>
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                    <h2 className="text-lg font-bold text-primary">{t('cashflow:flows.title')}</h2>
                    <p className="text-sm text-secondary">{t('cashflow:flows.subtitle')}</p>
                </div>
                <div className="flex flex-wrap gap-4">
                    {totals.map(total => (
                        <div key={total.key}>
                            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-tertiary"><ColorDot cssVar={total.cssVar} />{t(`cashflow:kpi.${total.key}`)}</p>
                            <p className="text-lg font-bold text-primary tabular-nums"><CountUpMoney value={total.value} labels={labels} /></p>
                        </div>
                    ))}
                </div>
            </div>
            {summary.sankey.nodes.length === 0 ? (
                <p className="text-sm text-tertiary py-16 text-center">{t('cashflow:flows.empty')}</p>
            ) : (
                <div className="overflow-x-auto">
                    <div className="min-w-[880px]">
                        {/* Keyed by the totals: a new period draws its flows again */}
                        <CashflowSankeyChart key={`${summary.periodStart}-${summary.periodEnd}-${summary.income}-${summary.expenses}`} sankey={summary.sankey} labels={labels} customCategories={customCategories} />
                    </div>
                </div>
            )}
        </section>
    );
};

export default CashflowFlows;
