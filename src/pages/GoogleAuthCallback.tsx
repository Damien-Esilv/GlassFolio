import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { googleOidcService } from '../services/security/googleOidcService';
import type { AuthResult } from '../services/security/authTypes';
import { useAuth } from '../context/AuthContext';
import { GoogleVaultRecoveryModal } from '../components/security/GoogleVaultRecoveryModal';
import { TwoFactorChallengeModal } from '../components/security/TwoFactorChallengeModal';
import { AppThinkingOrb } from '../components/ui/AppThinkingOrb';
import { mapAuthErrorMessage } from '../services/security/authErrorMapper';
import { runGoogleCallbackOnce } from '../services/security/googleCallbackRun';

export const GoogleAuthCallback: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { loadUserFromRepo, handleGoogleCallback, pendingSecondFactor, cancelSecondFactor } = useAuth();

    const [error, setError] = useState<string | null>(null);
    const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
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
        const message = err instanceof Error ? err.message : String(err);
        setError(mapAuthErrorMessage(err, t, message));
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

        // Exchange with Supabase, then derive/unlock/migrate the Google Drive vault. An account
        // with a second factor stops here until the code (or passkey) is verified.
        const run = runGoogleCallbackOnce(async () => handleGoogleCallback(googleOidcService.parseCallbackHash()));

        run.then(async (res) => {
            if (!active) return;
            if (res.requiresTwoFactor) {
                setIsProcessing(false);
                return;
            }
            await finishSignIn(res);
        }).catch((err: unknown) => {
            if (active) reportFailure(err);
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
        navigate('/', { replace: true });
    };

    const handleRetry = () => {
        navigate('/login', { replace: true });
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
            <div className="relative w-full max-w-md bg-card border border-subtle rounded-2xl p-8 shadow-2xl text-center">
                {isProcessing && (
                    <div className="flex flex-col items-center justify-center space-y-4 py-8">
                        <AppThinkingOrb
                            state="searching"
                            size={72}
                            label={t('auth:googleCallback.processingTitle', 'Connexion Google sécurisée')}
                        />
                        <h2 className="text-sm font-semibold text-primary">
                            {t('auth:googleCallback.processingTitle', 'Connexion Google sécurisée')}
                        </h2>
                        <p className="text-xs text-secondary max-w-xs">
                            {t('auth:googleCallback.processingDescription', 'Déverrouillage de votre coffre chiffré de bout en bout...')}
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
                                {t('auth:googleCallback.errorTitle', 'Échec de connexion Google')}
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
                                <span>{t('auth:googleCallback.retryButton', 'Réessayer la connexion')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate('/login', { replace: true })}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-subtle text-secondary hover:text-primary rounded-xl text-xs font-medium transition-colors border border-subtle"
                            >
                                <ArrowLeft size={14} />
                                <span>{t('auth:googleCallback.backToLogin', 'Retour à l’écran de connexion')}</span>
                            </button>
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
