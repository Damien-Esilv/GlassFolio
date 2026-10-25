import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Lock, ShieldCheck, ShieldAlert, KeyRound, AlertCircle, CheckCircle2, X, RefreshCw, Info } from 'lucide-react';
import Button from '../Button';
import { useAuth } from '../../context/AuthContext';
import { vaultService } from '../../src/services/security/vaultService';
import { authService } from '../../src/services/security/authService';
import { mfaService } from '../../src/services/security/mfaService';
import { isErr } from '../../src/types/result';
import { TotpEnrollDialog } from './TotpEnrollDialog';
import { PasskeyManager } from './PasskeyManager';
import { SecretsVaultPanel } from './SecretsVaultPanel';
import { SessionAuditPanel } from './SessionAuditPanel';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { RecoveryKeyDialog } from './RecoveryKeyDialog';
import { StepUpAuthModal } from './StepUpAuthModal';
import { evaluatePassword } from '../../src/services/security/passwordValidator';
import { mapAuthErrorMessage } from '../../src/services/security/authErrorMapper';

export const SecuritySettingsTab: React.FC = () => {
    const { t } = useTranslation();
    const { user, lockVault } = useAuth();

    // 2FA state
    const [isTotpEnabled, setIsTotpEnabled] = useState(false);
    const [showEnrollDialog, setShowEnrollDialog] = useState(false);

    // Change Password Modal state
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');

    // Regenerate Recovery Key state
    const [regenerateError, setRegenerateError] = useState('');
    const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);

    // Every sensitive action below goes through the same step-up (stepUpService).
    const [stepUpAction, setStepUpAction] = useState<'enableTotp' | 'disableTotp' | 'changePassword' | 'regenerateRecoveryKey' | null>(null);

    const isGoogleAccount = user?.authProvider === 'google';

    const refreshTotpStatus = async () => {
        try {
            const status = await mfaService.getTotpStatus();
            setIsTotpEnabled(status.enabled);
        } catch (err) {
            console.error('Failed to get 2FA status', err);
        }
    };

    useEffect(() => {
        refreshTotpStatus();
    }, []);

    const handleChangeMasterPassword = (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        if (newPassword !== confirmPassword) {
            setPasswordError(t('security:vaultSection.passwordsMismatch'));
            return;
        }

        const evalRes = evaluatePassword(newPassword);
        if (!evalRes.isValid) {
            setPasswordError(t('auth:signup.passwordWeakError'));
            return;
        }
        setStepUpAction('changePassword');
    };

    const runVerifiedAction = async ({ password }: { password: string }) => {
        switch (stepUpAction) {
            case 'enableTotp':
                setShowEnrollDialog(true);
                return;
            case 'disableTotp':
                await mfaService.disableTotp();
                await refreshTotpStatus();
                return;
            case 'changePassword':
                setIsSubmittingPassword(true);
                try {
                    // Cloud: Supabase first, vault re-wrap second, rolled back together on failure.
                    if (!authService.changePassword) throw new Error(t('security:lockScreen.invalidCredentials'));
                    await authService.changePassword(password, newPassword);
                    setPasswordSuccess(t('security:vaultSection.passwordChangedSuccess'));
                    setNewPassword('');
                    setConfirmPassword('');
                    setTimeout(() => {
                        setShowChangePassword(false);
                        setPasswordSuccess('');
                    }, 2500);
                } catch (err: unknown) {
                    setPasswordError(mapAuthErrorMessage(err, t, 'security:lockScreen.invalidCredentials'));
                } finally {
                    setIsSubmittingPassword(false);
                }
                return;
            case 'regenerateRecoveryKey': {
                setRegenerateError('');
                const res = await vaultService.regenerateRecoveryKey(password);
                if (isErr(res)) {
                    setRegenerateError(mapAuthErrorMessage(res.error, t, 'security:lockScreen.invalidCredentials'));
                    return;
                }
                setNewRecoveryKey(res.value.recoveryKey);
                return;
            }
            default:
                return;
        }
    };

    const stepUpCopy = {
        enableTotp: { title: t('security:totp.title'), description: t('security:stepUp.description'), action: t('security:totp.enableButton') },
        disableTotp: { title: t('security:totp.disableConfirmTitle'), description: t('security:totp.disableConfirmMessage'), action: t('security:totp.confirmDisable') },
        changePassword: { title: t('security:vaultSection.changeMasterPassword'), description: t('security:stepUp.description'), action: t('security:vaultSection.submitChange') },
        regenerateRecoveryKey: { title: t('security:vaultSection.regenerateTitle'), description: t('security:vaultSection.regenerateSubtitle'), action: t('security:vaultSection.confirmRegenerate') },
    };

    const cardStyle = "bg-card rounded-xl p-6 shadow-lg border border-border space-y-4";

    return (
        <div className="space-y-6 animate-fade-in">
            {/* 1. Encrypted Vault (E2EE) Section */}
            <div className={cardStyle}>
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 text-brand flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                            <Lock size={22} />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-semibold text-primary">
                                    {t('security:vaultSection.title')}
                                </h3>
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-success/10 text-success border border-success/20">
                                    <ShieldCheck size={12} className="shrink-0" />
                                    <span>{t('security:vaultSection.statusActive')}</span>
                                </span>
                            </div>
                            <p className="text-xs text-secondary leading-relaxed">
                                {t('security:vaultSection.subtitle')}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto">
                        {isGoogleAccount ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-subtle border border-subtle text-xs text-subtle">
                                <Info size={14} className="text-brand shrink-0" />
                                <span>{t('security:vaultSection.managedByGoogle', 'Authentication & Vault managed by Google OAuth')}</span>
                            </div>
                        ) : (
                            <>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setShowChangePassword(true)}
                                    className="text-xs whitespace-nowrap w-full justify-center sm:justify-start"
                                >
                                    <KeyRound size={14} className="mr-1.5 shrink-0" />
                                    {t('security:vaultSection.changeMasterPassword')}
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setStepUpAction('regenerateRecoveryKey')}
                                    className="text-xs whitespace-nowrap w-full justify-center sm:justify-start"
                                >
                                    <RefreshCw size={14} className="mr-1.5 shrink-0" />
                                    {t('security:vaultSection.regenerateRecoveryKey', 'Regenerate Recovery Key')}
                                </Button>
                            </>
                        )}
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => lockVault()}
                            className="text-xs whitespace-nowrap w-full justify-center sm:justify-start"
                        >
                            <Lock size={14} className="mr-1.5 shrink-0" />
                            {t('security:vaultSection.lockNow')}
                        </Button>
                    </div>
                </div>
            </div>

            {/* 2. Two-Factor Authentication (TOTP) Section */}
            <div className={cardStyle}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 text-brand flex items-center justify-center shrink-0">
                            {isGoogleAccount ? (
                                <ShieldCheck size={22} className="text-brand" />
                            ) : isTotpEnabled ? (
                                <ShieldCheck size={22} className="text-success" />
                            ) : (
                                <ShieldAlert size={22} />
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-semibold text-primary">
                                    {t('security:totp.title')}
                                </h3>
                                {isGoogleAccount ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 bg-brand/10 text-brand border border-brand/20">
                                        <ShieldCheck size={12} className="shrink-0" />
                                        <span>{t('security:totp.statusGoogle', 'Managed by Google')}</span>
                                    </span>
                                ) : (
                                    <span
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                                            isTotpEnabled
                                                ? 'bg-success/10 text-success border border-success/20'
                                                : 'bg-subtle text-tertiary border border-subtle'
                                        }`}
                                    >
                                        {isTotpEnabled ? t('security:totp.statusEnabled') : t('security:totp.statusDisabled')}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-secondary mt-0.5">
                                {t('security:totp.subtitle')}
                            </p>
                        </div>
                    </div>

                    <div className="shrink-0">
                        {isGoogleAccount ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-subtle border border-subtle text-xs text-subtle">
                                <Info size={14} className="text-brand shrink-0" />
                                <span>{t('security:totp.managedByGoogle', '2FA is managed directly by your Google Account')}</span>
                            </div>
                        ) : isTotpEnabled ? (
                            <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                onClick={() => setStepUpAction('disableTotp')}
                                className="text-xs whitespace-nowrap"
                            >
                                {t('security:totp.disableButton')}
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => setStepUpAction('enableTotp')}
                                className="text-xs whitespace-nowrap"
                            >
                                <ShieldCheck size={14} className="mr-1.5" />
                                {t('security:totp.enableButton')}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* 3. WebAuthn Passkeys Section */}
            <div className={cardStyle}>
                <PasskeyManager />
            </div>

            {/* 4. Secrets Vault (API Keys) Section */}
            <div className={cardStyle}>
                <SecretsVaultPanel />
            </div>

            {/* 5. Security Audit Log Section */}
            <div className={cardStyle}>
                <SessionAuditPanel />
            </div>

            {/* Change Master Password Modal */}
            {showChangePassword && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
                    <div className="relative w-full max-w-md bg-card border border-subtle rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
                        <button
                            type="button"
                            onClick={() => setShowChangePassword(false)}
                            className="absolute top-4 right-4 p-2 text-tertiary hover:text-primary rounded-lg transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-brand/15 border border-brand/30 text-brand flex items-center justify-center shrink-0">
                                <KeyRound size={24} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-primary">
                                    {t('security:vaultSection.changeMasterPassword')}
                                </h2>
                                <p className="text-xs text-secondary mt-0.5">
                                    {t('security:vaultSection.subtitle')}
                                </p>
                            </div>
                        </div>

                        {passwordError && (
                            <div className="p-3 bg-error/10 border border-error/20 rounded-xl flex items-center gap-2 text-error text-xs">
                                <AlertCircle size={16} className="shrink-0" />
                                <span>{passwordError}</span>
                            </div>
                        )}

                        {passwordSuccess && (
                            <div className="p-3 bg-success/10 border border-success/20 rounded-xl flex items-center gap-2 text-success text-xs">
                                <CheckCircle2 size={16} className="shrink-0" />
                                <span>{passwordSuccess}</span>
                            </div>
                        )}

                        <form onSubmit={handleChangeMasterPassword} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-secondary mb-1">
                                    {t('security:vaultSection.newPassword')}
                                </label>
                                <input
                                    type="password"
                                    required
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5 placeholder-tertiary"
                                    placeholder="••••••••"
                                />
                                <PasswordStrengthMeter password={newPassword} />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-secondary mb-1">
                                    {t('security:vaultSection.confirmPassword')}
                                </label>
                                <input
                                    type="password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5 placeholder-tertiary"
                                    placeholder="••••••••"
                                />
                            </div>

                            <div className="flex gap-2 pt-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => setShowChangePassword(false)}
                                    className="flex-1"
                                >
                                    {t('security:vaultSection.cancel')}
                                </Button>
                                <Button
                                    type="submit"
                                    isLoading={isSubmittingPassword}
                                    className="flex-1"
                                >
                                    {t('security:vaultSection.submitChange')}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* TOTP Enrollment Dialog */}
            <TotpEnrollDialog
                isOpen={showEnrollDialog}
                onClose={() => setShowEnrollDialog(false)}
                userEmail={user?.email || 'user@glassfolio.com'}
                onEnrolled={() => {
                    refreshTotpStatus();
                }}
            />

            {regenerateError && (
                <div className="p-3 bg-error/10 border border-error/20 rounded-xl flex items-center gap-2 text-error text-xs">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{regenerateError}</span>
                </div>
            )}

            {/* Display newly generated recovery key dialog */}
            {newRecoveryKey && (
                <RecoveryKeyDialog
                    recoveryKey={newRecoveryKey}
                    onConfirmed={() => setNewRecoveryKey(null)}
                />
            )}

            <StepUpAuthModal
                isOpen={stepUpAction !== null}
                title={stepUpAction ? stepUpCopy[stepUpAction].title : undefined}
                description={stepUpAction ? stepUpCopy[stepUpAction].description : undefined}
                actionLabel={stepUpAction ? stepUpCopy[stepUpAction].action : undefined}
                actionVariant={stepUpAction === 'disableTotp' ? 'danger' : 'primary'}
                onVerified={runVerifiedAction}
                onClose={() => setStepUpAction(null)}
            />
        </div>
    );
};
