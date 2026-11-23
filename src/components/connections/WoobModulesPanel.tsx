import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, ChevronRight, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import Button from '../Button';
import { woobClient, WoobError, type WoobModuleSource, type WoobStatus } from '../../services/connectors';

/** The worker restarts to load other modules: the status is read again after this delay. */
const RESTART_DELAY_MS = 3_000;

const shortCommit = (commit: string | null | undefined): string => (commit ? commit.slice(0, 7) : '—');

/**
 * Settings → Connections → French banks → Advanced (TGLA-241): where the bank modules come from.
 * Verified modules by default (bumped every week through a reviewed pull request); Woob's latest modules on
 * request, after a warning the user must accept: code GlassFolio has not checked then runs with bank credentials.
 * Deliberately not offered to the AI assistant.
 */
export const WoobModulesPanel: React.FC<{ status: WoobStatus; onChanged: () => Promise<void> }> = ({ status, onChanged }) => {
    const { t, i18n } = useTranslation();
    const [confirming, setConfirming] = useState(false);
    const [accepted, setAccepted] = useState(false);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');
    const source: WoobModuleSource = status.modules ?? { channel: 'verified', active: 'verified' };

    const formatDate = (iso: string | null | undefined): string =>
        iso ? new Date(iso).toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium' }) : '—';

    const run = async (action: () => Promise<WoobModuleSource>): Promise<void> => {
        setError('');
        setWorking(true);
        try {
            const result = await action();
            if (result.restarting) await new Promise(resolve => setTimeout(resolve, RESTART_DELAY_MS));
            setConfirming(false);
            setAccepted(false);
            await onChanged();
        } catch (caught) {
            setError(t('settings:connections.banks.modules.failed', { detail: caught instanceof WoobError ? caught.detail || caught.workerCode : '' }));
        } finally {
            setWorking(false);
        }
    };

    return (
        <details className="mt-6 border-t border-border pt-4 group">
            {/* The app's chevron instead of the browser's triangle */}
            <summary className="flex items-center gap-1.5 text-sm font-medium text-secondary hover:text-primary cursor-pointer select-none list-none rounded [&::-webkit-details-marker]:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <ChevronRight size={16} className="text-tertiary transition-transform group-open:rotate-90" aria-hidden="true" />
                {t('settings:connections.banks.modules.title')}
            </summary>
            <div className="mt-4 space-y-4 text-sm">
                <p className="text-secondary">{t('settings:connections.banks.modules.intro')}</p>
                {/* Two explicit choices, each saying where the modules come from and how they are updated */}
                <div role="radiogroup" aria-label={t('settings:connections.banks.modules.choice')} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(['verified', 'latest'] as const).map(channel => {
                        const selected = source.channel === channel;
                        const Icon = channel === 'verified' ? ShieldCheck : Zap;
                        return (
                            <button key={channel} type="button" role="radio" aria-checked={selected} disabled={working}
                                onClick={() => {
                                    if (selected) return;
                                    if (channel === 'latest') setConfirming(true);
                                    else void run(() => woobClient.setModules('verified'));
                                }}
                                className={`text-left rounded-lg border p-4 space-y-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? 'border-primary bg-subtle' : 'border-border hover:bg-card-hover'}`}>
                                <span className="flex items-center gap-2">
                                    <Icon size={16} className={channel === 'verified' ? 'text-positive' : 'text-warning'} aria-hidden="true" />
                                    <span className="font-medium text-primary flex-1">{t(`settings:connections.banks.modules.${channel}Title`)}</span>
                                    {selected && (
                                        <span className="inline-flex items-center gap-1 text-xs text-positive">
                                            <CheckCircle2 size={14} aria-hidden="true" />
                                            {t('settings:connections.banks.modules.inUse')}
                                        </span>
                                    )}
                                </span>
                                <span className="block text-xs text-secondary">{t(`settings:connections.banks.modules.${channel}Desc`)}</span>
                            </button>
                        );
                    })}
                </div>

                {source.active === 'latest' ? (
                    <p className="flex items-start gap-2 text-primary">
                        <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{t('settings:connections.banks.modules.latestActive', { commit: shortCommit(source.commit), date: formatDate(source.commitDate), updated: formatDate(source.updatedAt) })}</span>
                    </p>
                ) : (
                    <p className="flex items-start gap-2 text-primary">
                        <ShieldCheck size={16} className="text-positive shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{t('settings:connections.banks.modules.verifiedActive', { commit: shortCommit(status.commit), date: formatDate(status.commitDate) })}</span>
                    </p>
                )}
                {source.active === 'latest' && (source.keptVerified?.length ?? 0) > 0 && (
                    <p className="text-xs text-tertiary">{t('settings:connections.banks.modules.keptVerified', { count: source.keptVerified?.length ?? 0 })}</p>
                )}
                {source.lastError && <p className="text-xs text-warning">{t('settings:connections.banks.modules.lastError', { detail: source.lastError })}</p>}

                {source.channel === 'latest' && (
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" isLoading={working} disabled={working} onClick={() => void run(() => woobClient.updateModules())}>
                            <RefreshCw size={14} className="mr-1.5" aria-hidden="true" />
                            {t('settings:connections.banks.modules.updateNow')}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={working} onClick={() => void run(() => woobClient.setModules('verified'))}>
                            {t('settings:connections.banks.modules.backToVerified')}
                        </Button>
                    </div>
                )}
                {source.channel !== 'latest' && confirming && (
                    <div className="space-y-3 rounded-lg p-3 bg-warning-subtle" role="group" aria-label={t('settings:connections.banks.modules.latestTitle')}>
                        <p className="flex items-start gap-2 text-primary">
                            <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
                            <span>{t('settings:connections.banks.modules.warning')}</span>
                        </p>
                        <label className="flex items-start gap-2 text-xs text-primary">
                            <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)}
                                className="mt-0.5 rounded border-subtle text-primary focus:ring-primary" />
                            <span>{t('settings:connections.banks.modules.accept')}</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="danger" isLoading={working} disabled={!accepted || working} onClick={() => void run(() => woobClient.setModules('latest'))}>
                                {t('settings:connections.banks.modules.enable')}
                            </Button>
                            <Button size="sm" variant="ghost" disabled={working} onClick={() => { setConfirming(false); setAccepted(false); }}>
                                {t('common:buttons.cancel')}
                            </Button>
                        </div>
                    </div>
                )}
                {working && <p className="text-xs text-secondary" role="status">{t('settings:connections.banks.modules.working')}</p>}
                {error && <p role="alert" className="text-xs text-negative">{error}</p>}
            </div>
        </details>
    );
};
