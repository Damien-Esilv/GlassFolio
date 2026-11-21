import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bitcoin, Briefcase, Link2, RefreshCw, ShieldCheck, Trash2, AlertTriangle, Wallet } from 'lucide-react';
import Button from '../Button';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { accountService, instituteService } from '../../services/instituteService';
import { connectionService, isBitcoinWalletEntry, isEvmAddress, isSolanaAddress, syncEngine, WALLET_ACCOUNT_ID } from '../../services/connectors';
import { notifySyncOutcome } from '../../services/connectors/syncNotifications';
import { SnapTradeConnectCard } from './SnapTradeConnectCard';
import type { Account } from '../../types';
import type { ConnectionStatus, SafeConnection, SourceId, SyncReport } from '../../types/connections';

type WalletChain = 'bitcoin' | 'evm' | 'solana';

/** Watch-only wallet kinds: the source each one creates and how its entries are checked. */
const WALLET_CHAINS: Record<WalletChain, { sourceId: SourceId; isValid: (entry: string) => boolean }> = {
    bitcoin: { sourceId: 'wallet_btc', isValid: isBitcoinWalletEntry },
    evm: { sourceId: 'wallet_evm', isValid: isEvmAddress },
    solana: { sourceId: 'wallet_sol', isValid: isSolanaAddress },
};

const STATUS_STYLE: Record<ConnectionStatus, string> = {
    ok: 'bg-positive-subtle text-positive',
    never_synced: 'bg-subtle text-secondary',
    error: 'bg-negative-subtle text-negative',
    auth_failed: 'bg-negative-subtle text-negative',
    rate_limited: 'bg-warning-subtle text-warning',
    needs_mapping: 'bg-warning-subtle text-warning',
};

const NEW_ACCOUNT = '__new__';
const inputClass = 'w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5';

/** Settings → Connections (TGLA-221): the automatic sync sources and their last result. */
export const ConnectionsTab: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { user } = useAuth();
    const { refreshData } = useData();
    const [connections, setConnections] = useState<SafeConnection[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [reports, setReports] = useState<Record<string, SyncReport>>({});
    const [syncing, setSyncing] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const [chain, setChain] = useState<WalletChain>('bitcoin');
    const [label, setLabel] = useState('');
    const [addresses, setAddresses] = useState('');
    const [target, setTarget] = useState(NEW_ACCOUNT);
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        const [list, allAccounts] = await Promise.all([connectionService.listConnections(), accountService.getAccounts()]);
        setConnections(list);
        setAccounts(allAccounts);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const accountName = useMemo(() => new Map(accounts.map(account => [account.id, account.name])), [accounts]);
    const cryptoAccounts = useMemo(() => accounts.filter(account => account.type.startsWith('crypto')), [accounts]);

    const formatDate = (iso?: string): string =>
        iso ? new Date(iso).toLocaleString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

    const runSync = async (connection: SafeConnection): Promise<void> => {
        setSyncing(connection.id);
        try {
            const report = await syncEngine.runSync(connection.id);
            notifySyncOutcome(connection, report);
            setReports(previous => ({ ...previous, [connection.id]: report }));
            if (report.accounts.some(account => account.imported > 0)) await refreshData();
            await load();
        } finally {
            setSyncing(null);
        }
    };

    /** First sync of a source just added from a card (SnapTrade). */
    const syncNewConnection = async (connectionId: string): Promise<void> => {
        await load();
        const created = await connectionService.getConnection(connectionId);
        if (created) await runSync(created);
    };

    const remove = async (id: string): Promise<void> => {
        await connectionService.deleteConnection(id);
        setConfirmDelete(null);
        await load();
    };

    const addWallet = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();
        setFormError('');
        const list: string[] = Array.from(new Set<string>(addresses.split(/[\s,;]+/).map(value => value.trim()).filter(value => value.length > 0)));
        if (!label.trim()) return setFormError(t('settings:connections.form.errors.label'));
        if (list.length === 0 || !list.every(WALLET_CHAINS[chain].isValid)) return setFormError(t(`settings:connections.form.errors.addresses.${chain}`));

        setSaving(true);
        try {
            let accountId = target;
            if (target === NEW_ACCOUNT) {
                const institute = await instituteService.createInstitute({ name: label.trim(), type: 'wallet' });
                const account = await accountService.createAccount({
                    instituteId: institute.id,
                    name: label.trim(),
                    type: 'crypto_spot',
                    defaultCurrency: user?.preferences?.currency || 'EUR',
                });
                accountId = account.id;
            }
            const connection = await connectionService.createConnection({
                sourceId: WALLET_CHAINS[chain].sourceId,
                label: label.trim(),
                publicParams: { addresses: list },
                accountMap: { [WALLET_ACCOUNT_ID]: accountId },
            });
            setLabel('');
            setAddresses('');
            setTarget(NEW_ACCOUNT);
            await load();
            await runSync(connection);
        } catch {
            setFormError(t('settings:connections.form.errors.generic'));
        } finally {
            setSaving(false);
        }
    };

    const cardStyle = 'bg-card rounded-xl p-6 shadow-lg border border-border';

    return (
        <div className="space-y-6">
            <div className={cardStyle}>
                <div className="flex items-start gap-3 mb-5">
                    <Link2 size={22} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                        <h2 className="text-xl font-semibold text-primary">{t('settings:connections.title')}</h2>
                        <p className="text-sm text-secondary mt-1">{t('settings:connections.subtitle')}</p>
                    </div>
                </div>
                <div className="flex items-start gap-2 text-xs text-secondary bg-subtle border border-subtle rounded-lg p-3 mb-5">
                    <ShieldCheck size={16} className="text-positive shrink-0" aria-hidden="true" />
                    <span>{t('settings:connections.privacyNote')}</span>
                </div>

                {connections.length === 0 ? (
                    <p className="text-sm text-tertiary">{t('settings:connections.empty')}</p>
                ) : (
                    <ul className="space-y-3">
                        {connections.map(connection => {
                            const report = reports[connection.id];
                            const drift = report?.accounts.flatMap(account => account.drift) ?? [];
                            const imported = report?.accounts.reduce((total, account) => total + account.imported, 0) ?? 0;
                            return (
                                <li key={connection.id} className="border border-border rounded-lg p-4">
                                    <div className="flex flex-wrap items-center gap-3">
                                        {connection.sourceId === 'wallet_btc' && <Bitcoin size={20} className="text-brand shrink-0" aria-hidden="true" />}
                                        {connection.sourceId === 'snaptrade' && <Briefcase size={20} className="text-brand shrink-0" aria-hidden="true" />}
                                        {(connection.sourceId === 'wallet_evm' || connection.sourceId === 'wallet_sol') && (
                                            <Wallet size={20} className="text-brand shrink-0" aria-hidden="true" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium text-primary truncate">{connection.label}</p>
                                            <p className="text-xs text-tertiary">
                                                {t(`settings:connections.sources.${connection.sourceId}`)}
                                                {' · '}
                                                {Object.values(connection.accountMap).map(id => accountName.get(id) ?? t('settings:connections.accountMissing')).join(', ')
                                                    || t('settings:connections.accountMissing')}
                                            </p>
                                        </div>
                                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_STYLE[connection.lastStatus]}`}>
                                            {t(`settings:connections.status.${connection.lastStatus}`)}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                                        <p className="text-xs text-secondary">
                                            {t('settings:connections.lastSync', { date: formatDate(connection.lastSyncAt) })}
                                            {connection.lastErrorCode && ` · ${t(`settings:connections.errors.${connection.lastErrorCode}`)}`}
                                        </p>
                                        <div className="flex gap-2">
                                            <Button size="sm" variant="secondary" isLoading={syncing === connection.id} disabled={syncing !== null}
                                                onClick={() => void runSync(connection)}>
                                                <RefreshCw size={14} className="mr-1.5" aria-hidden="true" />
                                                {t('settings:connections.syncNow')}
                                            </Button>
                                            {confirmDelete === connection.id ? (
                                                <Button size="sm" variant="danger" onClick={() => void remove(connection.id)}>
                                                    {t('settings:connections.confirmDelete')}
                                                </Button>
                                            ) : (
                                                <Button size="sm" variant="ghost" aria-label={t('settings:connections.delete')}
                                                    onClick={() => setConfirmDelete(connection.id)}>
                                                    <Trash2 size={14} aria-hidden="true" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    {report && (
                                        <p className="text-xs text-secondary mt-2" role="status">
                                            {t('settings:connections.result', { count: imported })}
                                        </p>
                                    )}
                                    {drift.length > 0 && (
                                        <div className="flex items-start gap-2 text-xs text-primary bg-warning-subtle rounded-lg p-2 mt-2">
                                            <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
                                            <span>{t('settings:connections.drift', { assets: drift.map(item => item.asset).join(', ') })}</span>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <SnapTradeConnectCard accounts={accounts} onConnected={syncNewConnection} />

            <div className={cardStyle}>
                <h3 className="text-lg font-semibold text-primary">{t('settings:connections.form.title')}</h3>
                <p className="text-sm text-secondary mt-1 mb-4">{t('settings:connections.form.description')}</p>
                <form onSubmit={event => void addWallet(event)} className="space-y-4">
                    <div>
                        <label htmlFor="connection-chain" className="block text-xs font-medium text-secondary mb-1.5">
                            {t('settings:connections.form.chain')}
                        </label>
                        <select id="connection-chain" value={chain} onChange={event => setChain(event.target.value as WalletChain)} className={inputClass}>
                            {(Object.keys(WALLET_CHAINS) as WalletChain[]).map(key => (
                                <option key={key} value={key}>{t(`settings:connections.form.chains.${key}`)}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="connection-label" className="block text-xs font-medium text-secondary mb-1.5">
                            {t('settings:connections.form.label')}
                        </label>
                        <input id="connection-label" type="text" value={label} onChange={event => setLabel(event.target.value)}
                            placeholder={t('settings:connections.form.labelPlaceholder')} className={inputClass} />
                    </div>
                    <div>
                        <label htmlFor="connection-addresses" className="block text-xs font-medium text-secondary mb-1.5">
                            {t('settings:connections.form.addresses')}
                        </label>
                        <textarea id="connection-addresses" rows={3} value={addresses} onChange={event => setAddresses(event.target.value)}
                            placeholder={t(`settings:connections.form.addressesPlaceholder.${chain}`)} spellCheck={false}
                            className={`${inputClass} font-mono text-xs`} />
                        <p className="text-xs text-tertiary mt-1">{t(`settings:connections.form.addressesHelp.${chain}`)}</p>
                    </div>
                    <div>
                        <label htmlFor="connection-account" className="block text-xs font-medium text-secondary mb-1.5">
                            {t('settings:connections.form.account')}
                        </label>
                        <select id="connection-account" value={target} onChange={event => setTarget(event.target.value)} className={inputClass}>
                            <option value={NEW_ACCOUNT}>{t('settings:connections.form.newAccount')}</option>
                            {cryptoAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                        </select>
                    </div>
                    {formError && <p role="alert" className="text-xs text-negative">{formError}</p>}
                    <Button type="submit" isLoading={saving} disabled={saving}>
                        {t('settings:connections.form.submit')}
                    </Button>
                </form>
                <p className="text-xs text-tertiary mt-4">{t('settings:connections.comingSoon')}</p>
            </div>
        </div>
    );
};
