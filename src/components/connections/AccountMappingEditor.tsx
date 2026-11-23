import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AccountChoice } from './accountChoices';

export const NEW_ACCOUNT = '__new__';
export const SKIP = '__skip__';
const inputClass = 'w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5';

export interface AccountMapping {
    target: string;
    startDate: string;
}

export interface MappableAccount {
    externalId: string;
    name: string;
    /** Shown under the name (e.g. "PEA · 12 000 €"). */
    detail?: string;
}

/**
 * Provider account → GlassFolio account (a new one, an existing one, or not synced), shared by SnapTrade
 * and the French banks (TGLA-221, TGLA-237). The start date column is for sources with a history.
 */
export const AccountMappingEditor: React.FC<{
    idPrefix: string;
    accounts: MappableAccount[];
    mappings: Record<string, AccountMapping>;
    accountChoices: AccountChoice[];
    showStartDate: boolean;
    onChange: (externalId: string, patch: Partial<AccountMapping>) => void;
}> = ({ idPrefix, accounts, mappings, accountChoices, showStartDate, onChange }) => {
    const { t } = useTranslation();
    return (
        <ul className="space-y-3">
            {accounts.map(account => {
                const mapping = mappings[account.externalId];
                const targetId = `${idPrefix}-target-${account.externalId}`;
                const startId = `${idPrefix}-start-${account.externalId}`;
                return (
                    <li key={account.externalId} className="border border-border rounded-lg p-3 space-y-2">
                        <div>
                            <p className="text-sm font-medium text-primary">{account.name}</p>
                            {account.detail && <p className="text-xs text-tertiary">{account.detail}</p>}
                        </div>
                        <div className={`grid grid-cols-1 gap-2 ${showStartDate ? 'md:grid-cols-2' : ''}`}>
                            <div>
                                <label className="block text-xs font-medium text-secondary mb-1" htmlFor={targetId}>
                                    {t('settings:connections.form.account')}
                                </label>
                                <select id={targetId} value={mapping?.target ?? NEW_ACCOUNT}
                                    onChange={event => onChange(account.externalId, { target: event.target.value })} className={inputClass}>
                                    <option value={NEW_ACCOUNT}>{t('settings:connections.form.newAccountNamed', { name: account.name })}</option>
                                    {accountChoices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
                                    <option value={SKIP}>{t('settings:connections.snaptrade.skip')}</option>
                                </select>
                            </div>
                            {showStartDate && (
                                <div>
                                    <label className="block text-xs font-medium text-secondary mb-1" htmlFor={startId}>
                                        {t('settings:connections.snaptrade.startDate')}
                                    </label>
                                    <input id={startId} type="date" value={mapping?.startDate ?? ''}
                                        disabled={mapping?.target === SKIP}
                                        onChange={event => onChange(account.externalId, { startDate: event.target.value })} className={inputClass} />
                                </div>
                            )}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
};
