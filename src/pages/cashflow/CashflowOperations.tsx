/**
 * Operations (TGLA-251): every operation of the period with search and filters (category, bank,
 * direction, to categorise), the category changed in place with an offer to apply it to similar
 * operations (a rule), and the detail of an operation.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Sparkles } from 'lucide-react';
import { cashflowService } from '../../services/cashflow/cashflowService';
import { cashflowCategoryService } from '../../services/cashflow/cashflowCategoryService';
import { resolvePeriod } from '../../services/cashflow/period';
import type { CashflowOperation } from '../../types/cashflow';
import { MerchantAvatar } from '../../components/cashflow/CategoryBadge';
import { CategoryPicker } from '../../components/cashflow/CategoryPicker';
import { CategorySelect } from '../../components/cashflow/ManualOperationDialog';
import { OperationDetailDialog } from '../../components/cashflow/OperationDetailDialog';
import { useCashflow } from './CashflowLayout';

const card = 'rounded-2xl bg-card shadow-lg border border-border';
const field = 'px-3 py-2 rounded-xl bg-subtle text-primary border border-subtle focus:ring-primary focus:border-primary text-sm';

interface PendingRule {
    operation: CashflowOperation;
    categoryId: string;
}

const CashflowOperations: React.FC = () => {
    const { t } = useTranslation();
    const { preset, month, accountIds, currency, version, refresh, labels, categories, customCategories, cashAccounts, monthStartDay } = useCashflow();
    const [params, setParams] = useSearchParams();
    const [operations, setOperations] = useState<CashflowOperation[]>([]);
    const [search, setSearch] = useState('');
    const [direction, setDirection] = useState<'all' | 'in' | 'out'>('all');
    const [instituteId, setInstituteId] = useState('');
    const [selected, setSelected] = useState<CashflowOperation | null>(null);
    const [pendingRule, setPendingRule] = useState<PendingRule | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const categoryFilter = params.get('category') ?? '';
    const uncategorizedOnly = params.get('uncategorized') === '1';

    const period = useMemo(() => resolvePeriod({ preset, month, monthStartDay }), [preset, month, monthStartDay]);

    useEffect(() => {
        let cancelled = false;
        cashflowService.listOperations({
            start: period.start,
            end: period.end,
            accountIds,
            currency,
            categoryId: categoryFilter || undefined,
            uncategorizedOnly,
        }).then(ops => { if (!cancelled) setOperations(ops); });
        return () => { cancelled = true; };
    }, [period.start, period.end, accountIds, currency, categoryFilter, uncategorizedOnly, version]);

    const banks = useMemo(() => {
        const map = new Map<string, string>();
        for (const op of operations) if (op.instituteId) map.set(op.instituteId, op.instituteName ?? op.instituteId);
        return [...map.entries()];
    }, [operations]);

    const visible = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return operations.filter(op =>
            (direction === 'all' || op.direction === direction)
            && (!instituteId || op.instituteId === instituteId)
            && (!needle || op.label.toLowerCase().includes(needle) || op.rawLabel.toLowerCase().includes(needle) || (op.note ?? '').toLowerCase().includes(needle)));
    }, [operations, search, direction, instituteId]);

    const setFilter = (key: 'category' | 'uncategorized', value: string) => {
        const next = new URLSearchParams(params);
        if (value) next.set(key, value);
        else next.delete(key);
        setParams(next, { replace: true });
    };

    const changeCategory = async (operation: CashflowOperation, categoryId: string) => {
        if (categoryId === operation.categoryId) return;
        await cashflowCategoryService.setCategory([operation.id], categoryId);
        setPendingRule({ operation, categoryId });
        refresh();
    };

    const confirmRule = async () => {
        if (!pendingRule) return;
        const result = await cashflowCategoryService.setCategory([pendingRule.operation.id], pendingRule.categoryId, { createRule: true });
        setPendingRule(null);
        if (result.success) setNotice(t('cashflow:operations.ruleCreated'));
        refresh();
    };

    const dateFormat = new Intl.DateTimeFormat(labels.locale, { day: '2-digit', month: 'short', timeZone: 'UTC' });

    return (
        <section className={`${card} overflow-hidden`}>
            <div className="p-4 sm:p-6 space-y-3 border-b border-subtle">
                <div className="flex flex-wrap items-center gap-2">
                    <label className="relative flex-1 min-w-[12rem]">
                        <span className="sr-only">{t('cashflow:operations.search')}</span>
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" aria-hidden="true" />
                        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('cashflow:operations.search')} className={`${field} w-full pl-9`} />
                    </label>
                    <label className="sr-only" htmlFor="operations-category">{t('cashflow:operations.category')}</label>
                    <CategorySelect
                        id="operations-category"
                        value={categoryFilter}
                        onChange={value => setFilter('category', value)}
                        categories={categories}
                        labels={labels}
                        emptyLabel={t('cashflow:operations.allCategories')}
                    />
                    <select value={direction} onChange={e => setDirection(e.target.value as 'all' | 'in' | 'out')} className={field} aria-label={t('cashflow:operations.direction.all')}>
                        {(['all', 'in', 'out'] as const).map(option => <option key={option} value={option}>{t(`cashflow:operations.direction.${option}`)}</option>)}
                    </select>
                    {banks.length > 1 && (
                        <select value={instituteId} onChange={e => setInstituteId(e.target.value)} className={field} aria-label={t('cashflow:accounts.filter')}>
                            <option value="">{t('cashflow:accounts.all')}</option>
                            {banks.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                        </select>
                    )}
                    <button
                        type="button"
                        aria-pressed={uncategorizedOnly}
                        onClick={() => setFilter('uncategorized', uncategorizedOnly ? '' : '1')}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border ${uncategorizedOnly ? 'bg-primary/10 text-brand border-brand' : 'bg-subtle text-secondary border-subtle'}`}
                    >
                        <Sparkles size={14} /> {t('cashflow:operations.uncategorizedOnly')}
                    </button>
                </div>
                {notice && <p className="text-xs font-semibold text-positive" role="status">{notice}</p>}
            </div>

            {visible.length === 0 ? (
                <p className="text-sm text-tertiary py-16 text-center">{operations.length === 0 ? t('cashflow:operations.empty') : t('cashflow:operations.noResults')}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-[11px] uppercase tracking-wider text-tertiary border-b border-subtle">
                                <th className="px-4 py-3 font-bold">{t('cashflow:operations.columns.date')}</th>
                                <th className="px-4 py-3 font-bold">{t('cashflow:operations.columns.label')}</th>
                                <th className="px-4 py-3 font-bold">{t('cashflow:operations.columns.category')}</th>
                                <th className="px-4 py-3 font-bold hidden lg:table-cell">{t('cashflow:operations.columns.account')}</th>
                                <th className="px-4 py-3 font-bold text-right">{t('cashflow:operations.columns.amount')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-subtle">
                            {visible.map(op => (
                                <tr key={op.id} className={`hover:bg-subtle/60 ${op.excluded ? 'opacity-60' : ''}`}>
                                    <td className="px-4 py-3 text-secondary whitespace-nowrap">{dateFormat.format(new Date(op.date))}</td>
                                    <td className="px-4 py-3">
                                        <button type="button" onClick={() => setSelected(op)} className="flex items-center gap-3 text-left min-w-0">
                                            <MerchantAvatar label={op.label} categoryId={op.categoryId} customCategories={customCategories} size={32} />
                                            <span className="min-w-0">
                                                <span className="block font-semibold text-primary truncate max-w-[16rem]">{op.label}</span>
                                                {op.note && <span className="block text-xs text-tertiary truncate max-w-[16rem]">{op.note}</span>}
                                                {op.excluded && <span className="text-[10px] font-bold uppercase text-tertiary">{t('cashflow:operations.excludedBadge')}</span>}
                                            </span>
                                        </button>
                                    </td>
                                    <td className="px-4 py-3">
                                        <CategoryPicker
                                            categoryId={op.categoryId}
                                            direction={op.direction}
                                            categories={categories}
                                            customCategories={customCategories}
                                            labels={labels}
                                            triggerLabel={t('cashflow:operations.changeCategory', { label: op.label })}
                                            onPick={categoryId => void changeCategory(op, categoryId)}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-secondary hidden lg:table-cell whitespace-nowrap">{op.instituteName ? `${op.instituteName} · ${op.accountName}` : op.accountName}</td>
                                    <td className={`px-4 py-3 text-right font-bold tabular-nums whitespace-nowrap ${op.amount > 0 ? 'text-positive' : 'text-primary'}`}>
                                        {labels.money(op.amount, 2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {pendingRule && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,32rem)] bg-card border border-border rounded-2xl shadow-2xl p-4 space-y-3" role="dialog" aria-label={t('cashflow:operations.applySimilarTitle')}>
                    <p className="text-sm font-bold text-primary">{t('cashflow:operations.applySimilarTitle')}</p>
                    <p className="text-xs text-secondary">
                        {t('cashflow:operations.applySimilarBody', { merchant: pendingRule.operation.label, category: labels.categoryName(pendingRule.categoryId) })}
                    </p>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setPendingRule(null)} className="px-3 py-2 rounded-xl text-sm font-semibold text-secondary hover:bg-subtle">
                            {t('cashflow:operations.applySimilarNo')}
                        </button>
                        <button type="button" onClick={() => void confirmRule()} className="px-3 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90">
                            {t('cashflow:operations.applySimilarYes')}
                        </button>
                    </div>
                </div>
            )}

            {selected && (
                <OperationDetailDialog
                    operation={selected}
                    accounts={cashAccounts}
                    categories={categories}
                    labels={labels}
                    onClose={() => setSelected(null)}
                    onChanged={refresh}
                />
            )}
        </section>
    );
};

export default CashflowOperations;
