/**
 * "Add an operation": an operation typed by hand in a checking or savings account (TGLA-253 uses
 * the same service for the import page).
 */
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { cashflowService } from '../../services/cashflow/cashflowService';
import type { CategoryOption } from '../../services/cashflow/cashflowCategoryService';
import type { CashflowLabels } from './useCashflowLabels';
import { CASHFLOW_DIALOG_BACKDROP, CASHFLOW_FIELD, CASHFLOW_GHOST_BUTTON, CASHFLOW_PRIMARY_BUTTON, CASHFLOW_TEXTAREA } from './formStyles';

interface AccountOption {
    id: string;
    name: string;
    instituteName?: string;
    currency: string;
}

const field = `${CASHFLOW_FIELD} w-full`;

/** Category picker grouped by kind (shared with the operation detail). */
export const CategorySelect: React.FC<{
    id: string;
    value: string;
    onChange: (value: string) => void;
    categories: CategoryOption[];
    labels: CashflowLabels;
    direction?: 'in' | 'out';
    emptyLabel?: string;
    /** Field classes: the full width of a form by default. */
    className?: string;
}> = ({ id, value, onChange, categories, labels, direction, emptyLabel, className = field }) => {
    const { t } = useTranslation();
    const kinds = direction === 'in' ? ['income', 'transfer', 'savings', 'expense'] : ['expense', 'savings', 'transfer', 'income'];
    return (
        <select id={id} value={value} onChange={e => onChange(e.target.value)} className={className}>
            {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
            {kinds.map(kind => (
                <optgroup key={kind} label={t(`cashflow:kinds.${kind}`)}>
                    {categories.filter(c => c.kind === kind).map(c => (
                        <option key={c.id} value={c.id}>
                            {c.parentId ? `· ${labels.categoryName(c.id)}` : labels.categoryName(c.id)}
                        </option>
                    ))}
                </optgroup>
            ))}
        </select>
    );
};

export const ManualOperationDialog: React.FC<{
    accounts: AccountOption[];
    categories: CategoryOption[];
    labels: CashflowLabels;
    onClose: () => void;
    onSaved: () => void;
}> = ({ accounts, categories, labels, onClose, onSaved }) => {
    const { t } = useTranslation();
    useEscapeKey(onClose);
    const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
    const [date, setDate] = useState(today);
    const [label, setLabel] = useState('');
    const [amount, setAmount] = useState('');
    const [direction, setDirection] = useState<'in' | 'out'>('out');
    const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
    const [categoryId, setCategoryId] = useState('');
    const [note, setNote] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const value = Number.parseFloat(amount.replace(',', '.'));
        setSaving(true);
        setError(null);
        const result = await cashflowService.recordManualOperation({
            accountId,
            date,
            amount: direction === 'out' ? -Math.abs(value) : Math.abs(value),
            label,
            categoryId: categoryId || undefined,
            note: note || undefined,
        });
        setSaving(false);
        if (result.success === false) setError(result.error);
        else onSaved();
    };

    if (typeof document === 'undefined') return null;
    return createPortal(
        <div className={CASHFLOW_DIALOG_BACKDROP}>
            <form
                role="dialog"
                aria-modal="true"
                aria-label={t('cashflow:manual.title')}
                onSubmit={submit}
                className="bg-card border border-subtle rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4"
            >
                <div className="flex items-center justify-between border-b border-subtle pb-3">
                    <h3 className="text-lg font-bold text-primary">{t('cashflow:manual.title')}</h3>
                    <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-subtle text-secondary" aria-label={t('cashflow:actions.close')}>
                        <X size={18} />
                    </button>
                </div>
                {accounts.length === 0 ? (
                    <p className="text-sm text-secondary">{t('cashflow:manual.noAccount')}</p>
                ) : (
                    <>
                        <div className="flex gap-1 bg-subtle p-1 rounded-xl" role="group">
                            {(['out', 'in'] as const).map(option => (
                                <button
                                    key={option}
                                    type="button"
                                    aria-pressed={direction === option}
                                    onClick={() => setDirection(option)}
                                    className={`flex-1 h-9 px-3 rounded-lg text-sm font-bold ${direction === option ? 'bg-card text-brand shadow-sm border border-subtle' : 'text-secondary'}`}
                                >
                                    {t(`cashflow:manual.direction.${option}`)}
                                </button>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="space-y-1 text-xs font-semibold text-secondary">
                                <span>{t('cashflow:manual.date')}</span>
                                <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} className={field} required />
                            </label>
                            <label className="space-y-1 text-xs font-semibold text-secondary">
                                <span>{t('cashflow:manual.amount')}</span>
                                <input type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className={`${field} tabular-nums`} required />
                            </label>
                        </div>
                        <label className="block space-y-1 text-xs font-semibold text-secondary">
                            <span>{t('cashflow:manual.label')}</span>
                            <input type="text" value={label} maxLength={140} placeholder={t('cashflow:manual.labelPlaceholder')} onChange={e => setLabel(e.target.value)} className={field} required />
                        </label>
                        <label className="block space-y-1 text-xs font-semibold text-secondary">
                            <span>{t('cashflow:manual.account')}</span>
                            <select value={accountId} onChange={e => setAccountId(e.target.value)} className={field}>
                                {accounts.map(account => (
                                    <option key={account.id} value={account.id}>
                                        {account.instituteName ? `${account.instituteName} · ${account.name}` : account.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block space-y-1 text-xs font-semibold text-secondary" htmlFor="manual-category">
                            <span>{t('cashflow:manual.category')}</span>
                            <CategorySelect
                                id="manual-category"
                                value={categoryId}
                                onChange={setCategoryId}
                                categories={categories}
                                labels={labels}
                                direction={direction}
                                emptyLabel={t('cashflow:manual.automatic')}
                            />
                            {!categoryId && <span className="block font-normal text-tertiary">{t('cashflow:manual.automaticHint')}</span>}
                        </label>
                        <label className="block space-y-1 text-xs font-semibold text-secondary">
                            <span>{t('cashflow:manual.note')}</span>
                            <textarea value={note} maxLength={500} rows={2} onChange={e => setNote(e.target.value)} className={CASHFLOW_TEXTAREA} />
                        </label>
                        {error && <p className="text-sm text-negative" role="alert">{t(`cashflow:manual.errors.${error}`)}</p>}
                    </>
                )}
                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className={CASHFLOW_GHOST_BUTTON}>
                        {t('cashflow:manual.cancel')}
                    </button>
                    {accounts.length > 0 && (
                        <button type="submit" disabled={saving} className={CASHFLOW_PRIMARY_BUTTON}>
                            {t('cashflow:manual.save')}
                        </button>
                    )}
                </div>
            </form>
        </div>,
        document.body,
    );
};
