import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { googleOidcService } from '../services/security/googleOidcService';
import { authService } from '../services/security/authService';
import { useAuth } from '../context/AuthContext';
import { GoogleVaultRecoveryModal } from '../components/security/GoogleVaultRecoveryModal';
import { mapAuthErrorMessage } from '../services/security/authErrorMapper';

export const GoogleAuthCallback: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { loadUserFromRepo } = useAuth();

    const [error, setError] = useState<string | null>(null);
    const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const processCallback = async () => {
            try {
                // Parse hash from URL fragment (immediately scrubbing the fragment)
                const parsed = googleOidcService.parseCallbackHash();

                // Exchange with Supabase and derive/unlock/migrate Google Drive vault
                if (!authService.handleGoogleOidcCallback) {
                    throw new Error('Google authentication is not supported in this deployment mode.');
                }
                const res = await authService.handleGoogleOidcCallback(parsed);

                if (!isMounted) return;

                // Sync user into AuthContext state
                await loadUserFromRepo();

                if (res.recoveryKey) {
                    setRecoveryKey(res.recoveryKey);
                    setIsProcessing(false);
                } else {
                    navigate('/', { replace: true });
                }
            } catch (err: unknown) {
                if (!isMounted) return;
                console.error('[GoogleAuthCallback] Authentication failed', err);
                const message = err instanceof Error ? err.message : String(err);
                setError(mapAuthErrorMessage(err, t, message));
                setIsProcessing(false);
            }
        };

        processCallback();

        return () => {
            isMounted = false;
        };
    }, [navigate, loadUserFromRepo, t]);

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
                        <div className="w-10 h-10 border-2 border-brand border-t-transparent rounded-full animate-spin" />
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
