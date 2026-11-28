import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AlertTriangle, CheckCircle2, ExternalLink, KeyRound, Landmark, Search, Settings2, Smartphone } from 'lucide-react';
import Button from '../Button';
import { getDeploymentMode } from '../../config/deployment';
import { DESKTOP_RELEASES_URL } from '../../config/downloads';
import { GITHUB_README_DOCKER_URL } from '../../config/project';
import { isVerifiedWoobBank, TRANSLATED_WOOB_FIELDS, WOOB_BANK_LIMITS, woobBankName } from '../../config/woobBanks';
import { accountService, instituteService } from '../../services/instituteService';
import {
    connectionService,
    newConnectionId,
    reconnectBank,
    syncEngine,
    toExternalAccount,
    woobClient,
    WoobError,
    type WoobBankField,
    type WoobBankInfo,
    type WoobLoginResult,
    type WoobStatus,
} from '../../services/connectors';
import { LinkedAccounts, StatusBadge, SyncControls, SyncResult, type RemoveOptions } from './ConnectionRow';
import { WoobModulesPanel } from './WoobModulesPanel';
import { AccountMappingEditor, NEW_ACCOUNT, SKIP, type AccountMapping, type MappableAccount } from './AccountMappingEditor';
import type { AccountChoice } from './accountChoices';
import type { ExternalAccount, SafeConnection, SyncReport } from '../../types/connections';

const inputClass = 'w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5';
const cardStyle = 'bg-card rounded-xl p-6 shadow-lg border border-border';

type Challenge = Extract<WoobLoginResult, { state: 'challenge' }>;

/** Where a bank flow stands: typing credentials, answering the bank's challenge, choosing accounts. */
type Step =
    | { name: 'credentials' }
    | { name: 'challenge'; challenge: Challenge }
    | { name: 'mapping'; accounts: ExternalAccount[] };

interface Props {
    /** French bank connections (source `woob`). */
    connections: SafeConnection[];
    accountChoices: AccountChoice[];
    describeAccount: (accountId: string) => string;
    reports: Record<string, SyncReport>;
    syncing: string | null;
    onSync: (connection: SafeConnection) => Promise<void>;
    /** Removes a bank: with what it recorded, or keeping its history (TGLA-254). */
    onDelete: (connectionId: string, options?: RemoveOptions) => Promise<void>;
    /** A bank was linked, reconnected or its accounts changed: reload, then sync it. */
    onChanged: (connectionId: string) => Promise<void>;
}

/** Label of a bank form field: translated for the common ones, the module's own label otherwise. */
const fieldLabel = (field: WoobBankField, t: TFunction): string =>
    TRANSLATED_WOOB_FIELDS.includes(field.id) ? t(`settings:connections.banks.fields.${field.id}`) : field.label;

/** A pattern that only accepts digits (`^\d+$`, `^\d{8}$`): its error says so in words. */
const DIGITS_ONLY = /^\^?\\d(\+|\*|\{\d+(,\d*)?\})\$?$/;

/**
 * The first filled field whose value the bank module would refuse: Woob checks each field against the module's own
 * pattern before contacting the bank (Caisse d'Épargne: a password of digits only). A pattern JavaScript cannot read
 * is left to the worker, which checks it again.
 */
const misformatted = (bank: WoobBankInfo, values: Record<string, string>): WoobBankField | undefined =>
    bank.fields.find(field => {
        const value = (values[field.id] ?? '').trim();
        if (!value || !field.regexp) return false;
        try {
            return !new RegExp(field.regexp).test(value);
        } catch {
            return false;
        }
    });

const useErrorText = (): ((caught: unknown, fields?: WoobBankField[]) => string) => {
    const { t } = useTranslation();
    return (caught: unknown, fields: WoobBankField[] = []): string => {
        const code = caught instanceof WoobError ? caught.workerCode : 'unknown';
        const detail = caught instanceof WoobError ? caught.detail : '';
        if (code === 'invalid_format') {
            const field = fields.find(item => item.id === detail);
            const key = field?.regexp && DIGITS_ONLY.test(field.regexp) ? 'invalid_format_digits' : 'invalid_format';
            return t(`settings:connections.banks.errors.${key}`, { field: field ? fieldLabel(field, t) : detail });
        }
        const text = t([`settings:connections.banks.errors.${code}`, 'settings:connections.banks.errors.unknown'], { detail });
        if (!detail) return text;
        // The bank's own words when it gave some (e.g. that no client area matches the chosen account type)
        if (code === 'auth_failed') return `${text} ${t('settings:connections.banks.errors.bankSays', { message: detail })}`;
        // Where the bank module gave up (no log is kept): what to report if it keeps failing
        if (code === 'bank_unavailable' || code === 'unknown') return `${text} ${t('settings:connections.banks.errors.technicalDetail', { detail })}`;
        return text;
    };
};

/** Only a small inline image of a type the worker allows, never a link the page would load. */
const CHALLENGE_IMAGE = /^data:image\/(png|jpeg|gif);base64,[A-Za-z0-9+/]+=*$/;

/** The bank's two-factor challenge: a code to type, or a validation in the bank's app. */
const ChallengePanel: React.FC<{
    challenge: Challenge;
    bankName: string;
    working: boolean;
    onAnswer: (value?: string) => void;
    onCancel: () => void;
}> = ({ challenge, bankName, working, onAnswer, onCancel }) => {
    const { t } = useTranslation();
    const [code, setCode] = useState('');
    if (challenge.kind === 'app') {
        return (
            <div className="space-y-3 border border-border rounded-lg p-4" role="group" aria-label={t('settings:connections.banks.challenge.title')}>
                <p className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Smartphone size={16} className="text-brand" aria-hidden="true" />
                    {t('settings:connections.banks.challenge.app', { bank: bankName })}
                </p>
                {challenge.message && <p className="text-xs text-secondary">{challenge.message}</p>}
                <div className="flex flex-wrap gap-2">
                    <Button isLoading={working} disabled={working} onClick={() => onAnswer()}>{t('settings:connections.banks.challenge.validated')}</Button>
                    <Button variant="ghost" disabled={working} onClick={onCancel}>{t('common:buttons.cancel')}</Button>
                </div>
            </div>
        );
    }
    return (
        <form className="space-y-3 border border-border rounded-lg p-4" onSubmit={event => { event.preventDefault(); if (code.trim()) onAnswer(code.trim()); }}>
            <label htmlFor="bank-challenge-code" className="flex items-center gap-2 text-sm font-medium text-primary">
                <KeyRound size={16} className="text-brand" aria-hidden="true" />
                {challenge.mediumLabel
                    ? t('settings:connections.banks.challenge.codeSentTo', { target: challenge.mediumLabel })
                    : t('settings:connections.banks.challenge.code', { bank: bankName })}
            </label>
            {challenge.message && <p className="text-xs text-secondary">{challenge.message}</p>}
            {challenge.image && CHALLENGE_IMAGE.test(challenge.image) && (
                <div className="space-y-1">
                    <img src={challenge.image} alt={t('settings:connections.banks.challenge.imageAlt')} className="max-w-xs rounded border border-border bg-card" />
                    <p className="text-xs text-tertiary">{t('settings:connections.banks.challenge.imageHelp')}</p>
                </div>
            )}
            <input id="bank-challenge-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={16} value={code}
                onChange={event => setCode(event.target.value)} className={`${inputClass} font-mono max-w-xs`} />
            <div className="flex flex-wrap gap-2">
                <Button type="submit" isLoading={working} disabled={working || !code.trim()}>{t('settings:connections.banks.challenge.submit')}</Button>
                <Button variant="ghost" disabled={working} onClick={onCancel}>{t('common:buttons.cancel')}</Button>
            </div>
        </form>
    );
};

const normalized = (value: string): string => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Bank field with autocomplete: typing lists the matching banks right under it (name or Woob module), picked with a
 * click or the arrow keys and Enter. Typing again clears the choice until a bank is picked.
 */
const BankPicker: React.FC<{
    banks: WoobBankInfo[];
    selected: WoobBankInfo | undefined;
    onSelect: (bank: WoobBankInfo | undefined) => void;
}> = ({ banks, selected, onSelect }) => {
    const { t } = useTranslation();
    const [query, setQuery] = useState(selected?.name ?? '');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const showsChoice = selected !== undefined && query === selected.name;
    const matches = useMemo(() => {
        const wanted = normalized(query.trim());
        return [...banks]
            .filter(item => showsChoice || !wanted || normalized(`${item.name} ${item.module}`).includes(wanted))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [banks, query, showsChoice]);

    const choose = (item: WoobBankInfo): void => {
        onSelect(item);
        setQuery(item.name);
        setOpen(false);
    };
    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive(previous => (matches.length === 0 ? 0 : (previous + step + matches.length) % matches.length));
        } else if (event.key === 'Enter' && open && matches[active]) {
            // Picks the highlighted bank instead of submitting the form
            event.preventDefault();
            choose(matches[active]);
        } else if (event.key === 'Escape') {
            setOpen(false);
        }
    };
    const optionId = (item: WoobBankInfo): string => `bank-option-${item.module}`;

    return (
        <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary pointer-events-none" aria-hidden="true" />
            <input id="bank-search" type="text" role="combobox" aria-label={t('settings:connections.banks.bank')} aria-autocomplete="list"
                aria-expanded={open} aria-controls="bank-options" autoComplete="off" spellCheck={false}
                aria-activedescendant={open && matches[active] ? optionId(matches[active]) : undefined}
                placeholder={t('settings:connections.banks.searchPlaceholder')} value={query}
                onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); if (selected) onSelect(undefined); }}
                onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown}
                className={`${inputClass} pl-9 pr-9`} />
            {selected && showsChoice && <CheckCircle2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-positive" aria-hidden="true" />}
            {open && (
                <ul id="bank-options" role="listbox" aria-label={t('settings:connections.banks.bank')}
                    className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-card shadow-lg py-1 animate-fade-in">
                    {matches.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-tertiary">{t('settings:connections.banks.noMatch')}</li>
                    ) : matches.map((item, index) => (
                        <li key={item.module} id={optionId(item)} role="option" aria-selected={index === active}
                            // mousedown, not click: the field's blur would close the list first
                            onMouseDown={event => { event.preventDefault(); choose(item); }} onMouseEnter={() => setActive(index)}
                            className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${index === active ? 'bg-subtle text-primary' : 'text-secondary'}`}>
                            <Landmark size={14} className="text-tertiary shrink-0" aria-hidden="true" />
                            <span className="flex-1 min-w-0 truncate">{item.name}</span>
                            {selected?.module === item.module && <CheckCircle2 size={14} className="text-positive shrink-0" aria-hidden="true" />}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

/**
 * The credential form of one bank, built from its Woob module's own fields (TGLA-240): identifier, password,
 * region, branch, birth date… Secrets are never pre-filled; a list or a switch starts on the module's default.
 */
const CredentialFields: React.FC<{ bank: WoobBankInfo; values: Record<string, string>; onChange: (id: string, value: string) => void }> = ({ bank, values, onChange }) => {
    const { t } = useTranslation();
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bank.fields.map(field => {
                const id = `bank-field-${field.id}`;
                const label = fieldLabel(field, t);
                if (field.kind === 'bool') {
                    return (
                        <label key={field.id} htmlFor={id} className="flex items-center gap-2 text-sm text-primary md:col-span-2">
                            <input id={id} type="checkbox" checked={values[field.id] === 'true'}
                                onChange={event => onChange(field.id, event.target.checked ? 'true' : 'false')}
                                className="rounded border-subtle text-primary focus:ring-primary" />
                            {label}
                        </label>
                    );
                }
                return (
                    <div key={field.id}>
                        <label htmlFor={id} className="block text-xs font-medium text-secondary mb-1.5">
                            {label}
                            {!field.required && <span className="text-tertiary"> {t('settings:connections.banks.optional')}</span>}
                        </label>
                        {field.kind === 'select' ? (
                            <select id={id} value={values[field.id] ?? ''} onChange={event => onChange(field.id, event.target.value)} className={inputClass}>
                                {(!field.required || !values[field.id]) && <option value="">{t('settings:connections.banks.choose')}</option>}
                                {(field.choices ?? []).map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                            </select>
                        ) : (
                            <input id={id}
                                type={field.kind === 'password' ? 'password' : field.kind === 'date' ? 'date' : field.kind === 'number' ? 'number' : 'text'}
                                autoComplete="off" spellCheck={false} value={values[field.id] ?? ''}
                                onChange={event => onChange(field.id, event.target.value)} className={inputClass} />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

/** Starting values of a bank form: the module's defaults for lists and switches, nothing for text and secrets. */
const defaultValues = (bank: WoobBankInfo | undefined): Record<string, string> =>
    Object.fromEntries((bank?.fields ?? [])
        .filter(field => (field.kind === 'select' || field.kind === 'bool') && field.default !== null)
        .map(field => [field.id, field.default as string]));

const filled = (bank: WoobBankInfo, values: Record<string, string>): boolean =>
    bank.fields.every(field => !field.required || (values[field.id] ?? '').trim().length > 0);

/** Only the bank's own fields, without empty optional ones. */
const credentialsFor = (bank: WoobBankInfo, values: Record<string, string>): Record<string, string> =>
    Object.fromEntries(bank.fields
        .map(field => [field.id, (values[field.id] ?? '').trim()] as const)
        .filter(([, value]) => value.length > 0));

/** Settings → Connections: French banks read on this computer by Woob (TGLA-237). */
export const BankConnectCard: React.FC<Props> = ({ connections, accountChoices, describeAccount, reports, syncing, onSync, onDelete, onChanged }) => {
    const { t, i18n } = useTranslation();
    const errorText = useErrorText();
    const [status, setStatus] = useState<WoobStatus | null>(null);

    // Adding a bank
    const [adding, setAdding] = useState(false);
    // No bank is chosen until the user picks one
    const [module, setModule] = useState('');
    const [values, setValues] = useState<Record<string, string>>({});
    const [acknowledged, setAcknowledged] = useState(false);
    const [pendingId, setPendingId] = useState('');
    // Reconnecting or managing an existing bank
    const [activeId, setActiveId] = useState<string | null>(null);
    const [askCredentials, setAskCredentials] = useState(false);

    const [step, setStep] = useState<Step>({ name: 'credentials' });
    const [mappings, setMappings] = useState<Record<string, AccountMapping>>({});
    // Read the operations of the checking and savings accounts (TGLA-254): on for a new bank
    const [cashHistory, setCashHistory] = useState(true);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        void woobClient.status().then(result => {
            if (alive) setStatus(result);
        });
        return () => {
            alive = false;
        };
    }, []);

    /** Reads the worker's status again (after the bank modules changed, TGLA-241). */
    const reloadStatus = async (): Promise<void> => setStatus(await woobClient.status());

    const banks = useMemo(() => (status?.banks ?? []).map(item => ({ ...item, name: woobBankName(item) })), [status]);
    const findBank = (name: string | undefined): WoobBankInfo | undefined => banks.find(item => item.module === name);
    // Only a bank picked in the list: typing again clears the choice, so a form never stays behind another name
    const bank = findBank(module);
    const money = (amount: string | undefined, currency: string | undefined): string =>
        amount === undefined ? '' : new Intl.NumberFormat(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', { style: 'currency', currency: currency || 'EUR' }).format(Number(amount));

    const reset = (): void => {
        setAdding(false);
        setActiveId(null);
        setAskCredentials(false);
        setModule('');
        setValues({});
        setAcknowledged(false);
        setStep({ name: 'credentials' });
        setMappings({});
        setCashHistory(true);
        setError('');
    };

    const cancel = (): void => {
        // A bank session opened for a bank that was finally not added is deleted at once
        if (adding && pendingId) void woobClient.forget(pendingId);
        reset();
    };

    /** Next step after the bank answered a login: its challenge, the accounts to map, or done. */
    const handleLogin = async (result: WoobLoginResult): Promise<void> => {
        if (result.state === 'challenge') {
            setStep({ name: 'challenge', challenge: result });
            return;
        }
        if (adding) {
            const accounts = result.accounts.map(toExternalAccount);
            setMappings(Object.fromEntries(accounts.map(account => [account.externalId, { target: NEW_ACCOUNT, startDate: '' }])));
            setStep({ name: 'mapping', accounts });
            if (accounts.length === 0) setError(t('settings:connections.banks.errors.noAccounts'));
            return;
        }
        const id = activeId;
        reset();
        if (id) await onChanged(id);
    };

    /** Runs one step of the flow; `fields` are the form of the bank concerned, to name a field the bank refused. */
    const run = async (action: () => Promise<void>, fields: WoobBankField[] = []): Promise<void> => {
        setError('');
        setWorking(true);
        try {
            await action();
        } catch (caught) {
            if (caught instanceof WoobError && caught.workerCode === 'challenge_expired') setStep({ name: 'credentials' });
            if (caught instanceof WoobError && ['auth_failed', 'invalid_format'].includes(caught.workerCode) && activeId) setAskCredentials(true);
            setError(errorText(caught, fields));
        } finally {
            setWorking(false);
        }
    };

    const login = (): Promise<void> => run(async () => {
        if (!bank) throw new WoobError('credentials_missing');
        if (!acknowledged) throw new WoobError('acknowledge');
        if (!filled(bank, values)) throw new WoobError('credentials_missing');
        const badField = misformatted(bank, values);
        if (badField) throw new WoobError('invalid_format', badField.id);
        const id = pendingId || newConnectionId();
        setPendingId(id);
        await handleLogin(await woobClient.login({ key: id, module: bank.module, credentials: credentialsFor(bank, values) }));
    }, bank?.fields);

    const reconnect = (connection: SafeConnection, withCredentials: boolean): Promise<void> => run(async () => {
        const connectionBank = findBank(connection.publicParams.module);
        if (withCredentials && connectionBank && !filled(connectionBank, values)) throw new WoobError('credentials_missing');
        const badField = withCredentials && connectionBank ? misformatted(connectionBank, values) : undefined;
        if (badField) throw new WoobError('invalid_format', badField.id);
        await handleLogin(await reconnectBank(connection.id, withCredentials && connectionBank ? credentialsFor(connectionBank, values) : undefined));
    }, findBank(connection.publicParams.module)?.fields);

    const answer = (value?: string): Promise<void> => run(async () => {
        if (step.name !== 'challenge') return;
        await handleLogin(await woobClient.answer(step.challenge.challengeId, value));
    });

    const manage = (connection: SafeConnection): Promise<void> => run(async () => {
        reset();
        setActiveId(connection.id);
        const accounts = await syncEngine.listExternalAccounts(connection.id);
        setMappings(Object.fromEntries(accounts.map(account => [account.externalId, {
            target: connection.accountMap[account.externalId] ?? SKIP, startDate: '',
        }])));
        setCashHistory(connection.cashHistory === true);
        setStep({ name: 'mapping', accounts });
    });

    /** Creates the GlassFolio accounts asked for, then saves the bank connection (new) or its accounts (existing). */
    const saveMapping = (): Promise<void> => run(async () => {
        if (step.name !== 'mapping') return;
        const chosen = step.accounts.filter(account => mappings[account.externalId]?.target !== SKIP);
        if (chosen.length === 0) throw new WoobError('none_chosen');
        const existing = activeId ? connections.find(connection => connection.id === activeId) : undefined;
        const bankName = findBank(existing?.publicParams.module ?? module)?.name ?? existing?.label ?? module;

        let instituteId: string | undefined;
        const institute = async (): Promise<string> => {
            if (instituteId) return instituteId;
            const known = (await instituteService.getInstitutes()).find(item => item.type === 'bank' && item.name === bankName);
            instituteId = (known ?? await instituteService.createInstitute({ name: bankName, type: 'bank' })).id;
            return instituteId;
        };
        const accountMap: Record<string, string> = {};
        for (const account of chosen) {
            let target = mappings[account.externalId].target;
            if (target === NEW_ACCOUNT) {
                target = (await accountService.createAccount({
                    instituteId: await institute(),
                    name: account.name,
                    type: account.accountType ?? 'other',
                    wrapperType: account.wrapperType,
                    defaultCurrency: account.currency || 'EUR',
                })).id;
            }
            accountMap[account.externalId] = target;
        }
        const accountNames = Object.fromEntries(chosen.map(account => [account.externalId, account.name]));
        const saved = existing
            ? await connectionService.updateConnection(existing.id, { accountMap, publicParams: { ...existing.publicParams, accountNames }, cashHistory })
            : await connectionService.createConnection({
                id: pendingId,
                sourceId: 'woob',
                label: bankName,
                credentials: bank ? credentialsFor(bank, values) : values,
                publicParams: { module: bank?.module ?? module, accountNames },
                accountMap,
                mode: 'holdings',
                cashHistory,
            });
        reset();
        setPendingId('');
        await onChanged(saved.id);
    });

    const flowFor = (bankName: string): React.ReactNode => {
        if (step.name === 'challenge') {
            return <ChallengePanel challenge={step.challenge} bankName={bankName} working={working} onAnswer={value => void answer(value)} onCancel={cancel} />;
        }
        if (step.name === 'mapping') {
            const accounts: MappableAccount[] = step.accounts.map(account => ({
                externalId: account.externalId,
                name: account.name,
                detail: [account.wrapperType ? t(`settings:connections.banks.wrappers.${account.wrapperType}`) : t(`settings:connections.banks.accountTypes.${account.accountType ?? 'other'}`),
                    money(account.balance, account.currency)].filter(Boolean).join(' · '),
            }));
            return (
                <div className="space-y-4">
                    <p className="text-sm text-primary">{t('settings:connections.banks.found', { count: accounts.length })}</p>
                    <AccountMappingEditor idPrefix="bank" accounts={accounts} mappings={mappings} accountChoices={accountChoices} showStartDate={false}
                        onChange={(externalId, patch) => setMappings(previous => ({ ...previous, [externalId]: { ...previous[externalId], ...patch } }))} />
                    <p className="text-xs text-tertiary">{t('settings:connections.banks.mappingHelp')}</p>
                    {step.accounts.some(account => account.accountType === 'checking' || account.accountType === 'savings') && (
                        <label className="flex items-start gap-2 text-xs text-secondary">
                            <input type="checkbox" checked={cashHistory} onChange={event => setCashHistory(event.target.checked)}
                                className="mt-0.5 rounded border-subtle text-primary focus:ring-primary" />
                            <span>
                                <span className="block text-primary font-medium">{t('settings:connections.banks.cashHistory.label')}</span>
                                <span className="block text-tertiary">{t('settings:connections.banks.cashHistory.help')}</span>
                            </span>
                        </label>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <Button isLoading={working} disabled={working || accounts.length === 0} onClick={() => void saveMapping()}>
                            {t('settings:connections.snaptrade.save')}
                        </Button>
                        <Button variant="ghost" disabled={working} onClick={cancel}>{t('common:buttons.cancel')}</Button>
                    </div>
                </div>
            );
        }
        return null;
    };

    const local = getDeploymentMode() === 'local';
    const header = (
        <div className="flex items-start gap-3">
            <Landmark size={20} className="text-brand shrink-0 mt-1" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold text-primary">{t('settings:connections.banks.title')}</h3>
                <p className="text-sm text-secondary mt-1">{t('settings:connections.banks.description')}</p>
            </div>
        </div>
    );

    if (status && !status.available && connections.length === 0) {
        return (
            <div className={cardStyle}>
                {header}
                <div className="flex items-start gap-2 text-sm text-secondary bg-subtle border border-subtle rounded-lg p-3 mt-4">
                    <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="space-y-2">
                        <p>{t(local ? 'settings:connections.banks.unavailable.local' : 'settings:connections.banks.unavailable.cloud')}</p>
                        <a href={local ? GITHUB_README_DOCKER_URL : DESKTOP_RELEASES_URL} target="_blank" rel="noopener noreferrer"
                            className="text-brand inline-flex items-center gap-1 text-sm">
                            {t(local ? 'settings:connections.banks.unavailable.localLink' : 'settings:connections.banks.unavailable.cloudLink')}
                            <ExternalLink size={12} aria-hidden="true" />
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={cardStyle}>
            {header}

            {connections.length > 0 && (
                <ul className="space-y-3 mt-5">
                    {connections.map(connection => {
                        const connectionBank = findBank(connection.publicParams.module);
                        const bankName = connectionBank?.name ?? connection.label;
                        const names = connection.publicParams.accountNames ?? {};
                        const active = activeId === connection.id;
                        return (
                            <li key={connection.id} className="border border-border rounded-lg p-4 space-y-3">
                                <div className="flex items-center gap-3">
                                    <Landmark size={18} className="text-brand shrink-0" aria-hidden="true" />
                                    <p className="font-medium text-primary flex-1 min-w-0 truncate">{bankName}</p>
                                    <StatusBadge status={connection.lastStatus} />
                                </div>
                                {Object.keys(connection.accountMap).length > 0 && (
                                    <LinkedAccounts accountMap={connection.accountMap} names={names} describeAccount={describeAccount} />
                                )}
                                {connection.lastStatus === 'reauth_required' && !active && (
                                    <div className="flex flex-wrap items-center gap-3 text-sm text-primary bg-warning-subtle rounded-lg p-3">
                                        <AlertTriangle size={16} className="text-warning shrink-0" aria-hidden="true" />
                                        <span className="flex-1 min-w-0">{t('settings:connections.banks.reauthNeeded', { bank: bankName })}</span>
                                        <Button size="sm" isLoading={working && active} disabled={working}
                                            onClick={() => { reset(); setActiveId(connection.id); void reconnect(connection, false); }}>
                                            {t('settings:connections.banks.reconnect')}
                                        </Button>
                                    </div>
                                )}
                                {active ? (
                                    <div className="space-y-3">
                                        {askCredentials && connectionBank && step.name === 'credentials' && (
                                            <form className="space-y-3" onSubmit={event => { event.preventDefault(); void reconnect(connection, true); }}>
                                                <p className="text-sm text-secondary">{t('settings:connections.banks.newCredentials')}</p>
                                                <CredentialFields bank={connectionBank} values={values} onChange={(id, value) => setValues(previous => ({ ...previous, [id]: value }))} />
                                                <div className="flex flex-wrap gap-2">
                                                    <Button type="submit" isLoading={working} disabled={working}>{t('settings:connections.banks.connect')}</Button>
                                                    <Button variant="ghost" disabled={working} onClick={cancel}>{t('common:buttons.cancel')}</Button>
                                                </div>
                                            </form>
                                        )}
                                        {working && step.name === 'credentials' && !askCredentials && (
                                            <p className="text-sm text-secondary" role="status">{t('settings:connections.banks.connecting', { bank: bankName })}</p>
                                        )}
                                        {flowFor(bankName)}
                                        {error && <p role="alert" className="text-xs text-negative">{error}</p>}
                                        {!working && step.name === 'credentials' && !askCredentials && (
                                            <Button size="sm" variant="ghost" onClick={cancel}>{t('common:buttons.close')}</Button>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <SyncControls connection={connection} syncing={syncing === connection.id} disabled={syncing !== null || working}
                                            keepHistoryChoice onSync={() => void onSync(connection)} onDelete={options => onDelete(connection.id, options)}>
                                            <Button size="sm" variant="ghost" disabled={working || syncing !== null}
                                                onClick={() => { reset(); setActiveId(connection.id); void reconnect(connection, false); }}>
                                                {t('settings:connections.banks.reconnect')}
                                            </Button>
                                            <Button size="sm" variant="ghost" disabled={working || syncing !== null} onClick={() => void manage(connection)}>
                                                <Settings2 size={14} className="mr-1.5" aria-hidden="true" />
                                                {t('settings:connections.snaptrade.manage')}
                                            </Button>
                                        </SyncControls>
                                        <SyncResult report={reports[connection.id]} />
                                    </>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {status?.available === false && connections.length > 0 && (
                <p className="text-xs text-warning mt-3">{t(local ? 'settings:connections.banks.unavailable.local' : 'settings:connections.banks.unavailable.cloud')}</p>
            )}

            {status?.available && !adding && activeId === null && (
                <Button className="mt-5" onClick={() => { reset(); setAdding(true); setPendingId(''); setValues(defaultValues(bank)); }}>
                    {t('settings:connections.banks.add')}
                </Button>
            )}

            {status?.available && !adding && activeId === null && <WoobModulesPanel status={status} onChanged={reloadStatus} />}

            {adding && (
                <div className="mt-5 space-y-4 border-t border-border pt-5">
                    {step.name === 'credentials' && (
                        <form className="space-y-4" onSubmit={event => { event.preventDefault(); void login(); }}>
                            <div className="space-y-2">
                                <label htmlFor="bank-search" className="block text-xs font-medium text-secondary">
                                    {t('settings:connections.banks.bank')} · {t('settings:connections.banks.count', { count: banks.length })}
                                </label>
                                <BankPicker banks={banks} selected={bank}
                                    onSelect={item => { setModule(item?.module ?? ''); setValues(defaultValues(item)); }} />
                                {bank && (
                                    <ul className="text-xs text-tertiary space-y-1">
                                        {!isVerifiedWoobBank(bank.module) && <li>{t('settings:connections.banks.unverifiedHelp')}</li>}
                                        {!bank.positions && <li>{t('settings:connections.banks.limits.balancesOnly')}</li>}
                                        {bank.history !== undefined && (
                                            <li>{t(bank.history ? 'settings:connections.banks.limits.history' : 'settings:connections.banks.limits.noHistory')}</li>
                                        )}
                                        {WOOB_BANK_LIMITS[bank.module] && <li className="text-warning">{t(`settings:connections.banks.limits.${WOOB_BANK_LIMITS[bank.module]}`)}</li>}
                                    </ul>
                                )}
                            </div>
                            {bank && <CredentialFields bank={bank} values={values} onChange={(id, value) => setValues(previous => ({ ...previous, [id]: value }))} />}
                            <label className="flex items-start gap-2 text-xs text-secondary">
                                <input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}
                                    className="mt-0.5 rounded border-subtle text-primary focus:ring-primary" />
                                <span>{t('settings:connections.banks.acknowledge')}</span>
                            </label>
                            {error && <p role="alert" className="text-xs text-negative">{error}</p>}
                            <div className="flex flex-wrap gap-2">
                                <Button type="submit" isLoading={working} disabled={working || !bank}>{t('settings:connections.banks.connect')}</Button>
                                <Button variant="ghost" disabled={working} onClick={cancel}>{t('common:buttons.cancel')}</Button>
                            </div>
                            {working && bank && <p className="text-xs text-secondary" role="status">{t('settings:connections.banks.connecting', { bank: bank.name })}</p>}
                        </form>
                    )}
                    {step.name !== 'credentials' && (
                        <>
                            {flowFor(bank?.name ?? module)}
                            {error && <p role="alert" className="text-xs text-negative">{error}</p>}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
