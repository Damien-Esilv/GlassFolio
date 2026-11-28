import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bitcoin, Link2, ShieldCheck, Wallet } from 'lucide-react';
import Button from '../Button';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { accountService, instituteService } from '../../services/instituteService';
import { connectionService, isBitcoinWalletEntry, isEvmAddress, isSolanaAddress, syncEngine, WALLET_ACCOUNT_ID, type SyncOptions } from '../../services/connectors';
import { notifySyncOutcome } from '../../services/connectors/syncNotifications';
import { SnapTradeConnectCard } from './SnapTradeConnectCard';
import { BankConnectCard } from './BankConnectCard';
import { StatusBadge, SyncControls, SyncResult, type RemoveOptions } from './ConnectionRow';
import { accountLabel, toAccountChoices } from './accountChoices';
import type { Account, Institute } from '../../types';
import type { SafeConnection, SourceId, SyncReport } from '../../types/connections';

type WalletChain = 'bitcoin' | 'evm' | 'solana';

/** Watch-only wallet kinds: the source each one creates and how its entries are checked. */
const WALLET_CHAINS: Record<WalletChain, { sourceId: SourceId; isValid: (entry: string) => boolean }> = {
    bitcoin: { sourceId: 'wallet_btc', isValid: isBitcoinWalletEntry },
    evm: { sourceId: 'wallet_evm', isValid: isEvmAddress },
    solana: { sourceId: 'wallet_sol', isValid: isSolanaAddress },
};

const NEW_ACCOUNT = '__new__';
const inputClass = 'w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5';
const cardStyle = 'bg-card rounded-xl p-6 shadow-lg border border-border';

/** One line high, growing with what is pasted (a long xpub or several addresses). */
const AutoGrowTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = props => {
    const ref = useRef<HTMLTextAreaElement>(null);
    const fit = useCallback((): void => {
        const element = ref.current;
        if (!element) return;
        element.style.height = 'auto';
        element.style.height = `${element.scrollHeight}px`;
    }, []);
    useLayoutEffect(fit, [props.value, fit]);
    // A narrower field wraps the same text on more lines (window resized, phone turned)
    useEffect(() => {
        const element = ref.current;
        if (!element || typeof ResizeObserver === 'undefined') return undefined;
        let width = element.clientWidth;
        const observer = new ResizeObserver(() => {
            if (element.clientWidth === width) return;
            width = element.clientWidth;
            fit();
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [fit]);
    return <textarea ref={ref} rows={1} {...props} />;
};

/** Settings → Connections (TGLA-221, TGLA-235, TGLA-237): SnapTrade for brokers, French banks through Woob, watch-only wallets. */
export const ConnectionsTab: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { refreshData } = useData();
    const [connections, setConnections] = useState<SafeConnection[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [institutes, setInstitutes] = useState<Institute[]>([]);
    const [reports, setReports] = useState<Record<string, SyncReport>>({});
    const [syncing, setSyncing] = useState<string | null>(null);

    const [chain, setChain] = useState<WalletChain>('bitcoin');
    const [label, setLabel] = useState('');
    const [addresses, setAddresses] = useState('');
    const [target, setTarget] = useState(NEW_ACCOUNT);
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        const [list, allAccounts, allInstitutes] = await Promise.all([
            connectionService.listConnections(), accountService.getAccounts(), instituteService.getInstitutes(),
        ]);
        setConnections(list);
        setAccounts(allAccounts);
        setInstitutes(allInstitutes);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const instituteById = useMemo(() => new Map(institutes.map(institute => [institute.id, institute])), [institutes]);
    const accountById = useMemo(() => new Map(accounts.map(account => [account.id, account])), [accounts]);
    const allChoices = useMemo(() => toAccountChoices(accounts, instituteById), [accounts, instituteById]);
    const cryptoChoices = useMemo(
        () => toAccountChoices(accounts.filter(account => account.type.startsWith('crypto')), instituteById),
        [accounts, instituteById]
    );
    const describeAccount = useCallback((accountId: string): string => {
        const account = accountById.get(accountId);
        return account ? accountLabel(account, instituteById) : t('settings:connections.accountMissing');
    }, [accountById, instituteById, t]);

    const snaptrade = connections.find(connection => connection.sourceId === 'snaptrade') ?? null;
    const banks = connections.filter(connection => connection.sourceId === 'woob');
    const wallets = connections.filter(connection => connection.sourceId !== 'snaptrade' && connection.sourceId !== 'woob');

    const runSync = async (connection: SafeConnection, options: SyncOptions = {}): Promise<void> => {
        setSyncing(connection.id);
        try {
            const report = await syncEngine.runSync(connection.id, options);
            notifySyncOutcome(connection, report);
            setReports(previous => ({ ...previous, [connection.id]: report }));
            if (report.accounts.some(account => account.imported > 0)) await refreshData();
            await load();
        } finally {
            setSyncing(null);
        }
    };

    /**
     * A source just added or changed: show it, then sync it at once. A bank just connected or reconnected also reads
     * the deep history of its checking and savings accounts: its session is fresh (TGLA-254).
     */
    const syncChanged = async (connectionId: string): Promise<void> => {
        await load();
        const changed = await connectionService.getConnection(connectionId);
        if (changed) await runSync(changed, { deepHistory: true });
    };

    /** Removes a source with everything it imported (its operations, and its accounts left empty), or only the source. */
    const remove = async (id: string, options: RemoveOptions = {}): Promise<void> => {
        await syncEngine.removeConnection(id, options);
        await load();
        await refreshData();
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
            await syncChanged(connection.id);
        } catch {
            setFormError(t('settings:connections.form.errors.generic'));
        } finally {
            setSaving(false);
        }
    };

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
                <div className="flex items-start gap-2 text-xs text-secondary bg-subtle border border-subtle rounded-lg p-3">
                    <ShieldCheck size={16} className="text-positive shrink-0" aria-hidden="true" />
                    <span>{t('settings:connections.privacyNote')}</span>
                </div>
            </div>

            <SnapTradeConnectCard
                connection={snaptrade}
                accountChoices={allChoices}
                describeAccount={describeAccount}
                report={snaptrade ? reports[snaptrade.id] : undefined}
                syncing={snaptrade !== null && syncing === snaptrade.id}
                busy={syncing !== null}
                onSync={runSync}
                onDelete={remove}
                onChanged={syncChanged}
            />

            <BankConnectCard
                connections={banks}
                accountChoices={allChoices}
                describeAccount={describeAccount}
                reports={reports}
                syncing={syncing}
                onSync={runSync}
                onDelete={remove}
                onChanged={syncChanged}
            />

            <div className={cardStyle}>
                <div className="flex items-start gap-3">
                    <Wallet size={20} className="text-brand shrink-0 mt-1" aria-hidden="true" />
                    <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-primary">{t('settings:connections.form.title')}</h3>
                        <p className="text-sm text-secondary mt-1">{t('settings:connections.form.description')}</p>
                    </div>
                </div>
                <form onSubmit={event => void addWallet(event)} className="space-y-4 mt-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    </div>
                    <div>
                        <label htmlFor="connection-addresses" className="block text-xs font-medium text-secondary mb-1.5">
                            {t('settings:connections.form.addresses')}
                        </label>
                        <AutoGrowTextarea id="connection-addresses" value={addresses} onChange={event => setAddresses(event.target.value)}
                            placeholder={t(`settings:connections.form.addressesPlaceholder.${chain}`)} spellCheck={false}
                            className={`${inputClass} font-mono text-xs resize-none overflow-hidden break-all`} />
                        <p className="text-xs text-tertiary mt-1">{t(`settings:connections.form.addressesHelp.${chain}`)}</p>
                    </div>
                    <div>
                        <label htmlFor="connection-account" className="block text-xs font-medium text-secondary mb-1.5">
                            {t('settings:connections.form.account')}
                        </label>
                        <select id="connection-account" value={target} onChange={event => setTarget(event.target.value)} className={inputClass}>
                            <option value={NEW_ACCOUNT}>
                                {label.trim()
                                    ? t('settings:connections.form.newAccountNamed', { name: label.trim() })
                                    : t('settings:connections.form.newAccount')}
                            </option>
                            {cryptoChoices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
                        </select>
                        <p className="text-xs text-tertiary mt-1">{t('settings:connections.form.accountHelp')}</p>
                    </div>
                    {formError && <p role="alert" className="text-xs text-negative">{formError}</p>}
                    <Button type="submit" isLoading={saving} disabled={saving}>
                        {t('settings:connections.form.submit')}
                    </Button>
                </form>

                <h4 className="text-sm font-semibold text-primary mt-6 mb-2">{t('settings:connections.wallets.title')}</h4>
                {wallets.length === 0 ? (
                    <p className="text-sm text-tertiary">{t('settings:connections.wallets.empty')}</p>
                ) : (
                    <ul className="space-y-3">
                        {wallets.map(connection => (
                            <li key={connection.id} className="border border-border rounded-lg p-4">
                                <div className="flex items-center gap-3">
                                    {connection.sourceId === 'wallet_btc'
                                        ? <Bitcoin size={20} className="text-brand shrink-0" aria-hidden="true" />
                                        : <Wallet size={20} className="text-brand shrink-0" aria-hidden="true" />}
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-primary truncate">{connection.label}</p>
                                        <p className="text-xs text-tertiary">
                                            {t(`settings:connections.sources.${connection.sourceId}`)}
                                            {' · '}
                                            {t('settings:connections.recordedIn', {
                                                account: Object.values(connection.accountMap).map(describeAccount).join(', ')
                                                    || t('settings:connections.accountMissing'),
                                            })}
                                        </p>
                                        {(connection.publicParams.addresses ?? []).length > 0 && (
                                            <p className="text-xs text-tertiary font-mono truncate mt-0.5" title={(connection.publicParams.addresses ?? []).join('\n')}>
                                                {(connection.publicParams.addresses ?? []).join(', ')}
                                            </p>
                                        )}
                                    </div>
                                    <StatusBadge status={connection.lastStatus} />
                                </div>
                                <div className="mt-3">
                                    <SyncControls connection={connection} syncing={syncing === connection.id} disabled={syncing !== null}
                                        onSync={() => void runSync(connection)} onDelete={() => void remove(connection.id)} />
                                </div>
                                <SyncResult report={reports[connection.id]} />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};
