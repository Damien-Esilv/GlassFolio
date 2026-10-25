import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, KeyRound, Loader2, MailCheck, ShieldCheck } from 'lucide-react';
import { authService } from '../src/services/security/authService';
import { mapAuthErrorMessage } from '../src/services/security/authErrorMapper';
import { getAuthCapabilities } from '../src/services/security/authCapabilities';
import { EmailTokenHashType } from '../src/services/security/authTypes';

type ConfirmStatus =
    | 'verifying'
    | 'handedOff'
    | 'signInToFinish'
    | 'recovery'
    | 'emailChangePending'
    | 'emailChangeSuccess'
    | 'magicLink'
    | 'invite'
    | 'error';

/** How long to wait for the sign-up tab to acknowledge the verified address. */
const HANDOFF_TIMEOUT_MS = 1500;

/**
 * Tells a sign-up tab of this browser that the address is verified and resolves to whether one
 * answered. That tab holds the password and creates the vault; no token crosses tabs.
 */
const notifySignupTab = (email: string): Promise<boolean> => new Promise((resolve) => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
        resolve(false);
        return;
    }
    const channel = new BroadcastChannel('glassfolio_auth_channel');
    const timer = window.setTimeout(() => {
        channel.close();
        resolve(false);
    }, HANDOFF_TIMEOUT_MS);
    channel.onmessage = (event) => {
        if (event.data?.type !== 'EMAIL_VERIFIED_ACK') return;
        window.clearTimeout(timer);
        channel.close();
        resolve(true);
    };
    channel.postMessage({ type: 'EMAIL_VERIFIED', email });
});

const parseType = (raw: string | null): EmailTokenHashType => {
    switch (raw) {
        case 'email_change': return 'email_change';
        case 'recovery': return 'recovery';
        case 'magiclink': return 'magiclink';
        case 'invite': return 'invite';
        case 'email': return 'email';
        default: return 'signup';
    }
};

/**
 * Landing page of branded email confirmation links (Epic E25 — TGLA-085).
 * Link format: /auth/confirm?token_hash=...&type=signup|recovery|email_change|magiclink|invite
 */
export const AuthConfirm: React.FC = () => {
    const { t } = useTranslation('auth');
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState<ConfirmStatus>('verifying');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    // Token hashes are single-use: guard against the React StrictMode double effect.
    const hasStartedRef = useRef(false);

    useEffect(() => {
        if (hasStartedRef.current) return;
        hasStartedRef.current = true;

        if (!getAuthCapabilities().emailVerification) {
            setErrorMessage(t('confirm.localModeUnavailable'));
            setStatus('error');
            return;
        }

        const tokenHash = searchParams.get('token_hash');
        if (!tokenHash || !authService.verifyEmailTokenHash) {
            setErrorMessage(t('confirm.invalidLink'));
            setStatus('error');
            return;
        }

        const confirmType = parseType(searchParams.get('type'));

        authService
            .verifyEmailTokenHash(tokenHash, confirmType)
            .then(async (result) => {
                if (result.type === 'recovery') {
                    setStatus('recovery');
                    return;
                }
                if (result.type === 'email_change') {
                    setStatus(result.hasSession ? 'emailChangeSuccess' : 'emailChangePending');
                    return;
                }
                if (result.type === 'magiclink') {
                    setStatus('magicLink');
                    return;
                }
                if (result.type === 'invite') {
                    setStatus('invite');
                    return;
                }
                setStatus((await notifySignupTab(result.email)) ? 'handedOff' : 'signInToFinish');
            })
            .catch((err: unknown) => {
                const rawMsg = err instanceof Error ? err.message : '';
                if (/expired/i.test(rawMsg)) {
                    setErrorMessage(t('confirm.otpExpired'));
                } else {
                    setErrorMessage(mapAuthErrorMessage(err, t, 'auth:confirm.invalidLink'));
                }
                setStatus('error');
            });
    }, [searchParams, t]);

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-canvas">
            <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-card border border-subtle shadow-2xl space-y-6 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
                    {status === 'verifying' && <Loader2 size={32} className="animate-spin" />}
                    {(status === 'handedOff' || status === 'signInToFinish' || status === 'emailChangeSuccess') && (
                        <CheckCircle2 size={32} />
                    )}
                    {status === 'recovery' && <KeyRound size={32} />}
                    {(status === 'emailChangePending' || status === 'magicLink' || status === 'invite') && (
                        <ShieldCheck size={32} />
                    )}
                    {status === 'error' && <MailCheck size={32} />}
                </div>

                <h2 className="text-xl font-bold text-primary">
                    {status === 'verifying' || status === 'error'
                        ? t(`confirm.${status}Title`)
                        : t(`confirm.${status}Title`, t('confirm.successTitle'))}
                </h2>

                {status === 'verifying' && <p className="text-sm text-subtle">{t('confirm.verifyingSubtitle')}</p>}
                {status === 'handedOff' && <p className="text-sm text-subtle">{t('confirm.handedOffSubtitle')}</p>}

                {status === 'signInToFinish' && (
                    <>
                        <p className="text-sm text-subtle">{t('confirm.signInToFinishSubtitle')}</p>
                        <Link to="/login" className="inline-block text-sm font-semibold text-brand hover:underline">
                            {t('confirm.signInButton')}
                        </Link>
                    </>
                )}

                {status === 'recovery' && (
                    <>
                        <p className="text-sm text-subtle">{t('confirm.recoverySubtitle')}</p>
                        <Link
                            to="/reset-password?mode=recover"
                            className="inline-block px-5 py-2.5 rounded-xl bg-primary text-inverted font-semibold text-sm hover:opacity-90 transition-opacity"
                        >
                            {t('confirm.proceedToReset')}
                        </Link>
                    </>
                )}

                {status === 'emailChangePending' && (
                    <>
                        <p className="text-sm text-subtle">{t('confirm.emailChangePendingSubtitle')}</p>
                        <Link to="/login" className="inline-block text-sm font-semibold text-brand hover:underline">
                            {t('confirm.backToLogin')}
                        </Link>
                    </>
                )}

                {status === 'emailChangeSuccess' && (
                    <>
                        <p className="text-sm text-subtle">{t('confirm.emailChangeSuccessSubtitle')}</p>
                        <Link to="/login" className="inline-block text-sm font-semibold text-brand hover:underline">
                            {t('confirm.signInButton')}
                        </Link>
                    </>
                )}

                {status === 'magicLink' && (
                    <>
                        <p className="text-sm text-subtle">{t('confirm.magicLinkSubtitle')}</p>
                        <Link to="/portfolio" className="inline-block text-sm font-semibold text-brand hover:underline">
                            {t('confirm.signInButton')}
                        </Link>
                    </>
                )}

                {status === 'invite' && (
                    <>
                        <p className="text-sm text-subtle">{t('confirm.inviteSubtitle')}</p>
                        <Link
                            to="/reset-password?mode=recover"
                            className="inline-block px-5 py-2.5 rounded-xl bg-primary text-inverted font-semibold text-sm hover:opacity-90 transition-opacity"
                        >
                            {t('confirm.inviteButton')}
                        </Link>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div className="flex items-center space-x-2 p-3 text-xs rounded-xl bg-negative/10 border border-negative/20 text-negative text-left">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>{errorMessage}</span>
                        </div>
                        <Link to="/login" className="inline-block text-sm font-semibold text-brand hover:underline">
                            {t('confirm.backToLogin')}
                        </Link>
                    </>
                )}
            </div>
        </div>
    );
};

export default AuthConfirm;
