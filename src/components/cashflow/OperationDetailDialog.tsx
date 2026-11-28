/**
 * Detail of one operation: label shown, note, exclusion, deletion; date, amount and account too for
 * operations imported from a file or typed by hand (synced ones follow the bank).
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import Button from '../Button';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { cashflowService } from '../../services/cashflow/cashflowService';
import type { CategoryOption } from '../../services/cashflow/cashflowCategoryService';
import type { CashflowOperation } from '../../types/cashflow';
import type { CashflowLabels } from './useCashflowLabels';
import { CategorySelect } from './ManualOperationDialog';
import { CASHFLOW_DANGER_BUTTON, CASHFLOW_DIALOG_BACKDROP, CASHFLOW_FIELD, CASHFLOW_PRIMARY_BUTTON, CASHFLOW_TEXTAREA } from './formStyles';

const field = `${CASHFLOW_FIELD} w-full`;

export const OperationDetailDialog: React.FC<{
    operation: CashflowOperation;
    accounts: { id: string; name: string; instituteName?: string }[];
    categories: CategoryOption[];
    labels: CashflowLabels;
    onClose: () => void;
    onChanged: () => void;
}> = ({ operation, accounts, categories, labels, onClose, onChanged }) => {
    const { t } = useTranslation();
    useEscapeKey(onClose);
    const [displayLabel, setDisplayLabel] = useState(operation.label);
    const [note, setNote] = useState(operation.note ?? '');
    const [excluded, setExcluded] = useState(operation.excluded);
    const [categoryId, setCategoryId] = useState(operation.categoryId);
    const [date, setDate] = useState(operation.date.slice(0, 10));
    const [amount, setAmount] = useState(String(operation.originalAmount));
    const [accountId, setAccountId] = useState(operation.accountId);
    const [error, setError] = useState<string | null>(null);

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        const value = Number.parseFloat(amount.replace(',', '.'));
        const result = await cashflowService.updateOperation(operation.id, {
            displayLabel: displayLabel.trim() === operation.label ? undefined : displayLabel,
            note,
            excluded,
            categoryId: categoryId === operation.categoryId && operation.categorySource !== 'override' ? undefined : categoryId,
            ...(operation.editable ? {
                date: date !== operation.date.slice(0, 10) ? date : undefined,
                amount: value !== operation.originalAmount ? value : undefined,
                accountId: accountId !== operation.accountId ? accountId : undefined,
            } : {}),
        });
        if (result.success === false) {
            setError(result.error);
            return;
        }
        onChanged();
        onClose();
    };

    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const remove = async () => {
        const result = await cashflowService.deleteOperation(operation.id);
        if (result.success === false) {
            setError(result.error);
            return;
        }
        onChanged();
        onClose();
    };

    if (typeof document === 'undefined') return null;
    return createPortal(
        <div className={CASHFLOW_DIALOG_BACKDROP}>
            <form role="dialog" aria-modal="true" aria-label={t('cashflow:operations.detail.title')} onSubmit={save} className="bg-card border border-subtle rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-subtle pb-3">
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-primary truncate">{operation.label}</h3>
                        <p className="text-sm font-bold tabular-nums text-secondary">{labels.money(operation.amount, 2)}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-subtle text-secondary" aria-label={t('cashflow:actions.close')}>
                        <X size={18} />
                    </button>
                </div>

                <dl className="grid grid-cols-3 gap-2 text-xs">
                    <dt className="text-tertiary">{t('cashflow:operations.detail.rawLabel')}</dt>
                    <dd className="col-span-2 text-primary break-words">{operation.rawLabel}</dd>
                    <dt className="text-tertiary">{t('cashflow:operations.detail.source')}</dt>
                    <dd className="col-span-2 text-primary">{t(`cashflow:operations.source.${operation.categorySource}`)}</dd>
                </dl>

                <label className="block space-y-1 text-xs font-semibold text-secondary" htmlFor="operation-category">
                    <span>{t('cashflow:operations.category')}</span>
                    <CategorySelect id="operation-category" value={categoryId} onChange={setCategoryId} categories={categories} labels={labels} direction={operation.direction} />
                </label>
                <label className="block space-y-1 text-xs font-semibold text-secondary">
                    <span>{t('cashflow:operations.detail.displayLabel')}</span>
                    <input type="text" value={displayLabel} maxLength={140} onChange={e => setDisplayLabel(e.target.value)} className={field} />
                </label>

                {operation.editable ? (
                    <div className="grid grid-cols-2 gap-3">
                        <label className="space-y-1 text-xs font-semibold text-secondary">
                            <span>{t('cashflow:operations.detail.date')}</span>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} />
                        </label>
                        <label className="space-y-1 text-xs font-semibold text-secondary">
                            <span>{t('cashflow:operations.detail.amount')} ({operation.currency})</span>
                            <input type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className={`${field} tabular-nums`} />
                        </label>
                        <label className="col-span-2 space-y-1 text-xs font-semibold text-secondary">
                            <span>{t('cashflow:operations.detail.account')}</span>
                            <select value={accountId} onChange={e => setAccountId(e.target.value)} className={field}>
                                {accounts.map(account => (
                                    <option key={account.id} value={account.id}>{account.instituteName ? `${account.instituteName} · ${account.name}` : account.name}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                ) : (
                    <p className="text-xs text-tertiary">{t('cashflow:operations.detail.synced')}</p>
                )}

                <label className="block space-y-1 text-xs font-semibold text-secondary">
                    <span>{t('cashflow:operations.detail.note')}</span>
                    <textarea value={note} maxLength={500} rows={2} onChange={e => setNote(e.target.value)} className={CASHFLOW_TEXTAREA} />
                </label>
                <label className="flex items-start gap-3 text-sm text-primary cursor-pointer">
                    <input type="checkbox" checked={excluded} onChange={e => setExcluded(e.target.checked)} className="mt-0.5 rounded border-subtle bg-subtle text-primary focus:ring-primary focus:border-primary" />
                    <span>
                        <span className="block font-semibold">{t('cashflow:operations.detail.excluded')}</span>
                        <span className="block text-xs text-tertiary">{t('cashflow:operations.detail.excludedHint')}</span>
                    </span>
                </label>

                {error && <p className="text-sm text-negative" role="alert">{t(`cashflow:manual.errors.${error}`)}</p>}

                {confirmingDelete ? (
                    // Confirmed in place, as everywhere in the app (never the browser's own dialog)
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                        <p className="flex items-start gap-1.5 text-xs text-negative flex-1 min-w-[12rem]" role="alert">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                            {t('cashflow:operations.detail.deleteConfirm')}
                        </p>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>{t('common:buttons.cancel')}</Button>
                        <Button size="sm" variant="danger" onClick={() => void remove()}>
                            <Trash2 size={14} className="mr-1.5" aria-hidden="true" />
                            {t('cashflow:operations.detail.delete')}
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-center justify-between gap-2 pt-2">
                        <button type="button" onClick={() => setConfirmingDelete(true)} className={CASHFLOW_DANGER_BUTTON}>
                            <Trash2 size={16} /> {t('cashflow:operations.detail.delete')}
                        </button>
                        <button type="submit" className={CASHFLOW_PRIMARY_BUTTON}>
                            {t('cashflow:operations.detail.save')}
                        </button>
                    </div>
                )}
            </form>
        </div>,
        document.body,
    );
};
