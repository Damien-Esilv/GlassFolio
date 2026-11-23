import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Briefcase, CheckCircle2, ExternalLink, Settings2 } from 'lucide-react';
import Button from '../Button';
import { useAuth } from '../../context/AuthContext';
import { accountService, instituteService } from '../../services/instituteService';
import { connectionService, ConnectorError, sourceRegistry, syncEngine } from '../../services/connectors';
import { StatusBadge, SyncControls, SyncResult } from './ConnectionRow';
import type { AccountChoice } from './accountChoices';
import type { ConnectionCursor, ExternalAccount, SafeConnection, SyncReport } from '../../types/connections';

const NEW_ACCOUNT = '__new__';
const SKIP = '__skip__';
const SNAPTRADE_PERSONAL_URL = 'https://snaptrade.com/personal-investing';
const inputClass = 'w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5';

interface Mapping { target: string; startDate: string }

interface Props {
    /** The SnapTrade connection, once linked (one SnapTrade account covers every broker). */
    connection: SafeConnection | null;
    accountChoices: AccountChoice[];
    describeAccount: (accountId: string) => string;
    report?: SyncReport;
    syncing: boolean;
    busy: boolean;
    onSync: (connection: SafeConnection) => Promise<void>;
    onDelete: (connectionId: string) => Promise<void>;
    /** A connection was created or its accounts changed: reload, then sync it. */
    onChanged: (connectionId: string) => Promise<void>;
}

const errorKey = (caught: unknown): string =>
    `settings:connections.errors.${caught instanceof ConnectorError ? caught.code : 'unknown'}`;

/** Broker account → GlassFolio account, with the date to import from (shared by the first link and "Manage"). */
const MappingEditor: React.FC<{
    external: ExternalAccount[];
    mappings: Record<string, Mapping>;
    accountChoices: AccountChoice[];
    onChange: (externalId: string, patch: Partial<Mapping>) => void;
}> = ({ external, mappings, accountChoices, onChange }) => {
    const { t } = useTranslation();
    return (
        <ul className="space-y-3">
            {external.map(account => {
                const mapping = mappings[account.externalId];
                return (
                    <li key={account.externalId} className="border border-border rounded-lg p-3 space-y-2">
                        <p className="text-sm font-medium text-primary">{account.name}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-medium text-secondary mb-1" htmlFor={`snaptrade-target-${account.externalId}`}>
                                    {t('settings:connections.form.account')}
                                </label>
                                <select id={`snaptrade-target-${account.externalId}`} value={mapping?.target ?? NEW_ACCOUNT}
                                    onChange={event => onChange(account.externalId, { target: event.target.value })} className={inputClass}>
                                    <option value={NEW_ACCOUNT}>{t('settings:connections.form.newAccountNamed', { name: account.name })}</option>
                                    {accountChoices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
                                    <option value={SKIP}>{t('settings:connections.snaptrade.skip')}</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-secondary mb-1" htmlFor={`snaptrade-start-${account.externalId}`}>
                                    {t('settings:connections.snaptrade.startDate')}
                                </label>
                                <input id={`snaptrade-start-${account.externalId}`} type="date" value={mapping?.startDate ?? ''}
                                    disabled={mapping?.target === SKIP}
                                    onChange={event => onChange(account.externalId, { startDate: event.target.value })} className={inputClass} />
                            </div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
};

/** Settings → Connections: link SnapTrade Personal once, then see and manage the synced broker accounts (TGLA-221, TGLA-235). */
export const SnapTradeConnectCard: React.FC<Props> = ({
    connection, accountChoices, describeAccount, report, syncing, busy, onSync, onDelete, onChanged,
}) => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [clientId, setClientId] = useState('');
    const [consumerKey, setConsumerKey] = useState('');
    const [external, setExternal] = useState<ExternalAccount[] | null>(null);
    const [mappings, setMappings] = useState<Record<string, Mapping>>({});
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');

    const credentials = (): Record<string, string> => ({ clientId: clientId.trim(), consumerKey: consumerKey.trim() });

    /** Shows the mapping step for the accounts the provider lists, keeping the current choices of a linked connection. */
    const openMapping = (list: ExternalAccount[]): void => {
        setExternal(list);
        setMappings(Object.fromEntries(list.map(account => {
            const current = connection?.accountMap[account.externalId];
            return [account.externalId, { target: current ?? (connection ? SKIP : NEW_ACCOUNT), startDate: '' }];
        })));
        if (list.length === 0) setError(t('settings:connections.snaptrade.errors.noAccounts'));
    };

    const testKeys = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();
        setError('');
        if (!clientId.trim() || !consumerKey.trim()) return setError(t('settings:connections.snaptrade.errors.keys'));
        const adapter = sourceRegistry.get('snaptrade');
        if (!adapter) return setError(t('settings:connections.form.errors.generic'));
        setWorking(true);
        try {
            openMapping(await adapter.listExternalAccounts({ connectionId: 'test', credentials: credentials(), publicParams: {} }));
        } catch (caught) {
            setError(t(errorKey(caught)));
        } finally {
            setWorking(false);
        }
    };

    const manage = async (): Promise<void> => {
        if (!connection) return;
        setError('');
        setWorking(true);
        try {
            openMapping(await syncEngine.listExternalAccounts(connection.id));
        } catch (caught) {
            setError(t(errorKey(caught)));
        } finally {
            setWorking(false);
        }
    };

    const setMapping = (externalId: string, patch: Partial<Mapping>): void => {
        setMappings(previous => {
            const next = { ...previous[externalId], ...patch };
            // Mapping onto an account that already has rows: start after them, so nothing is imported twice
            if (patch.target !== undefined) {
                next.startDate = patch.target === NEW_ACCOUNT || patch.target === SKIP ? '' : connectionService.suggestStartDate(patch.target);
            }
            return { ...previous, [externalId]: next };
        });
    };

    const save = async (): Promise<void> => {
        if (!external) return;
        setError('');
        const chosen = external.filter(account => mappings[account.externalId]?.target !== SKIP);
        if (chosen.length === 0) return setError(t('settings:connections.snaptrade.errors.noneChosen'));
        setWorking(true);
        try {
            const accountMap: Record<string, string> = {};
            const cursor: Record<string, ConnectionCursor> = {};
            for (const account of chosen) {
                const mapping = mappings[account.externalId];
                let target = mapping.target;
                if (target === NEW_ACCOUNT) {
                    const institute = await instituteService.createInstitute({ name: account.name, type: 'broker' });
                    target = (await accountService.createAccount({
                        instituteId: institute.id,
                        name: account.name,
                        type: 'investment',
                        defaultCurrency: account.currency || user?.preferences?.currency || 'EUR',
                    })).id;
                }
                accountMap[account.externalId] = target;
                // A newly linked account starts at its chosen date; one already synced keeps its own cursor
                const isNew = connection?.accountMap[account.externalId] !== target;
                if (mapping.startDate && isNew) cursor[account.externalId] = { lastActivityDate: `${mapping.startDate}T00:00:00.000Z` };
            }
            const accountNames = Object.fromEntries(chosen.map(account => [account.externalId, account.name]));
            const saved = connection
                ? await connectionService.updateConnection(connection.id, { accountMap, cursor, publicParams: { ...connection.publicParams, accountNames } })
                : await connectionService.createConnection({
                    sourceId: 'snaptrade',
                    label: t('settings:connections.sources.snaptrade'),
                    credentials: credentials(),
                    publicParams: { accountNames },
                    accountMap,
                    mode: 'history',
                    cursor,
                });
            setClientId('');
            setConsumerKey('');
            setExternal(null);
            await onChanged(saved.id);
        } catch {
            setError(t('settings:connections.form.errors.generic'));
        } finally {
            setWorking(false);
        }
    };

    const mappingStep = external !== null && (
        <div className="space-y-4 mt-4">
            <p className="text-sm text-primary">{t('settings:connections.snaptrade.found', { count: external.length })}</p>
            <MappingEditor external={external} mappings={mappings} accountChoices={accountChoices} onChange={setMapping} />
            <p className="text-xs text-tertiary">{t('settings:connections.snaptrade.startHelp')}</p>
            {error && <p role="alert" className="text-xs text-negative">{error}</p>}
            <div className="flex flex-wrap gap-2">
                <Button isLoading={working} disabled={working || external.length === 0} onClick={() => void save()}>
                    {t(connection ? 'settings:connections.snaptrade.saveMapping' : 'settings:connections.snaptrade.save')}
                </Button>
                <Button variant="ghost" disabled={working} onClick={() => { setExternal(null); setError(''); }}>
                    {t(connection ? 'common:buttons.cancel' : 'common:buttons.back')}
                </Button>
            </div>
        </div>
    );

    const header = (
        <div className="flex items-start gap-3">
            <Briefcase size={20} className="text-brand shrink-0 mt-1" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold text-primary">{t('settings:connections.snaptrade.title')}</h3>
                <p className="text-sm text-secondary mt-1">
                    {t(connection ? 'settings:connections.snaptrade.connectedHint' : 'settings:connections.snaptrade.description')}
                </p>
            </div>
            {connection && <StatusBadge status={connection.lastStatus} />}
        </div>
    );

    if (connection) {
        const names = connection.publicParams.accountNames ?? {};
        const linked = Object.entries(connection.accountMap);
        return (
            <div className="bg-card rounded-xl p-6 shadow-lg border border-border">
                {header}
                <p className="flex items-center gap-1.5 text-xs text-secondary mt-3">
                    <CheckCircle2 size={14} className="text-positive" aria-hidden="true" />
                    {t('settings:connections.snaptrade.connectedKeys', { clientId: connection.credentialPreviews.clientId ?? '—' })}
                </p>
                {external === null && (
                    <>
                        <h4 className="text-sm font-semibold text-primary mt-5 mb-2">{t('settings:connections.snaptrade.accountsTitle')}</h4>
                        {linked.length === 0 ? (
                            <p className="text-sm text-tertiary">{t('settings:connections.snaptrade.noLinkedAccounts')}</p>
                        ) : (
                            <ul className="divide-y divide-border border border-border rounded-lg">
                                {linked.map(([externalId, accountId]) => (
                                    <li key={externalId} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                                        <span className="font-medium text-primary">{names[externalId] ?? externalId}</span>
                                        <ArrowRight size={14} className="text-tertiary" aria-hidden="true" />
                                        <span className="text-secondary">{describeAccount(accountId)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {error && <p role="alert" className="text-xs text-negative mt-3">{error}</p>}
                        <div className="mt-4">
                            <SyncControls connection={connection} syncing={syncing} disabled={busy || working}
                                onSync={() => void onSync(connection)} onDelete={() => void onDelete(connection.id)}>
                                <Button size="sm" variant="ghost" isLoading={working} disabled={busy || working} onClick={() => void manage()}>
                                    <Settings2 size={14} className="mr-1.5" aria-hidden="true" />
                                    {t('settings:connections.snaptrade.manage')}
                                </Button>
                            </SyncControls>
                        </div>
                        <SyncResult report={report} />
                    </>
                )}
                {mappingStep}
            </div>
        );
    }

    return (
        <div className="bg-card rounded-xl p-6 shadow-lg border border-border">
            {header}
            <ol className="list-decimal list-inside text-sm text-secondary space-y-1 mt-4 mb-4">
                <li>
                    {t('settings:connections.snaptrade.steps.account')}{' '}
                    <a href={SNAPTRADE_PERSONAL_URL} target="_blank" rel="noopener noreferrer" className="text-brand inline-flex items-center gap-1">
                        snaptrade.com <ExternalLink size={12} aria-hidden="true" />
                    </a>
                </li>
                <li>{t('settings:connections.snaptrade.steps.link')}</li>
                <li>{t('settings:connections.snaptrade.steps.keys')}</li>
            </ol>

            {external === null ? (
                <form onSubmit={event => void testKeys(event)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="snaptrade-client-id" className="block text-xs font-medium text-secondary mb-1.5">
                                {t('settings:connections.fields.clientId')}
                            </label>
                            <input id="snaptrade-client-id" type="text" autoComplete="off" spellCheck={false} value={clientId}
                                onChange={event => setClientId(event.target.value)} className={`${inputClass} font-mono`} />
                        </div>
                        <div>
                            <label htmlFor="snaptrade-consumer-key" className="block text-xs font-medium text-secondary mb-1.5">
                                {t('settings:connections.fields.consumerKey')}
                            </label>
                            <input id="snaptrade-consumer-key" type="password" autoComplete="off" spellCheck={false} value={consumerKey}
                                onChange={event => setConsumerKey(event.target.value)} className={`${inputClass} font-mono`} />
                        </div>
                    </div>
                    <p className="text-xs text-tertiary">{t('settings:connections.snaptrade.keyNote')}</p>
                    {error && <p role="alert" className="text-xs text-negative">{error}</p>}
                    <Button type="submit" isLoading={working} disabled={working}>{t('settings:connections.snaptrade.test')}</Button>
                </form>
            ) : mappingStep}
        </div>
    );
};
