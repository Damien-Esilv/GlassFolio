import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Briefcase, ExternalLink } from 'lucide-react';
import Button from '../Button';
import { useAuth } from '../../context/AuthContext';
import { accountService, instituteService } from '../../services/instituteService';
import { connectionService, ConnectorError, sourceRegistry } from '../../services/connectors';
import type { Account } from '../../types';
import type { ConnectionCursor, ExternalAccount } from '../../types/connections';

const NEW_ACCOUNT = '__new__';
const SKIP = '__skip__';
const SNAPTRADE_PERSONAL_URL = 'https://snaptrade.com/personal-investing';
const inputClass = 'w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5';

interface Mapping { target: string; startDate: string }

interface Props {
    accounts: Account[];
    onConnected: (connectionId: string) => Promise<void>;
}

/** Settings → Connections: link SnapTrade Personal keys and choose where each broker account goes (TGLA-221). */
export const SnapTradeConnectCard: React.FC<Props> = ({ accounts, onConnected }) => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [clientId, setClientId] = useState('');
    const [consumerKey, setConsumerKey] = useState('');
    const [external, setExternal] = useState<ExternalAccount[] | null>(null);
    const [mappings, setMappings] = useState<Record<string, Mapping>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const sortedAccounts = useMemo(() => [...accounts].sort((a, b) => a.name.localeCompare(b.name)), [accounts]);

    const credentials = (): Record<string, string> => ({ clientId: clientId.trim(), consumerKey: consumerKey.trim() });

    const testKeys = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();
        setError('');
        if (!clientId.trim() || !consumerKey.trim()) return setError(t('settings:connections.snaptrade.errors.keys'));
        const adapter = sourceRegistry.get('snaptrade');
        if (!adapter) return setError(t('settings:connections.form.errors.generic'));
        setBusy(true);
        try {
            const list = await adapter.listExternalAccounts({ connectionId: 'test', credentials: credentials(), publicParams: {} });
            setExternal(list);
            setMappings(Object.fromEntries(list.map(account => [account.externalId, { target: NEW_ACCOUNT, startDate: '' }])));
            if (list.length === 0) setError(t('settings:connections.snaptrade.errors.noAccounts'));
        } catch (caught) {
            const code = caught instanceof ConnectorError ? caught.code : 'unknown';
            setError(t(`settings:connections.errors.${code}`));
        } finally {
            setBusy(false);
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
        setBusy(true);
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
                if (mapping.startDate) cursor[account.externalId] = { lastActivityDate: `${mapping.startDate}T00:00:00.000Z` };
            }
            const connection = await connectionService.createConnection({
                sourceId: 'snaptrade',
                label: t('settings:connections.sources.snaptrade'),
                credentials: credentials(),
                accountMap,
                mode: 'history',
                cursor,
            });
            setClientId('');
            setConsumerKey('');
            setExternal(null);
            await onConnected(connection.id);
        } catch {
            setError(t('settings:connections.form.errors.generic'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="bg-card rounded-xl p-6 shadow-lg border border-border">
            <div className="flex items-start gap-3">
                <Briefcase size={20} className="text-brand shrink-0 mt-1" aria-hidden="true" />
                <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-primary">{t('settings:connections.snaptrade.title')}</h3>
                    <p className="text-sm text-secondary mt-1">{t('settings:connections.snaptrade.description')}</p>
                </div>
            </div>
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
                        <p className="text-xs text-tertiary mt-1">{t('settings:connections.snaptrade.keyNote')}</p>
                    </div>
                    {error && <p role="alert" className="text-xs text-negative">{error}</p>}
                    <Button type="submit" isLoading={busy} disabled={busy}>{t('settings:connections.snaptrade.test')}</Button>
                </form>
            ) : (
                <div className="space-y-4">
                    <p className="text-sm text-primary">{t('settings:connections.snaptrade.found', { count: external.length })}</p>
                    <ul className="space-y-3">
                        {external.map(account => {
                            const mapping = mappings[account.externalId];
                            return (
                                <li key={account.externalId} className="border border-border rounded-lg p-3 space-y-2">
                                    <p className="text-sm font-medium text-primary">{account.name}</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <select aria-label={t('settings:connections.form.account')} value={mapping?.target ?? NEW_ACCOUNT}
                                            onChange={event => setMapping(account.externalId, { target: event.target.value })} className={inputClass}>
                                            <option value={NEW_ACCOUNT}>{t('settings:connections.form.newAccount')}</option>
                                            {sortedAccounts.map(existing => <option key={existing.id} value={existing.id}>{existing.name}</option>)}
                                            <option value={SKIP}>{t('settings:connections.snaptrade.skip')}</option>
                                        </select>
                                        <input type="date" aria-label={t('settings:connections.snaptrade.startDate')} value={mapping?.startDate ?? ''}
                                            disabled={mapping?.target === SKIP}
                                            onChange={event => setMapping(account.externalId, { startDate: event.target.value })} className={inputClass} />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="text-xs text-tertiary">{t('settings:connections.snaptrade.startHelp')}</p>
                    {error && <p role="alert" className="text-xs text-negative">{error}</p>}
                    <div className="flex flex-wrap gap-2">
                        <Button isLoading={busy} disabled={busy} onClick={() => void save()}>{t('settings:connections.snaptrade.save')}</Button>
                        <Button variant="ghost" disabled={busy} onClick={() => setExternal(null)}>{t('common:buttons.back')}</Button>
                    </div>
                </div>
            )}
        </div>
    );
};
