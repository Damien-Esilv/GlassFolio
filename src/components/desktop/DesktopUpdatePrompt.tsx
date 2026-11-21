import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { useDesktopApp } from '../../hooks/useDesktopApp';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { openDesktopReleasePage } from '../../services/desktop/desktopService';

/**
 * Offers a new version of the desktop app as soon as the shell finds one (at launch and every few hours).
 * Nothing is installed without a click: "Update now" downloads, installs and restarts; "Later" hides it for this session.
 * Renders nothing outside the desktop app.
 */
export const DesktopUpdatePrompt: React.FC = () => {
    const { t } = useTranslation();
    const { isDesktop, update, install } = useDesktopApp();
    const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
    const [installRequested, setInstallRequested] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);

    const status = update?.status;
    const version = update?.version ?? null;
    const busy = status === 'downloading' || status === 'restarting';
    const failed = installRequested && status === 'error' && version !== null;
    const offered = status === 'available' && version !== null && dismissedVersion !== version;
    const open = isDesktop && (offered || busy || failed);

    useEscapeKey(() => {
        if (!busy && version) setDismissedVersion(version);
    }, open);
    useFocusTrap(dialogRef, open);

    if (!open || !update || !version) return null;

    const manual = update.strategy === 'manual';
    const percent = Math.round((update.progress ?? 0) * 100);

    const body = (): string => {
        if (status === 'restarting') return t('desktop:update.restarting');
        if (status === 'downloading') return t('desktop:update.downloading', { percent });
        if (failed) return t(`desktop:update.errors.${update.errorCode === 'checksum' || update.errorCode === 'size' ? 'verification' : 'generic'}`);
        return t(manual ? 'desktop:update.bodyManual' : 'desktop:update.body');
    };

    return createPortal(
        <div className="fixed inset-0 z-[100060] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" role="presentation">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="desktop-update-title"
                className="w-full max-w-md bg-card border border-subtle rounded-2xl p-6 shadow-2xl space-y-4"
            >
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-brand flex items-center justify-center shrink-0">
                        {busy ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <Download size={20} aria-hidden="true" />}
                    </div>
                    <div className="space-y-1">
                        <h2 id="desktop-update-title" className="text-base font-semibold text-primary">
                            {t('desktop:update.title', { version })}
                        </h2>
                        <p className="text-sm text-secondary" aria-live="polite">{body()}</p>
                    </div>
                </div>

                {status === 'downloading' && (
                    <div
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                        aria-label={t('desktop:update.progressLabel')}
                        className="h-2 rounded-full bg-subtle overflow-hidden"
                    >
                        <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
                    </div>
                )}

                {!busy && (
                    <div className="flex flex-wrap justify-end gap-2">
                        {failed ? (
                            <button
                                type="button"
                                onClick={() => void openDesktopReleasePage()}
                                className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-hover text-white transition-colors"
                            >
                                {t('desktop:update.openReleasePage')}
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setDismissedVersion(version)}
                                    className="px-4 py-2 rounded-xl text-sm font-semibold text-secondary hover:text-primary hover:bg-subtle transition-colors"
                                >
                                    {t('desktop:update.later')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setInstallRequested(true);
                                        void install();
                                    }}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-hover text-white transition-colors"
                                >
                                    <RefreshCw size={14} aria-hidden="true" />
                                    {t(manual ? 'desktop:update.openReleasePage' : 'desktop:update.now')}
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
};
