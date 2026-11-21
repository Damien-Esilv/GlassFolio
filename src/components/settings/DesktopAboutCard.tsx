import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Laptop, RefreshCw } from 'lucide-react';
import { useDesktopApp } from '../../hooks/useDesktopApp';
import { openDesktopReleasePage } from '../../services/desktop/desktopService';

/** Version of the desktop app and its update controls. Shown only inside the desktop app. */
export const DesktopAboutCard: React.FC = () => {
    const { t } = useTranslation();
    const { isDesktop, info, update, checkNow, install, setAutoCheck } = useDesktopApp();
    if (!isDesktop || !info) return null;

    const status = update?.status ?? 'idle';
    const disabled = update?.strategy === 'disabled';
    const checking = status === 'checking';
    const statusKey = ((): string => {
        if (disabled) return 'disabled';
        if (status === 'error' && update?.errorCode) return update.errorCode === 'signature' ? 'errorSignature' : 'error';
        return status;
    })();

    return (
        <div className="bg-card rounded-xl p-6 shadow-lg border border-border">
            <div className="flex items-start gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-brand flex items-center justify-center shrink-0">
                    <Laptop size={20} aria-hidden="true" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-primary">{t('desktop:about.title')}</h3>
                    <p className="text-sm text-secondary">{t('desktop:about.subtitle', { version: info.version, platform: t(`desktop:about.platforms.${info.platform}`), arch: info.arch })}</p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-secondary" role="status" aria-live="polite">
                        {status === 'available' && update?.version
                            ? t('desktop:about.status.available', { version: update.version })
                            : t(`desktop:about.status.${statusKey}`)}
                    </p>
                    <div className="flex gap-2">
                        {status === 'available' && update?.version ? (
                            <button
                                type="button"
                                onClick={() => (update.strategy === 'manual' ? void openDesktopReleasePage() : void install())}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-hover text-white transition-colors"
                            >
                                {t(update.strategy === 'manual' ? 'desktop:update.openReleasePage' : 'desktop:update.now')}
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled={disabled || checking}
                                onClick={() => void checkNow()}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-subtle text-primary border border-subtle hover:border-brand disabled:opacity-50 transition-colors"
                            >
                                {status === 'upToDate' ? <Check size={14} aria-hidden="true" /> : <RefreshCw size={14} className={checking ? 'animate-spin' : ''} aria-hidden="true" />}
                                {t('desktop:about.checkNow')}
                            </button>
                        )}
                    </div>
                </div>

                {!disabled && (
                    <div className="flex items-start justify-between gap-4 pt-4 border-t border-subtle">
                        <div>
                            <p id="desktop-auto-update-label" className="text-sm font-medium text-primary">{t('desktop:about.autoCheck.label')}</p>
                            <p className="text-xs text-secondary mt-0.5">{t('desktop:about.autoCheck.hint')}</p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={info.autoUpdateCheck}
                            aria-labelledby="desktop-auto-update-label"
                            onClick={() => void setAutoCheck(!info.autoUpdateCheck)}
                            className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${info.autoUpdateCheck ? 'bg-primary' : 'bg-subtle border border-subtle'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform ${info.autoUpdateCheck ? 'translate-x-5' : ''}`} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
