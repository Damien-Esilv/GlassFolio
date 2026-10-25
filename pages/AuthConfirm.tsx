import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import { authService } from '../src/services/security/authService';

type ConfirmStatus = 'verifying' | 'success' | 'error';
type ConfirmType = 'signup' | 'email_change';

const REDIRECT_DELAY_MS = 1200;

const parseType = (raw: string | null): ConfirmType => (raw === 'email_change' ? 'email_change' : 'signup');

/**
 * Landing page of the branded confirmation email link (Epic E25 — TGLA-085).
 * Link format: /auth/confirm?token_hash=...&type=signup
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

        const tokenHash = searchParams.get('token_hash');
        if (!tokenHash || !authService.verifyEmailTokenHash) {
            setErrorMessage(t('confirm.invalidLink'));
            setStatus('error');
            return;
        }

        authService
            .verifyEmailTokenHash(tokenHash, parseType(searchParams.get('type')))
            .then(() => {
                setStatus('success');
                // Notify any open tab (like the signup/EmailVerificationGate tab) that email is verified
                if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
                    try {
                        const channel = new BroadcastChannel('glassfolio_auth_channel');
                        channel.postMessage({ type: 'EMAIL_VERIFIED' });
                        channel.close();
                    } catch {
                        // Best effort cross-tab broadcast
                    }
                }
                // Full reload or redirect so AuthContext picks up the freshly persisted session.
                window.setTimeout(() => window.location.assign('/'), REDIRECT_DELAY_MS);
            })
            .catch((err: unknown) => {
                setErrorMessage(err instanceof Error ? err.message : t('confirm.invalidLink'));
                setStatus('error');
            });
    }, [searchParams, t]);

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-canvas">
            <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-card border border-subtle shadow-2xl space-y-6 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
                    {status === 'verifying' && <Loader2 size={32} className="animate-spin" />}
                    {status === 'success' && <CheckCircle2 size={32} />}
                    {status === 'error' && <MailCheck size={32} />}
                </div>
                <h2 className="text-xl font-bold text-primary">{t(`confirm.${status}Title`)}</h2>
                {status === 'verifying' && <p className="text-sm text-subtle">{t('confirm.verifyingSubtitle')}</p>}
                {status === 'success' && <p className="text-sm text-subtle">{t('confirm.successSubtitle')}</p>}
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
