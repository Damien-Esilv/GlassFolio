import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AlertTriangle, Building2, Check, Link2, Pencil, Trash2, Wallet, X } from 'lucide-react';
import Button from '../Button';
import { useData } from '../../context/DataContext';
import { accountManagementService, type ManagedInstitution, type ManagementResult } from '../../services/accountManagementService';
import { fieldsToAccountKind } from '../../constants/accountKinds';
import { STAGGER_DELAY_MS } from '../../constants/animations';
import type { AccountType, WrapperType } from '../../types/types.backend';

const cardStyle = 'bg-card rounded-xl p-6 shadow-lg border border-border';
const inputClass = 'w-full px-3 py-1.5 rounded-lg text-sm bg-subtle text-primary border border-subtle focus:ring-primary focus:border-primary';

/** A name shown with a pencil; editing turns it into a field with Save / Cancel. */
const RenamableName: React.FC<{ name: string; label: string; className: string; onRename: (name: string) => Promise<ManagementResult> }> = ({ name, label, className, onRename }) => {
    const { t } = useTranslation();
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(name);
    const [saving, setSaving] = useState(false);
    if (!editing) {
        return (
            <span className="flex items-center gap-1.5 min-w-0">
                <span className={`${className} truncate`}>{name}</span>
                <button type="button" onClick={() => { setValue(name); setEditing(true); }} aria-label={t('settings:accounts.renameLabel', { name: label })}
                    title={t('settings:accounts.rename')} className="p-1 rounded text-tertiary hover:text-primary hover:bg-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <Pencil size={13} aria-hidden="true" />
                </button>
            </span>
        );
    }
    const save = async (): Promise<void> => {
        if (!value.trim()) return;
        setSaving(true);
        try {
            if ((await onRename(value)).success) setEditing(false);
        } finally {
            setSaving(false);
        }
    };
    return (
        <form className="flex items-center gap-2 min-w-0 flex-1" onSubmit={event => { event.preventDefault(); void save(); }}>
            <input autoFocus value={value} maxLength={80} aria-label={t('settings:accounts.newName')} onChange={event => setValue(event.target.value)}
                onKeyDown={event => { if (event.key === 'Escape') setEditing(false); }} className={`${inputClass} max-w-xs`} />
            <Button type="submit" size="sm" isLoading={saving} disabled={saving || !value.trim()} aria-label={t('common:buttons.save')}>
                <Check size={14} aria-hidden="true" />
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)} aria-label={t('common:buttons.cancel')}>
                <X size={14} aria-hidden="true" />
            </Button>
        </form>
    );
};

/** The bin, which turns into "Confirm deletion" in place with what will be deleted (same pattern as Connections). */
const DeleteInPlace: React.FC<{ label: string; warning: string; onDelete: () => Promise<void> }> = ({ label, warning, onDelete }) => {
    const { t } = useTranslation();
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);
    if (!confirming) {
        return (
            <Button size="sm" variant="ghost" aria-label={label} title={label} onClick={() => setConfirming(true)}>
                <Trash2 size={14} aria-hidden="true" />
            </Button>
        );
    }
    return (
        <div className="flex flex-wrap items-center justify-end gap-2 basis-full">
            <p className="flex items-start gap-1.5 text-xs text-negative flex-1 min-w-0" role="alert">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                {warning}
            </p>
            <Button size="sm" variant="ghost" disabled={deleting} onClick={() => setConfirming(false)}>{t('common:buttons.cancel')}</Button>
            <Button size="sm" variant="danger" isLoading={deleting} disabled={deleting}
                onClick={() => { setDeleting(true); void onDelete().finally(() => { setDeleting(false); setConfirming(false); }); }}>
                <Trash2 size={14} className="mr-1.5" aria-hidden="true" />
                {t('settings:accounts.confirmDelete')}
            </Button>
        </div>
    );
};

/**
 * Settings → Institutions & accounts: every institution and account, what feeds each one (a sync or the user's own
 * imports), renaming, and deleting with everything recorded in it. Synced accounts are removed from Connections.
 */
export const AccountsTab: React.FC = () => {
    const { t } = useTranslation();
    const { refreshData } = useData();
    const [institutions, setInstitutions] = useState<ManagedInstitution[] | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async (): Promise<void> => setInstitutions(await accountManagementService.listInstitutions()), []);
    useEffect(() => {
        void load();
    }, [load]);

    const apply = async (action: () => Promise<ManagementResult>, dataChanged: boolean): Promise<ManagementResult> => {
        setError('');
        const result = await action();
        if (!result.success) setError(t(`settings:accounts.errors.${result.error ?? 'not_found'}`));
        await load();
        if (dataChanged && result.success) await refreshData();
        return result;
    };

    return (
        <div className="space-y-6">
            <div className={`${cardStyle} animate-fade-in-up`}>
                <div className="flex items-start gap-3">
                    <Building2 size={20} className="text-brand shrink-0 mt-1" aria-hidden="true" />
                    <div>
                        <h3 className="text-lg font-semibold text-primary">{t('settings:accounts.title')}</h3>
                        <p className="text-sm text-secondary mt-1">{t('settings:accounts.description')}</p>
                    </div>
                </div>
                {error && <p role="alert" className="text-xs text-negative mt-3">{error}</p>}
            </div>

            {institutions !== null && institutions.length === 0 && (
                <div className={`${cardStyle} text-center animate-fade-in-up`}>
                    <p className="text-sm text-secondary">{t('settings:accounts.empty')}</p>
                    <Link to="/import" className="text-sm text-brand mt-2 inline-block">{t('settings:accounts.emptyAction')}</Link>
                </div>
            )}

            {institutions?.map((institution, index) => {
                const synced = institution.accounts.some(account => account.syncedBy !== null);
                const operations = institution.accounts.reduce((total, account) => total + account.operations, 0);
                return (
                    <section key={institution.id} aria-label={institution.name} className={`${cardStyle} space-y-4 animate-fade-in-up`}
                        style={{ animationDelay: `${(index + 1) * STAGGER_DELAY_MS}ms`, animationFillMode: 'both' }}>
                        <div className="flex flex-wrap items-center gap-3">
                            <Building2 size={18} className="text-brand shrink-0" aria-hidden="true" />
                            <div className="flex-1 min-w-0">
                                <RenamableName name={institution.name} label={institution.name} className="font-semibold text-primary"
                                    onRename={name => apply(() => accountManagementService.renameInstitution(institution.id, name), true)} />
                                <p className="text-xs text-tertiary">{t('settings:accounts.accountCount', { count: institution.accounts.length })}</p>
                            </div>
                            {synced ? (
                                <span className="text-xs text-tertiary">{t('settings:accounts.institutionSynced')}</span>
                            ) : (
                                <DeleteInPlace label={t('settings:accounts.deleteInstitution', { name: institution.name })}
                                    warning={t('settings:accounts.deleteInstitutionWarning', { count: institution.accounts.length, operations })}
                                    onDelete={async () => { await apply(() => accountManagementService.deleteInstitution(institution.id), true); }} />
                            )}
                        </div>

                        {institution.accounts.length > 0 && (
                            <ul className="divide-y divide-border border border-border rounded-lg">
                                {institution.accounts.map(account => (
                                    <li key={account.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                                        <Wallet size={16} className="text-tertiary shrink-0" aria-hidden="true" />
                                        <div className="flex-1 min-w-0">
                                            <RenamableName name={account.name} label={account.name} className="text-sm font-medium text-primary"
                                                onRename={name => apply(() => accountManagementService.renameAccount(account.id, name), true)} />
                                            <p className="text-xs text-secondary">
                                                {t(`transactions:importWizard.context.accountKinds.${fieldsToAccountKind(account.type as AccountType, account.wrapperType as WrapperType | undefined)}`)}
                                                {' · '}{account.currency}{' · '}{t('settings:accounts.operations', { count: account.operations })}
                                            </p>
                                        </div>
                                        {account.syncedBy ? (
                                            <Link to="/settings?tab=connections" title={t('settings:accounts.syncedHelp')}
                                                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-positive-subtle text-positive">
                                                <Link2 size={12} aria-hidden="true" />
                                                {t('settings:accounts.syncedBy', { source: account.syncedBy.label })}
                                            </Link>
                                        ) : (
                                            <>
                                                <span className="text-xs px-2 py-1 rounded-full bg-subtle text-secondary">{t('settings:accounts.manual')}</span>
                                                <DeleteInPlace label={t('settings:accounts.deleteAccount', { name: account.name })}
                                                    warning={t('settings:accounts.deleteAccountWarning', { count: account.operations })}
                                                    onDelete={async () => { await apply(() => accountManagementService.deleteAccount(account.id), true); }} />
                                            </>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                );
            })}
        </div>
    );
};
