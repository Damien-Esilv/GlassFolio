import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Smartphone, KeyRound, Fingerprint, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import Button from '../Button';
import { useAuth } from '../../context/AuthContext';
import { getAuthCapabilities } from '../../services/security/authCapabilities';
import { AuthResult, SecondFactorMethod, TotpChallengeFactor } from '../../services/security/authTypes';
import { mapAuthErrorMessage } from '../../services/security/authErrorMapper';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { PasswordManagerUsernameField } from './PasswordManagerUsernameField';

interface TwoFactorChallengeModalProps {
    isOpen: boolean;
    /** Second factors this account can use; the sign-in completes in AuthContext. */
    methods: SecondFactorMethod[];
    /** Optional explicit list of TOTP factors (defaults to AuthContext.pendingTotpFactors). */
    totpFactors?: TotpChallengeFactor[];
    /** Active vault name (local) or email (cloud) so OTP autofill targets the matching entry. */
    accountIdentifier?: string;
    onCancel: () => void;
    /** Called with the completed sign-in (e.g. to show a recovery key); optional. */
    onVerified?: (result: AuthResult) => void;
}

export const TwoFactorChallengeModal: React.FC<TwoFactorChallengeModalProps> = ({
    isOpen,
    methods,
    totpFactors: propTotpFactors,
    accountIdentifier,
    onCancel,
    onVerified,
}) => {
    const { t } = useTranslation(['security', 'auth']);
    const { completeSecondFactor, completeSecondFactorWithPasskey, pendingTotpFactors } = useAuth();
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    useEscapeKey(() => { if (!isLoading) onCancel(); }, isOpen);
    const hasTotp = methods.includes('totp');
    const hasPasskey = methods.includes('passkey');
    const { backupCodes, serverMfa } = getAuthCapabilities();
    const totpFactors = propTotpFactors ?? pendingTotpFactors ?? [];
    const showFactorSelector = hasTotp && serverMfa && totpFactors.length > 1;
    const [selectedFactorId, setSelectedFactorId] = useState<string>(() => totpFactors[0]?.id ?? '');

    useEffect(() => {
        if (totpFactors.length > 0 && !totpFactors.some(f => f.id === selectedFactorId)) {
            setSelectedFactorId(totpFactors[0].id);
        }
    }, [totpFactors, selectedFactorId]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanCode = code.trim().replace(/[\s-]/g, '');
        if (!cleanCode) return;

        setError(null);
        setIsLoading(true);
        try {
            // Awaited first: `onVerified?.(await …)` would skip the verification when no callback is given.
            const result = await completeSecondFactor(
                cleanCode,
                showFactorSelector ? selectedFactorId || undefined : undefined
            );
            onVerified?.(result);
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
            const result = await completeSecondFactorWithPasskey();
            onVerified?.(result);
        } catch (err: unknown) {
            setError(mapAuthErrorMessage(err, t, 'common:errors.passkey.FAILED'));
        } finally {
            setIsLoading(false);
        }
    };

    let subtitle = t('security:passkeys.challengeSubtitle');
    if (hasTotp && hasPasskey) {
        subtitle = t('security:totp.challengeOrPasskeySubtitle');
    } else if (hasTotp) {
        subtitle = backupCodes ? t('security:totp.challengeSubtitle') : t('security:totp.challengeSubtitleNoBackup');
    }

    return (
        <div className="space-y-5 text-left animate-fade-in" data-testid="two-factor-challenge-inline">
            <div className="flex items-center space-x-3 p-3.5 rounded-xl bg-subtle/60 border border-subtle">
                <div className="p-2.5 rounded-xl bg-brand/10 border border-brand/20 text-brand shrink-0">
                    {hasTotp ? <Smartphone size={22} /> : <Fingerprint size={22} />}
                </div>
                <div>
                    <h3 className="text-sm font-bold text-primary">
                        {t('security:totp.challengeTitle')}
                    </h3>
                    <p className="text-xs text-secondary mt-0.5">{subtitle}</p>
                </div>
            </div>

            {error && (
                <div className="flex items-center space-x-2 p-3 text-xs rounded-xl bg-negative/10 border border-negative/20 text-negative">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <form onSubmit={handleSubmit} method="post" action="/login" className="space-y-4">
                {accountIdentifier && <PasswordManagerUsernameField username={accountIdentifier} />}
                {showFactorSelector && (
                    <div>
                        <label htmlFor="two-factor-select" className="block text-xs font-semibold text-subtle uppercase tracking-wider mb-1.5">
                            {t('security:totp.selectFactorLabel')}
                        </label>
                        <div className="relative">
                            <Smartphone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
                            <select
                                id="two-factor-select"
                                value={selectedFactorId}
                                onChange={(e) => setSelectedFactorId(e.target.value)}
                                className="w-full appearance-none pl-9 pr-9 py-2.5 rounded-xl bg-subtle text-primary border border-subtle focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm"
                            >
                                {totpFactors.map(factor => (
                                    <option key={factor.id} value={factor.id}>
                                        {factor.friendlyName}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
                        </div>
                    </div>
                )}
                {hasTotp && (
                    <div>
                        <label htmlFor="two-factor-code" className="block text-xs font-semibold text-subtle uppercase tracking-wider mb-1.5">
                            {backupCodes ? t('security:totp.inputLabel') : t('security:totp.inputLabelNoBackup')}
                        </label>
                        <div className="relative">
                            <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                            <input
                                id="two-factor-code"
                                name="otp"
                                type="text"
                                // Backup codes hold letters: a numeric keypad could not type them
                                inputMode={backupCodes ? 'text' : 'numeric'}
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

                <div className="flex flex-col gap-2.5 pt-1">
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
    );
};
