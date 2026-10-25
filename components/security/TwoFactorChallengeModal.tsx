import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Smartphone, KeyRound, Fingerprint, AlertCircle, Loader2 } from 'lucide-react';
import Button from '../Button';
import { authService } from '../../src/services/security/authService';
import { passkeyService } from '../../src/services/security/passkeyService';
import { AuthResult } from '../../src/services/security/authTypes';

interface TwoFactorChallengeModalProps {
    isOpen: boolean;
    onSuccess: (result: AuthResult) => void;
    onCancel: () => void;
}

export const TwoFactorChallengeModal: React.FC<TwoFactorChallengeModalProps> = ({
    isOpen,
    onSuccess,
    onCancel,
}) => {
    const { t } = useTranslation(['security', 'auth']);
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isPasskeySupported, setIsPasskeySupported] = useState(false);

    useEffect(() => {
        passkeyService.isSupported().then(setIsPasskeySupported).catch(() => setIsPasskeySupported(false));
    }, []);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanCode = code.trim().replace(/[\s-]/g, '');
        if (!cleanCode) return;

        setError(null);
        setIsLoading(true);

        try {
            if (!authService.verifySecondFactor) {
                throw new Error('Second factor verification is not supported.');
            }
            const result = await authService.verifySecondFactor(cleanCode);
            onSuccess(result);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t('security:totp.invalidCode'));
        } finally {
            setIsLoading(false);
        }
    };

    const handlePasskeyAuth = async () => {
        setError(null);
        setIsLoading(true);
        try {
            await passkeyService.authenticate();
            const user = await authService.getCurrentUser();
            if (user) {
                onSuccess({
                    user,
                    session: {
                        id: `sess-${Date.now()}`,
                        userId: user.id,
                        createdAt: new Date().toISOString(),
                        lastSeenAt: new Date().toISOString(),
                        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node',
                        deviceLabel: 'Passkey Authenticated',
                    },
                });
            } else {
                throw new Error(t('security:lockScreen.invalidCredentials'));
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t('security:lockScreen.invalidCredentials'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="relative w-full max-w-md p-6 rounded-2xl bg-card border border-subtle shadow-2xl space-y-6">
                <div className="flex items-center space-x-3">
                    <div className="p-3 rounded-xl bg-subtle border border-subtle text-primary">
                        <Smartphone size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-primary">
                            {t('security:totp.challengeTitle', 'Two-Factor Authentication')}
                        </h3>
                        <p className="text-xs text-subtle">
                            {t('security:totp.challengeSubtitle', 'Enter the 6-digit code from your authenticator app or an emergency backup code.')}
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="flex items-center space-x-2 p-3 text-xs rounded-xl bg-negative/10 border border-negative/20 text-negative">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-subtle uppercase tracking-wider mb-1">
                            {t('security:totp.inputLabel', 'Security Code or Backup Code')}
                        </label>
                        <div className="relative">
                            <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                            <input
                                type="text"
                                autoFocus
                                autoComplete="one-time-code"
                                placeholder={t('security:totp.inputPlaceholder', '000000 or XXXX-XXXX')}
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-subtle text-primary border border-subtle focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm font-mono tracking-widest text-center"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-2">
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={isLoading || !code.trim()}
                            className="w-full justify-center"
                        >
                            {isLoading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <ShieldCheck size={16} className="mr-2" />
                            )}
                            {t('security:totp.verifyButton', 'Verify & Sign In')}
                        </Button>

                        {isPasskeySupported && (
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handlePasskeyAuth}
                                disabled={isLoading}
                                className="w-full justify-center"
                            >
                                <Fingerprint size={16} className="mr-2" />
                                {t('security:passkeys.authWithPasskey', 'Authenticate with Passkey')}
                            </Button>
                        )}

                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onCancel}
                            disabled={isLoading}
                            className="w-full justify-center text-subtle"
                        >
                            {t('security:totp.cancelButton', 'Cancel')}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};
