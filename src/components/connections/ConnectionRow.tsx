import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CornerDownRight, RefreshCw, Trash2, Wallet } from 'lucide-react';
import Button from '../Button';
import type { ConnectionStatus, SafeConnection, SyncReport } from '../../types/connections';

export const STATUS_STYLE: Record<ConnectionStatus, string> = {
    ok: 'bg-positive-subtle text-positive',
    never_synced: 'bg-subtle text-secondary',
    error: 'bg-negative-subtle text-negative',
    auth_failed: 'bg-negative-subtle text-negative',
    rate_limited: 'bg-warning-subtle text-warning',
    needs_mapping: 'bg-warning-subtle text-warning',
    reauth_required: 'bg-warning-subtle text-warning',
};

export const useSyncDate = (): ((iso?: string) => string) => {
    const { i18n } = useTranslation();
    return (iso?: string): string =>
        iso ? new Date(iso).toLocaleString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
};

export const StatusBadge: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
    const { t } = useTranslation();
    return (
        <span className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${STATUS_STYLE[status]}`}>
            {t(`settings:connections.status.${status}`)}
        </span>
    );
};

/** How a connection is removed: with everything it recorded (default), or keeping its history (a bank, TGLA-254). */
export interface RemoveOptions {
    keepHistory?: boolean;
}

/**
 * Last sync, error, "Sync now" and remove of one connection. Removing asks once more in place: the bin becomes
 * "Confirm removal" where it stood, the other actions give way to what the removal deletes. A bank (`keepHistoryChoice`)
 * offers to keep what it recorded, first.
 */
export const SyncControls: React.FC<{
    connection: SafeConnection;
    syncing: boolean;
    disabled: boolean;
    onSync: () => void;
    onDelete: (options?: RemoveOptions) => void | Promise<void>;
    keepHistoryChoice?: boolean;
    children?: React.ReactNode;
}> = ({ connection, syncing, disabled, onSync, onDelete, keepHistoryChoice = false, children }) => {
    const { t } = useTranslation();
    const formatDate = useSyncDate();
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const remove = async (options?: RemoveOptions): Promise<void> => {
        setDeleting(true);
        try {
            await onDelete(options);
        } finally {
            setDeleting(false);
            setConfirming(false);
        }
    };
    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            {confirming ? (
                <p className="flex items-start gap-1.5 text-xs text-negative min-w-0 flex-1" role="alert">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                    {t(keepHistoryChoice ? 'settings:connections.banks.deleteWarning' : 'settings:connections.deleteWarning')}
                </p>
            ) : (
                <p className="text-xs text-secondary">
                    {t('settings:connections.lastSync', { date: formatDate(connection.lastSyncAt) })}
                    {connection.lastErrorCode && ` · ${t(`settings:connections.errors.${connection.lastErrorCode}`)}`}
                </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
                {confirming && keepHistoryChoice ? (
                    <>
                        <Button size="sm" variant="ghost" disabled={deleting} onClick={() => setConfirming(false)}>{t('common:buttons.cancel')}</Button>
                        <Button size="sm" variant="secondary" isLoading={deleting} disabled={deleting} onClick={() => void remove({ keepHistory: true })}>
                            {t('settings:connections.banks.keepHistory')}
                        </Button>
                        <Button size="sm" variant="danger" disabled={deleting} onClick={() => void remove({ keepHistory: false })}>
                            <Trash2 size={14} className="mr-1.5" aria-hidden="true" />
                            {t('settings:connections.banks.deleteAll')}
                        </Button>
                    </>
                ) : confirming ? (
                    <>
                        <Button size="sm" variant="ghost" disabled={deleting} onClick={() => setConfirming(false)}>{t('common:buttons.cancel')}</Button>
                        <Button size="sm" variant="danger" isLoading={deleting} disabled={deleting} onClick={() => void remove()}>
                            <Trash2 size={14} className="mr-1.5" aria-hidden="true" />
                            {t('settings:connections.confirmDelete')}
                        </Button>
                    </>
                ) : (
                    <>
                        {children}
                        <Button size="sm" variant="secondary" isLoading={syncing} disabled={disabled} onClick={onSync}>
                            <RefreshCw size={14} className="mr-1.5" aria-hidden="true" />
                            {t('settings:connections.syncNow')}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={disabled} aria-label={t('settings:connections.delete')} title={t('settings:connections.delete')}
                            onClick={() => setConfirming(true)}>
                            <Trash2 size={14} aria-hidden="true" />
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
};

/** The provider's accounts of a connection, each with the GlassFolio account it is recorded in. */
export const LinkedAccounts: React.FC<{
    accountMap: Record<string, string>;
    names: Record<string, string>;
    describeAccount: (accountId: string) => string;
}> = ({ accountMap, names, describeAccount }) => {
    const { t } = useTranslation();
    return (
        <ul className="divide-y divide-border border border-border rounded-lg" aria-label={t('settings:connections.syncedAccounts')}>
            {Object.entries(accountMap).map(([externalId, accountId]) => (
                <li key={externalId} className="flex items-center gap-3 px-3 py-2.5">
                    <Wallet size={16} className="text-tertiary shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-primary truncate">{names[externalId] ?? externalId}</p>
                        <p className="flex items-center gap-1 text-xs text-secondary min-w-0">
                            <CornerDownRight size={12} className="text-tertiary shrink-0" aria-hidden="true" />
                            <span className="truncate">{t('settings:connections.recordedInAccount', { account: describeAccount(accountId) })}</span>
                        </p>
                    </div>
                </li>
            ))}
        </ul>
    );
};

/**
 * What the last manual sync did: changes recorded, quantities that differ from the journal and, for bank operations,
 * what the bank changed, cancelled and announced, and why some could not be read.
 */
export const SyncResult: React.FC<{ report?: SyncReport }> = ({ report }) => {
    const { t } = useTranslation();
    if (!report) return null;
    const drift = report.accounts.flatMap(account => account.drift);
    const imported = report.accounts.reduce((total, account) => total + account.imported, 0);
    const banking = report.accounts.filter(account => account.upcoming !== undefined);
    const sum = (key: 'updated' | 'removed' | 'upcoming'): number => banking.reduce((total, account) => total + (account[key] ?? 0), 0);
    const warnings = [...new Set(report.accounts.flatMap(account => account.historyWarnings ?? []))];
    return (
        <>
            <p className="text-xs text-secondary mt-2" role="status">{t('settings:connections.result', { count: imported })}</p>
            {banking.length > 0 && (
                <p className="text-xs text-secondary mt-1">
                    {t('settings:connections.operationsResult', { updated: sum('updated'), removed: sum('removed'), upcoming: sum('upcoming') })}
                </p>
            )}
            {warnings.map(code => (
                <p key={code} className="flex items-start gap-1.5 text-xs text-warning mt-1">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
                    {t(`settings:connections.historyWarnings.${code}`, { defaultValue: t('settings:connections.historyWarnings.history_failed') })}
                </p>
            ))}
            {drift.length > 0 && (
                <div className="flex items-start gap-2 text-xs text-primary bg-warning-subtle rounded-lg p-2 mt-2">
                    <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{t('settings:connections.drift', { assets: drift.map(item => item.asset).join(', ') })}</span>
                </div>
            )}
        </>
    );
};
