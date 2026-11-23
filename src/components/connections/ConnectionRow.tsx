import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import Button from '../Button';
import type { ConnectionStatus, SafeConnection, SyncReport } from '../../types/connections';

export const STATUS_STYLE: Record<ConnectionStatus, string> = {
    ok: 'bg-positive-subtle text-positive',
    never_synced: 'bg-subtle text-secondary',
    error: 'bg-negative-subtle text-negative',
    auth_failed: 'bg-negative-subtle text-negative',
    rate_limited: 'bg-warning-subtle text-warning',
    needs_mapping: 'bg-warning-subtle text-warning',
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

/** Last sync, error, "Sync now" and remove (with confirmation) of one connection. */
export const SyncControls: React.FC<{
    connection: SafeConnection;
    syncing: boolean;
    disabled: boolean;
    onSync: () => void;
    onDelete: () => void;
    children?: React.ReactNode;
}> = ({ connection, syncing, disabled, onSync, onDelete, children }) => {
    const { t } = useTranslation();
    const formatDate = useSyncDate();
    const [confirming, setConfirming] = useState(false);
    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-secondary">
                {t('settings:connections.lastSync', { date: formatDate(connection.lastSyncAt) })}
                {connection.lastErrorCode && ` · ${t(`settings:connections.errors.${connection.lastErrorCode}`)}`}
            </p>
            <div className="flex flex-wrap gap-2">
                {children}
                <Button size="sm" variant="secondary" isLoading={syncing} disabled={disabled} onClick={onSync}>
                    <RefreshCw size={14} className="mr-1.5" aria-hidden="true" />
                    {t('settings:connections.syncNow')}
                </Button>
                {confirming ? (
                    <>
                        <Button size="sm" variant="danger" onClick={onDelete}>{t('settings:connections.confirmDelete')}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>{t('common:buttons.cancel')}</Button>
                    </>
                ) : (
                    <Button size="sm" variant="ghost" aria-label={t('settings:connections.delete')} title={t('settings:connections.delete')}
                        onClick={() => setConfirming(true)}>
                        <Trash2 size={14} aria-hidden="true" />
                    </Button>
                )}
            </div>
        </div>
    );
};

/** What the last manual sync did: changes recorded and quantities that differ from the journal. */
export const SyncResult: React.FC<{ report?: SyncReport }> = ({ report }) => {
    const { t } = useTranslation();
    if (!report) return null;
    const drift = report.accounts.flatMap(account => account.drift);
    const imported = report.accounts.reduce((total, account) => total + account.imported, 0);
    return (
        <>
            <p className="text-xs text-secondary mt-2" role="status">{t('settings:connections.result', { count: imported })}</p>
            {drift.length > 0 && (
                <div className="flex items-start gap-2 text-xs text-primary bg-warning-subtle rounded-lg p-2 mt-2">
                    <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{t('settings:connections.drift', { assets: drift.map(item => item.asset).join(', ') })}</span>
                </div>
            )}
        </>
    );
};
