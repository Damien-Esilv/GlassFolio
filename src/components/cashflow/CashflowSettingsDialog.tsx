/**
 * Cash flow settings: counted accounts, investment income, first day of the month, the user's
 * categories and rules (TGLA-249).
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Trash2, X } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { cashflowService } from '../../services/cashflow/cashflowService';
import { cashflowCategoryService, type CategoryOption } from '../../services/cashflow/cashflowCategoryService';
import { TOP_LEVEL_CASHFLOW_CATEGORIES } from '../../constants/cashflowCategories';
import type { CashflowSettings, CategorizationRule, CustomCashflowCategory } from '../../types/cashflow';
import type { CashflowLabels } from './useCashflowLabels';
import { CategoryBadge } from './CategoryBadge';

interface CashAccount {
    id: string;
    name: string;
    instituteName?: string;
    included: boolean;
}

const field = 'px-3 py-2 rounded-xl bg-subtle text-primary border border-subtle focus:ring-primary focus:border-primary text-sm';
const sectionTitle = 'text-sm font-bold text-primary';

export const CashflowSettingsDialog: React.FC<{
    categories: CategoryOption[];
    customCategories: CustomCashflowCategory[];
    labels: CashflowLabels;
    onClose: () => void;
    onChanged: () => void;
}> = ({ categories, customCategories, labels, onClose, onChanged }) => {
    const { t } = useTranslation();
    useEscapeKey(onClose);
    const [settings, setSettings] = useState<CashflowSettings | null>(null);
    const [accounts, setAccounts] = useState<CashAccount[]>([]);
    const [rules, setRules] = useState<CategorizationRule[]>([]);
    const [parentId, setParentId] = useState<string>(TOP_LEVEL_CASHFLOW_CATEGORIES[4]?.id ?? 'housing');
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);

    const reload = async () => {
        const [current, cash, list] = await Promise.all([
            cashflowCategoryService.getSettings(),
            cashflowService.listCashAccounts(),
            cashflowCategoryService.listRules(),
        ]);
        setSettings(current);
        setAccounts(cash);
        setRules(list);
    };

    useEffect(() => { void reload(); }, []);

    const save = async (patch: Partial<Omit<CashflowSettings, 'ownerId' | 'updatedAt'>>) => {
        setSettings(await cashflowCategoryService.saveSettings(patch));
        await reload();
        onChanged();
    };

    const toggleAccount = (id: string) => {
        const current = accounts.filter(a => a.included).map(a => a.id);
        const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
        void save({ includedAccountIds: next });
    };

    const addCategory = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        const result = await cashflowCategoryService.createCategory(parentId, name);
        if (result.success === false) {
            setError(result.error);
            return;
        }
        setName('');
        onChanged();
    };

    const removeCategory = async (category: CategoryOption) => {
        const parent = category.parentId ? labels.categoryName(category.parentId) : '';
        if (!window.confirm(t('cashflow:settings.deleteCategoryConfirm', { name: category.name, parent }))) return;
        await cashflowCategoryService.deleteCategory(category.id);
        onChanged();
    };

    const removeRule = async (id: string) => {
        await cashflowCategoryService.deleteRule(id);
        await reload();
        onChanged();
    };

    const custom = categories.filter(c => c.custom);
    const parents = TOP_LEVEL_CASHFLOW_CATEGORIES.filter(c => c.kind !== 'transfer');

    if (typeof document === 'undefined') return null;
    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div role="dialog" aria-modal="true" aria-label={t('cashflow:settings.title')} className="bg-card border border-subtle rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-6">
                <div className="flex items-center justify-between border-b border-subtle pb-3">
                    <h3 className="text-lg font-bold text-primary">{t('cashflow:settings.title')}</h3>
                    <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-subtle text-secondary" aria-label={t('cashflow:actions.close')}>
                        <X size={18} />
                    </button>
                </div>

                {settings && (
                    <section className="space-y-3">
                        <h4 className={sectionTitle}>{t('cashflow:settings.accounts')}</h4>
                        <p className="text-xs text-tertiary">{t('cashflow:settings.accountsHint')}</p>
                        <div className="space-y-1">
                            {accounts.map(account => (
                                <label key={account.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-subtle cursor-pointer text-sm text-primary">
                                    <input
                                        type="checkbox"
                                        checked={account.included}
                                        onChange={() => toggleAccount(account.id)}
                                        className="rounded border-subtle bg-subtle text-primary focus:ring-primary focus:border-primary"
                                    />
                                    <span className="flex-1 truncate">{account.instituteName ? `${account.instituteName} · ${account.name}` : account.name}</span>
                                </label>
                            ))}
                        </div>
                        {settings.includedAccountIds !== null && (
                            <button type="button" onClick={() => void save({ includedAccountIds: null })} className="text-xs font-semibold text-brand hover:underline">
                                {t('cashflow:settings.useAll')}
                            </button>
                        )}
                        <label className="flex items-center gap-3 px-2 py-2 text-sm text-primary cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.includeInvestmentIncome}
                                onChange={e => void save({ includeInvestmentIncome: e.target.checked })}
                                className="rounded border-subtle bg-subtle text-primary focus:ring-primary focus:border-primary"
                            />
                            {t('cashflow:settings.investmentIncome')}
                        </label>
                        <label className="flex flex-wrap items-center gap-3 px-2 text-sm text-primary">
                            <span>{t('cashflow:settings.monthStart')}</span>
                            <input
                                type="number"
                                min={1}
                                max={28}
                                value={settings.monthStartDay}
                                onChange={e => void save({ monthStartDay: Number(e.target.value) || 1 })}
                                className={`${field} w-20 tabular-nums`}
                            />
                            <span className="w-full text-xs text-tertiary">{t('cashflow:settings.monthStartHint')}</span>
                        </label>
                    </section>
                )}

                <section className="space-y-3">
                    <h4 className={sectionTitle}>{t('cashflow:settings.categories')}</h4>
                    <p className="text-xs text-tertiary">{t('cashflow:settings.categoriesHint')}</p>
                    {custom.length === 0 ? (
                        <p className="text-sm text-secondary">{t('cashflow:settings.noCategories')}</p>
                    ) : (
                        <ul className="space-y-1">
                            {custom.map(category => (
                                <li key={category.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-subtle">
                                    <span className="flex items-center gap-2 min-w-0">
                                        <CategoryBadge categoryId={category.id} name={category.name ?? ''} customCategories={customCategories} />
                                        <span className="text-xs text-tertiary truncate">{category.parentId ? labels.categoryName(category.parentId) : ''}</span>
                                    </span>
                                    <button type="button" onClick={() => void removeCategory(category)} className="p-1.5 rounded-lg text-tertiary hover:text-negative hover:bg-subtle" aria-label={`${t('cashflow:settings.delete')} ${category.name}`}>
                                        <Trash2 size={14} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <form onSubmit={addCategory} className="flex flex-wrap items-end gap-2">
                        <label className="space-y-1 text-xs font-semibold text-secondary">
                            <span className="block">{t('cashflow:settings.parent')}</span>
                            <select value={parentId} onChange={e => setParentId(e.target.value)} className={field}>
                                {parents.map(parent => <option key={parent.id} value={parent.id}>{labels.categoryName(parent.id)}</option>)}
                            </select>
                        </label>
                        <label className="space-y-1 text-xs font-semibold text-secondary flex-1 min-w-[10rem]">
                            <span className="block">{t('cashflow:settings.name')}</span>
                            <input type="text" value={name} maxLength={40} onChange={e => setName(e.target.value)} className={`${field} w-full`} />
                        </label>
                        <button type="submit" className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90">{t('cashflow:settings.add')}</button>
                    </form>
                    {error && <p className="text-sm text-negative" role="alert">{t(`cashflow:settings.errors.${error}`)}</p>}
                </section>

                <section className="space-y-3">
                    <h4 className={sectionTitle}>{t('cashflow:settings.rules')}</h4>
                    <p className="text-xs text-tertiary">{t('cashflow:settings.rulesHint')}</p>
                    {rules.length === 0 ? (
                        <p className="text-sm text-secondary">{t('cashflow:settings.noRules')}</p>
                    ) : (
                        <ul className="space-y-1">
                            {rules.map(rule => (
                                <li key={rule.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-subtle text-sm">
                                    <span className="flex flex-wrap items-center gap-2 min-w-0">
                                        <span className="font-semibold text-primary">{t('cashflow:settings.ruleContains', { text: rule.labelContains })}</span>
                                        <span className="text-xs text-tertiary">{t(`cashflow:settings.ruleDirection.${rule.direction}`)}</span>
                                        <CategoryBadge categoryId={rule.categoryId} name={labels.categoryName(rule.categoryId)} customCategories={customCategories} />
                                        <span className="text-xs text-tertiary">{t(`cashflow:settings.ruleBy.${rule.source}`)}</span>
                                    </span>
                                    <button type="button" onClick={() => void removeRule(rule.id)} className="p-1.5 rounded-lg text-tertiary hover:text-negative hover:bg-subtle" aria-label={t('cashflow:settings.deleteRule')}>
                                        <Trash2 size={14} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </div>,
        document.body,
    );
};
