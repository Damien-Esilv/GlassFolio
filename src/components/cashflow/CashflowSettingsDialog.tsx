/**
 * Cash flow settings: counted accounts, investment income, first day of the month, the user's
 * categories and rules (TGLA-249). Deletions are confirmed in place (the app's pattern), rules are created here
 * as well as from an operation. Opened from a category list, it scrolls to "My categories".
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { DeleteInPlace } from '../ui/DeleteInPlace';
import { CategorySelect } from './ManualOperationDialog';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { cashflowService } from '../../services/cashflow/cashflowService';
import { cashflowCategoryService, type CategoryOption } from '../../services/cashflow/cashflowCategoryService';
import { TOP_LEVEL_CASHFLOW_CATEGORIES } from '../../constants/cashflowCategories';
import type { CashflowSettings, CategorizationRule, CustomCashflowCategory, RuleDirection } from '../../types/cashflow';
import type { CashflowLabels } from './useCashflowLabels';
import { CategoryBadge } from './CategoryBadge';
import { CASHFLOW_DIALOG_BACKDROP, CASHFLOW_FIELD, CASHFLOW_PRIMARY_BUTTON } from './formStyles';

interface CashAccount {
    id: string;
    name: string;
    instituteName?: string;
    included: boolean;
}

const field = CASHFLOW_FIELD;
const sectionTitle = 'text-sm font-bold text-primary';

export const CashflowSettingsDialog: React.FC<{
    categories: CategoryOption[];
    customCategories: CustomCashflowCategory[];
    labels: CashflowLabels;
    onClose: () => void;
    onChanged: () => void;
    /** Section shown first */
    focus?: 'categories';
}> = ({ categories, customCategories, labels, onClose, onChanged, focus }) => {
    const { t } = useTranslation();
    useEscapeKey(onClose);
    const [settings, setSettings] = useState<CashflowSettings | null>(null);
    const [accounts, setAccounts] = useState<CashAccount[]>([]);
    const [rules, setRules] = useState<CategorizationRule[]>([]);
    const [parentId, setParentId] = useState<string>(TOP_LEVEL_CASHFLOW_CATEGORIES[4]?.id ?? 'housing');
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [ruleText, setRuleText] = useState('');
    const [ruleDirection, setRuleDirection] = useState<RuleDirection>('out');
    const [ruleCategory, setRuleCategory] = useState('');
    const [ruleError, setRuleError] = useState<string | null>(null);
    const categoriesRef = useRef<HTMLElement>(null);
    const nameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (focus !== 'categories') return;
        categoriesRef.current?.scrollIntoView({ block: 'start' });
        nameRef.current?.focus({ preventScroll: true });
    }, [focus]);

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
        await cashflowCategoryService.deleteCategory(category.id);
        onChanged();
    };

    const addRule = async (event: React.FormEvent) => {
        event.preventDefault();
        setRuleError(null);
        if (!ruleCategory) {
            setRuleError('unknown_category');
            return;
        }
        const result = await cashflowCategoryService.createRule({ labelContains: ruleText, direction: ruleDirection, categoryId: ruleCategory });
        if (result.success === false) {
            setRuleError(result.error);
            return;
        }
        setRuleText('');
        await reload();
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
        <div className={CASHFLOW_DIALOG_BACKDROP}>
            {/* The title stays put and only the content scrolls, inside the rounded corners */}
            <div role="dialog" aria-modal="true" aria-label={t('cashflow:settings.title')} className="bg-card border border-subtle rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between border-b border-subtle px-6 py-4 shrink-0">
                    <h3 className="text-lg font-bold text-primary">{t('cashflow:settings.title')}</h3>
                    <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-subtle text-secondary" aria-label={t('cashflow:actions.close')}>
                        <X size={18} />
                    </button>
                </div>
                <div className="overflow-y-auto px-6 py-5 space-y-6 divide-y divide-subtle [&>*+*]:pt-6">

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
                    </section>
                )}

                {settings && (
                    <section className="space-y-3">
                        <h4 className={sectionTitle}>{t('cashflow:settings.display')}</h4>
                        <label className="flex items-start gap-3 px-2 py-2 text-sm text-primary cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.merchantLogos !== false}
                                onChange={e => void save({ merchantLogos: e.target.checked })}
                                className="mt-0.5 rounded border-subtle bg-subtle text-primary focus:ring-primary focus:border-primary"
                            />
                            <span className="space-y-0.5">
                                <span className="block">{t('cashflow:settings.merchantLogos')}</span>
                                <span className="block text-xs text-tertiary">{t('cashflow:settings.merchantLogosHint')}</span>
                            </span>
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

                <section ref={categoriesRef} className="space-y-3 scroll-mt-4">
                    <h4 className={sectionTitle}>{t('cashflow:settings.categories')}</h4>
                    <p className="text-xs text-tertiary">{t('cashflow:settings.categoriesHint')}</p>
                    {custom.length === 0 ? (
                        <p className="text-sm text-secondary">{t('cashflow:settings.noCategories')}</p>
                    ) : (
                        <ul className="space-y-2">
                            {custom.map(category => (
                                <li key={category.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-subtle bg-subtle/40">
                                    <span className="flex items-center gap-2 min-w-0">
                                        <CategoryBadge categoryId={category.id} name={category.name ?? ''} customCategories={customCategories} />
                                        <span className="text-xs text-tertiary truncate">{category.parentId ? labels.categoryName(category.parentId) : ''}</span>
                                    </span>
                                    <DeleteInPlace
                                        label={`${t('cashflow:settings.delete')} ${category.name}`}
                                        warning={t('cashflow:settings.deleteCategoryConfirm', { name: category.name, parent: category.parentId ? labels.categoryName(category.parentId) : '' })}
                                        confirmLabel={t('cashflow:settings.delete')}
                                        onDelete={() => removeCategory(category)}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                    <form onSubmit={addCategory} className="space-y-2 pt-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-tertiary">{t('cashflow:settings.newCategory')}</p>
                        <div className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1 text-xs font-semibold text-secondary w-full sm:w-56">
                            <span>{t('cashflow:settings.parent')}</span>
                            <select value={parentId} onChange={e => setParentId(e.target.value)} className={`${field} w-full`}>
                                {parents.map(parent => <option key={parent.id} value={parent.id}>{labels.categoryName(parent.id)}</option>)}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-semibold text-secondary flex-1 min-w-[10rem]">
                            <span>{t('cashflow:settings.name')}</span>
                            <input ref={nameRef} type="text" value={name} maxLength={40} onChange={e => setName(e.target.value)} className={`${field} w-full`} />
                        </label>
                        <button type="submit" className={CASHFLOW_PRIMARY_BUTTON}>{t('cashflow:settings.add')}</button>
                        </div>
                    </form>
                    {error && <p className="text-sm text-negative" role="alert">{t(`cashflow:settings.errors.${error}`)}</p>}
                </section>

                <section className="space-y-3">
                    <h4 className={sectionTitle}>{t('cashflow:settings.rules')}</h4>
                    <p className="text-xs text-tertiary">{t('cashflow:settings.rulesHint')}</p>
                    {rules.length === 0 ? (
                        <p className="text-sm text-secondary">{t('cashflow:settings.noRules')}</p>
                    ) : (
                        <ul className="space-y-2">
                            {rules.map(rule => (
                                <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-subtle bg-subtle/40 text-sm">
                                    <span className="flex flex-wrap items-center gap-2 min-w-0">
                                        <span className="font-semibold text-primary">{t('cashflow:settings.ruleContains', { text: rule.labelContains })}</span>
                                        <span className="text-xs text-tertiary">{t(`cashflow:settings.ruleDirection.${rule.direction}`)}</span>
                                        <CategoryBadge categoryId={rule.categoryId} name={labels.categoryName(rule.categoryId)} customCategories={customCategories} />
                                        <span className="text-xs text-tertiary">{t(`cashflow:settings.ruleBy.${rule.source}`)}</span>
                                    </span>
                                    <DeleteInPlace
                                        label={t('cashflow:settings.deleteRule')}
                                        warning={t('cashflow:settings.deleteRuleConfirm', { text: rule.labelContains })}
                                        confirmLabel={t('cashflow:settings.delete')}
                                        onDelete={() => removeRule(rule.id)}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                    <form onSubmit={addRule} className="space-y-2 pt-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-tertiary">{t('cashflow:settings.newRule')}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)_auto] items-end gap-2">
                        <label className="flex flex-col gap-1 text-xs font-semibold text-secondary">
                            <span>{t('cashflow:settings.ruleText')}</span>
                            <input type="text" value={ruleText} maxLength={60} placeholder={t('cashflow:settings.ruleTextPlaceholder')} onChange={e => setRuleText(e.target.value)} className={`${field} w-full`} />
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-semibold text-secondary">
                            <span>{t('cashflow:settings.ruleDirectionLabel')}</span>
                            <select value={ruleDirection} onChange={e => setRuleDirection(e.target.value as RuleDirection)} className={`${field} w-full`}>
                                {(['out', 'in', 'any'] as const).map(value => <option key={value} value={value}>{t(`cashflow:settings.ruleDirection.${value}`)}</option>)}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-semibold text-secondary" htmlFor="rule-category">
                            <span>{t('cashflow:settings.ruleCategory')}</span>
                            <CategorySelect
                                id="rule-category"
                                value={ruleCategory}
                                onChange={setRuleCategory}
                                categories={categories}
                                labels={labels}
                                direction={ruleDirection === 'in' ? 'in' : 'out'}
                                emptyLabel={t('cashflow:settings.ruleCategoryPick')}
                            />
                        </label>
                        <button type="submit" className={CASHFLOW_PRIMARY_BUTTON}>{t('cashflow:settings.add')}</button>
                        </div>
                    </form>
                    {ruleError && <p className="text-sm text-negative" role="alert">{t(`cashflow:settings.errors.${ruleError}`)}</p>}
                </section>
                </div>
            </div>
        </div>,
        document.body,
    );
};
