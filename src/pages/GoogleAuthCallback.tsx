import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { googleOidcService, type GoogleCallbackResult, type GoogleCeremonyIntent } from '../services/security/googleOidcService';
import type { AuthResult } from '../services/security/authTypes';
import { useAuth } from '../context/AuthContext';
import { GoogleVaultRecoveryModal } from '../components/security/GoogleVaultRecoveryModal';
import { TwoFactorChallengeModal } from '../components/security/TwoFactorChallengeModal';
import { AppThinkingOrb } from '../components/ui/AppThinkingOrb';
import { mapAuthErrorMessage } from '../services/security/authErrorMapper';
import { getGoogleCallbackIntent, runGoogleCallbackOnce } from '../services/security/googleCallbackRun';

/** What the Google round trip produced; failures of the other intents are reported with their intent. */
type CallbackOutcome =
    | { kind: 'sign-in'; res: AuthResult }
    | { kind: 'account-deleted' }
    | { kind: 'recovery-key'; recoveryKey: string }
    | { kind: 'step-up'; returnTo: string }
    | { kind: 'failed'; intent: GoogleCeremonyIntent; error: unknown };

export const GoogleAuthCallback: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const {
        loadUserFromRepo,
        handleGoogleCallback,
        handleGoogleAccountDeletion,
        createGoogleRecoveryKey,
        confirmGoogleStepUp,
        deleteAccount,
        pendingSecondFactor,
        cancelSecondFactor,
    } = useAuth();
    const intent = useState<GoogleCeremonyIntent>(() => getGoogleCallbackIntent(() => googleOidcService.peekCeremonyIntent()))[0];

    const [error, setError] = useState<string | null>(null);
    const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
    const [failedIntent, setFailedIntent] = useState<GoogleCeremonyIntent>('sign-in');
    const [isProcessing, setIsProcessing] = useState(true);

    // The URL fragment is single-use (it is scrubbed when parsed), so the callback runs once per page
    // load (runGoogleCallbackOnce). This page itself can be mounted more than once: StrictMode, and the
    // app shell swapping layout as soon as the user is signed in. Each mount only attaches to that run.
    const isMountedRef = useRef(true);
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const reportFailure = (err: unknown): void => {
        if (!isMountedRef.current) return;
        console.error('[GoogleAuthCallback] Authentication failed', err);
        // Unmapped errors get a generic message: raw (English, internal) text is never shown
        setError(mapAuthErrorMessage(err, t, 'common:errors.auth.actionFailed'));
        setIsProcessing(false);
    };

    /** The vault is unlocked: load the profile, then show the recovery key once if one was created. */
    const finishSignIn = async (res: AuthResult): Promise<void> => {
        try {
            await loadUserFromRepo();
            if (!isMountedRef.current) return;
            if (res.recoveryKey) {
                setRecoveryKey(res.recoveryKey);
                setIsProcessing(false);
            } else {
                navigate('/', { replace: true });
            }
        } catch (err: unknown) {
            reportFailure(err);
        }
    };

    useEffect(() => {
        let active = true;

        const start = async (): Promise<CallbackOutcome> => {
            let parsed: GoogleCallbackResult;
            try {
                parsed = googleOidcService.parseCallbackHash();
            } catch (error) {
                return { kind: 'failed', intent: 'sign-in', error };
            }
            const parsedIntent = parsed.intent ?? 'sign-in';
            try {
                if (parsedIntent === 'delete-account') {
                    await handleGoogleAccountDeletion(parsed);
                    return { kind: 'account-deleted' };
                }
                if (parsedIntent === 'recovery-key') {
                    return { kind: 'recovery-key', recoveryKey: await createGoogleRecoveryKey(parsed) };
                }
                if (parsedIntent === 'step-up') {
                    await confirmGoogleStepUp(parsed);
                    return { kind: 'step-up', returnTo: parsed.returnTo ?? '/settings' };
                }
                // Exchange with Supabase, then derive/unlock/migrate the Google Drive vault. An account
                // with a second factor stops here until the code (or passkey) is verified.
                return { kind: 'sign-in', res: await handleGoogleCallback(parsed) };
            } catch (error) {
                return { kind: 'failed', intent: parsedIntent, error };
            }
        };

        void runGoogleCallbackOnce(start).then(async (outcome) => {
            if (!active) return;
            switch (outcome.kind) {
                case 'failed':
                    setFailedIntent(outcome.intent);
                    reportFailure(outcome.error);
                    return;
                case 'account-deleted':
                    navigate('/login', { replace: true });
                    return;
                case 'step-up':
                    navigate(outcome.returnTo, { replace: true });
                    return;
                case 'recovery-key':
                    setRecoveryKey(outcome.recoveryKey);
                    setIsProcessing(false);
                    return;
                case 'sign-in':
                    if (outcome.res.requiresTwoFactor) {
                        setIsProcessing(false);
                        return;
                    }
                    await finishSignIn(outcome.res);
                    return;
            }
        });

        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- single-use callback, see runGoogleCallbackOnce
    }, []);

    const handleSecondFactorCancelled = async (): Promise<void> => {
        await cancelSecondFactor();
        navigate('/login', { replace: true });
    };

    const handleRecoveryConfirmed = () => {
        setRecoveryKey(null);
        navigate(intent === 'recovery-key' ? '/settings?tab=security' : '/', { replace: true });
    };

    const handleRetry = () => {
        navigate(failedIntent === 'sign-in' ? '/login' : '/settings?tab=security', { replace: true });
    };

    /** The Drive key file could not be removed: the user may still choose to delete the account without it. */
    const handleDeleteAnyway = async (): Promise<void> => {
        setError(null);
        setIsProcessing(true);
        try {
            await deleteAccount({ confirmationText: 'DELETE' });
            navigate('/login', { replace: true });
        } catch (err: unknown) {
            reportFailure(err);
        }
    };

    const processingKey = intent === 'delete-account' ? 'deleting' : intent === 'recovery-key' ? 'recovery' : intent === 'step-up' ? 'stepUp' : 'processing';

    return (
        <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
            <div className="relative w-full max-w-md bg-card border border-subtle rounded-2xl p-8 shadow-2xl text-center">
                {isProcessing && (
                    <div className="flex flex-col items-center justify-center space-y-4 py-8">
                        <AppThinkingOrb
                            state="searching"
                            size={72}
                            label={t(`auth:googleCallback.${processingKey}Title`)}
                        />
                        <h2 className="text-sm font-semibold text-primary">
                            {t(`auth:googleCallback.${processingKey}Title`)}
                        </h2>
                        <p className="text-xs text-secondary max-w-xs">
                            {t(`auth:googleCallback.${processingKey}Description`)}
                        </p>
                    </div>
                )}

                {error && (
                    <div className="space-y-4 py-4">
                        <div className="w-12 h-12 mx-auto rounded-xl bg-error/10 border border-error/20 text-error flex items-center justify-center">
                            <AlertCircle size={24} />
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-base font-bold text-primary">
                                {failedIntent === 'sign-in' ? t('auth:googleCallback.errorTitle') : t('auth:googleCallback.errorTitleAction')}
                            </h2>
                            <p className="text-xs text-secondary leading-relaxed">
                                {error}
                            </p>
                        </div>
                        <div className="pt-2 flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={handleRetry}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand text-white rounded-xl text-xs font-semibold hover:bg-brand/90 transition-colors shadow-sm"
                            >
                                <RefreshCw size={14} />
                                <span>
                                    {failedIntent === 'sign-in'
                                        ? t('auth:googleCallback.retryButton')
                                        : t('auth:googleCallback.backToSettings')}
                                </span>
                            </button>
                            {failedIntent === 'delete-account' && (
                                <button
                                    type="button"
                                    onClick={() => void handleDeleteAnyway()}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-error/10 text-error hover:bg-error/20 rounded-xl text-xs font-medium transition-colors border border-error/20"
                                >
                                    <span>{t('auth:googleCallback.deleteAnyway')}</span>
                                </button>
                            )}
                            {failedIntent === 'sign-in' && (
                            <button
                                    type="button"
                                    onClick={() => navigate('/login', { replace: true })}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-subtle text-secondary hover:text-primary rounded-xl text-xs font-medium transition-colors border border-subtle"
                                >
                                    <ArrowLeft size={14} />
                                    <span>{t('auth:googleCallback.backToLogin')}</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {pendingSecondFactor && !error && (
                    <TwoFactorChallengeModal
                        isOpen
                        methods={pendingSecondFactor}
                        onVerified={(res) => {
                            setIsProcessing(true);
                            void finishSignIn(res);
                        }}
                        onCancel={() => {
                            void handleSecondFactorCancelled();
                        }}
                    />
                )}

                {recoveryKey && (
                    <GoogleVaultRecoveryModal
                        isOpen={Boolean(recoveryKey)}
                        recoveryKey={recoveryKey}
                        onConfirmed={handleRecoveryConfirmed}
                    />
                )}
            </div>
        </div>
    );
};
