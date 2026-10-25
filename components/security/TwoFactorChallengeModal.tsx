import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Smartphone, KeyRound, Fingerprint, AlertCircle, Loader2 } from 'lucide-react';
import Button from '../Button';
import { useAuth } from '../../context/AuthContext';
import { getAuthCapabilities } from '../../src/services/security/authCapabilities';
import { SecondFactorMethod } from '../../src/services/security/authTypes';
import { mapAuthErrorMessage } from '../../src/services/security/authErrorMapper';

interface TwoFactorChallengeModalProps {
    isOpen: boolean;
    /** Second factors this account can use; the sign-in completes in AuthContext. */
    methods: SecondFactorMethod[];
    onCancel: () => void;
}

export const TwoFactorChallengeModal: React.FC<TwoFactorChallengeModalProps> = ({
    isOpen,
    methods,
    onCancel,
}) => {
    const { t } = useTranslation(['security', 'auth']);
    const { completeSecondFactor, completeSecondFactorWithPasskey } = useAuth();
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const hasTotp = methods.includes('totp');
    const hasPasskey = methods.includes('passkey');
    const { backupCodes } = getAuthCapabilities();

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanCode = code.trim().replace(/[\s-]/g, '');
        if (!cleanCode) return;

        setError(null);
        setIsLoading(true);
        try {
            await completeSecondFactor(cleanCode);
        } catch (err: unknown) {
            setError(mapAuthErrorMessage(err, t, 'security:totp.invalidCode'));
        } finally {
            setIsLoading(false);
        }
    };

    const handlePasskeyAuth = async () => {
        setError(null);
        setIsLoading(true);
        try {
            await completeSecondFactorWithPasskey();
        } catch (err: unknown) {
            setError(mapAuthErrorMessage(err, t, 'common:errors.passkey.FAILED'));
        } finally {
            setIsLoading(false);
        }
    };

    let subtitle = t('security:passkeys.challengeSubtitle');
    if (hasTotp) {
        subtitle = backupCodes ? t('security:totp.challengeSubtitle') : t('security:totp.challengeSubtitleNoBackup');
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="relative w-full max-w-md p-6 rounded-2xl bg-card border border-subtle shadow-2xl space-y-6">
                <div className="flex items-center space-x-3">
                    <div className="p-3 rounded-xl bg-subtle border border-subtle text-primary">
                        <Smartphone size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-primary">
                            {t('security:totp.challengeTitle')}
                        </h3>
                        <p className="text-xs text-subtle">{subtitle}</p>
                    </div>
                </div>

                {error && (
                    <div className="flex items-center space-x-2 p-3 text-xs rounded-xl bg-negative/10 border border-negative/20 text-negative">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {hasTotp && (
                        <div>
                            <label className="block text-xs font-semibold text-subtle uppercase tracking-wider mb-1">
                                {backupCodes ? t('security:totp.inputLabel') : t('security:totp.inputLabelNoBackup')}
                            </label>
                            <div className="relative">
                                <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                                <input
                                    type="text"
                                    autoFocus
                                    autoComplete="one-time-code"
                                    placeholder={backupCodes ? t('security:totp.inputPlaceholder') : t('security:totp.codePlaceholder')}
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-subtle text-primary border border-subtle focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm font-mono tracking-widest text-center"
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col gap-2 pt-2">
                        {hasTotp && (
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
                                {t('security:totp.verifyButton')}
                            </Button>
                        )}

                        {hasPasskey && (
                            <Button
                                type="button"
                                variant={hasTotp ? 'secondary' : 'primary'}
                                onClick={handlePasskeyAuth}
                                disabled={isLoading}
                                className="w-full justify-center"
                            >
                                <Fingerprint size={16} className="mr-2" />
                                {t('security:passkeys.authWithPasskey')}
                            </Button>
                        )}

                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onCancel}
                            disabled={isLoading}
                            className="w-full justify-center text-subtle"
                        >
                            {t('security:totp.cancelButton')}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};
