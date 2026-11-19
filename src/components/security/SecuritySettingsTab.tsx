import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Lock, ShieldCheck, ShieldAlert, KeyRound, AlertCircle, CheckCircle2, X, RefreshCw, Info, Plus, Trash2, Pencil, Check, Smartphone, ChevronDown, Copy, Download } from 'lucide-react';
import Button from '../Button';
import { useAuth } from '../../context/AuthContext';
import { vaultService } from '../../services/security/vaultService';
import { authService } from '../../services/security/authService';
import { mfaService, MAX_TOTP_FACTORS, TotpFactorInfo } from '../../services/security/mfaService';
import { isErr } from '../../types/result';
import { TotpEnrollDialog } from './TotpEnrollDialog';
import { PasskeyManager } from './PasskeyManager';
import { SecretsVaultPanel } from './SecretsVaultPanel';
import { SessionAuditPanel } from './SessionAuditPanel';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { RecoveryKeyDialog } from './RecoveryKeyDialog';
import { StepUpAuthModal } from './StepUpAuthModal';
import { evaluatePassword } from '../../services/security/passwordValidator';
import { mapAuthErrorMessage } from '../../services/security/authErrorMapper';
import { getAuthCapabilities } from '../../services/security/authCapabilities';
import { getAccountIdentifier, persistPasswordCredential } from '../../services/security/accountIdentity';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { PasswordManagerUsernameField } from './PasswordManagerUsernameField';

export const SecuritySettingsTab: React.FC = () => {
    const { t } = useTranslation();
    const { user, lockVault } = useAuth();

    // 2FA state (multi-factor TOTP)
    const [totpFactors, setTotpFactors] = useState<TotpFactorInfo[]>([]);
    const [maxTotpFactors, setMaxTotpFactors] = useState<number>(MAX_TOTP_FACTORS);
    const [remainingBackupCodes, setRemainingBackupCodes] = useState<number | undefined>(undefined);
    const [totpError, setTotpError] = useState('');
    const [showEnrollDialog, setShowEnrollDialog] = useState(false);
    const [totpFactorToRemove, setTotpFactorToRemove] = useState<TotpFactorInfo | null>(null);
    const [renamingFactorId, setRenamingFactorId] = useState<string | null>(null);
    const [renameFactorDraft, setRenameFactorDraft] = useState('');
    const [isRenamingFactor, setIsRenamingFactor] = useState(false);
    const [regeneratedBackupCodes, setRegeneratedBackupCodes] = useState<string[] | null>(null);
    const [copiedRegenBackup, setCopiedRegenBackup] = useState(false);
    const isTotpEnabled = totpFactors.length > 0;
    const isServerMfa = getAuthCapabilities().serverMfa;

    // Change Password Modal state
    const [showChangePassword, setShowChangePassword] = useState(false);
    useEscapeKey(() => setShowChangePassword(false), showChangePassword);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [selectedPasswordFactorId, setSelectedPasswordFactorId] = useState('');
    const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');

    // Regenerate Recovery Key state
    const [regenerateError, setRegenerateError] = useState('');
    const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);

    // Sensitive actions via step-up modal
    const [stepUpAction, setStepUpAction] = useState<'enableTotp' | 'removeTotp' | 'regenerateBackupCodes' | 'regenerateRecoveryKey' | null>(null);

    const isGoogleAccount = user?.authProvider === 'google';
    const hasRecoveryKey = vaultService.hasRecoveryKey();
    const [googleReauthError, setGoogleReauthError] = useState('');

    /** A Google vault is created without a recovery key; this goes through Google to create or replace it. */
    const handleGoogleRecoveryKey = async () => {
        setGoogleReauthError('');
        try {
            await authService.startGoogleReauth?.('recovery-key');
        } catch (err: unknown) {
            setGoogleReauthError(mapAuthErrorMessage(err, t, 'common:errors.auth.googleNotConfigured'));
        }
    };

    const refreshTotpStatus = async () => {
        try {
            const status = await mfaService.getTotpStatus();
            setTotpFactors(status.factors);
            setMaxTotpFactors(status.maxFactors);
            setRemainingBackupCodes(status.remainingBackupCodes);
            setSelectedPasswordFactorId(prev =>
                status.factors.some(f => f.id === prev) ? prev : (status.factors[0]?.id ?? '')
            );
        } catch (err) {
            console.error('Failed to get 2FA status', err);
        }
    };

    useEffect(() => {
        refreshTotpStatus();
    }, []);

    const handleChangeMasterPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        if (!currentPassword) {
            setPasswordError(t('security:vaultSection.oldPasswordRequired', 'Please enter your current password.'));
            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordError(t('security:vaultSection.passwordsMismatch'));
            return;
        }

        const evalRes = evaluatePassword(newPassword);
        if (!evalRes.isValid) {
            setPasswordError(t('auth:signup.passwordWeakError'));
            return;
        }

        setIsSubmittingPassword(true);
        try {
            await authService.changePassword(currentPassword, newPassword, {
                totpCode: totpCode.trim() || undefined,
                factorId: isServerMfa && totpFactors.length > 1 ? selectedPasswordFactorId || undefined : undefined,
            });
            const credId = getAccountIdentifier(user);
            persistPasswordCredential({ id: credId, name: user?.name || credId, password: newPassword });
            setPasswordSuccess(t('security:vaultSection.passwordChangedSuccess'));
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setTotpCode('');
            setTimeout(() => {
                setShowChangePassword(false);
                setPasswordSuccess('');
            }, 2000);
        } catch (err: unknown) {
            setPasswordError(mapAuthErrorMessage(err, t, 'security:lockScreen.invalidCredentials'));
        } finally {
            setIsSubmittingPassword(false);
        }
    };

    const runVerifiedAction = async ({ password }: { password: string }) => {
        switch (stepUpAction) {
            case 'enableTotp':
                setShowEnrollDialog(true);
                return;
            case 'removeTotp':
                if (totpFactorToRemove) {
                    await mfaService.removeTotpFactor(totpFactorToRemove.id);
                    setTotpFactorToRemove(null);
                    await refreshTotpStatus();
                }
                return;
            case 'regenerateBackupCodes': {
                const codes = await mfaService.regenerateLocalBackupCodes();
                setRegeneratedBackupCodes(codes);
                await refreshTotpStatus();
                return;
            }
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

    const startRenameFactor = (factor: TotpFactorInfo) => {
        setRenamingFactorId(factor.id);
        setRenameFactorDraft(factor.friendlyName);
        setTotpError('');
    };

    const cancelRenameFactor = () => {
        setRenamingFactorId(null);
        setRenameFactorDraft('');
    };

    const commitRenameFactor = async (factor: TotpFactorInfo) => {
        const trimmed = renameFactorDraft.trim();
        if (!trimmed || trimmed === factor.friendlyName) {
            cancelRenameFactor();
            return;
        }
        setIsRenamingFactor(true);
        setTotpError('');
        try {
            await mfaService.renameLocalTotpFactor(factor.id, trimmed);
            await refreshTotpStatus();
            cancelRenameFactor();
        } catch (err: unknown) {
            setTotpError(mapAuthErrorMessage(err, t, 'common:errors.auth.totpNameConflict'));
        } finally {
            setIsRenamingFactor(false);
        }
    };

    const handleCopyRegenBackup = async () => {
        if (!regeneratedBackupCodes) return;
        try {
            await navigator.clipboard.writeText(regeneratedBackupCodes.join('\n'));
            setCopiedRegenBackup(true);
            setTimeout(() => setCopiedRegenBackup(false), 2000);
        } catch (err) {
            console.error('Failed to copy backup codes', err);
        }
    };

    const handleDownloadRegenBackup = () => {
        if (!regeneratedBackupCodes) return;
        const content = [
            '================================================================',
            'GlassFolio — Emergency 2FA Backup Codes',
            '================================================================',
            '',
            `Account : ${getAccountIdentifier(user)}`,
            `Date    : ${new Date().toISOString()}`,
            '',
            'BACKUP CODES (each code can only be used once):',
            ...regeneratedBackupCodes.map((code, idx) => `  ${idx + 1}. ${code}`),
            '',
            'Keep these codes safe in your password manager or physical safe.',
            '================================================================',
        ].join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `glassfolio-backup-codes-${Date.now()}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const stepUpCopy = {
        enableTotp: {
            title: isTotpEnabled ? t('security:totp.addFactorTitle') : t('security:totp.title'),
            description: t('security:stepUp.description'),
            action: isTotpEnabled ? t('security:totp.addFactorButton') : t('security:totp.enableButton'),
        },
        removeTotp: {
            title: t('security:totp.removeFactorConfirmTitle', { name: totpFactorToRemove?.friendlyName || '' }),
            description: totpFactors.length === 1
                ? t('security:totp.disableConfirmMessage')
                : t('security:totp.removeFactorConfirmMessage'),
            action: t('common:buttons.delete'),
        },
        regenerateBackupCodes: {
            title: t('security:totp.regenerateBackupTitle'),
            description: t('security:totp.regenerateBackupDescription'),
            action: t('security:totp.regenerateBackupButton'),
        },
        regenerateRecoveryKey: { title: t('security:vaultSection.regenerateTitle'), description: t('security:vaultSection.regenerateSubtitle'), action: t('security:vaultSection.confirmRegenerate') },
    };

    const cardStyle = "bg-card rounded-xl p-6 shadow-lg border border-border space-y-4";

    return (
        <div className="space-y-6">
            {/* 1. Encrypted Vault (E2EE) Section */}
            <div className={cardStyle}>
                <div className="flex flex-col gap-4">
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0">
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

                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        {isGoogleAccount ? (
                            <>
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-subtle border border-subtle text-xs text-subtle">
                                    <Info size={14} className="text-brand shrink-0" />
                                    <span>{t('security:vaultSection.managedByGoogle', 'Authentication & Vault managed by Google OAuth')}</span>
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => void handleGoogleRecoveryKey()}
                                    className="text-xs whitespace-nowrap"
                                >
                                    <RefreshCw size={14} className="mr-1.5 shrink-0" />
                                    {hasRecoveryKey
                                        ? t('security:vaultSection.googleRecoveryRegenerate')
                                        : t('security:vaultSection.googleRecoveryCreate')}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setShowChangePassword(true)}
                                    className="text-xs whitespace-nowrap"
                                >
                                    <KeyRound size={14} className="mr-1.5 shrink-0" />
                                    {t('security:vaultSection.changeMasterPassword')}
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setStepUpAction('regenerateRecoveryKey')}
                                    className="text-xs whitespace-nowrap"
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
                            className="text-xs whitespace-nowrap"
                        >
                            <Lock size={14} className="mr-1.5 shrink-0" />
                            {t('security:vaultSection.lockNow')}
                        </Button>
                    </div>
                    {isGoogleAccount && (
                        <div className="space-y-1 pt-1">
                            <p className={`text-xs leading-relaxed ${hasRecoveryKey ? 'text-secondary' : 'text-warning'}`}>
                                {hasRecoveryKey
                                    ? t('security:vaultSection.googleRecoveryPresent')
                                    : t('security:vaultSection.googleRecoveryMissing')}
                            </p>
                            <p className="text-[11px] text-tertiary">{t('security:vaultSection.googleRecoveryRedirectNote')}</p>
                            {googleReauthError && <p className="text-xs text-error">{googleReauthError}</p>}
                        </div>
                    )}
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
                                    <>
                                        <span
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                                                isTotpEnabled
                                                    ? 'bg-success/10 text-success border border-success/20'
                                                    : 'bg-subtle text-tertiary border border-subtle'
                                            }`}
                                        >
                                            {isTotpEnabled ? t('security:totp.statusEnabled') : t('security:totp.statusDisabled')}
                                        </span>
                                        {isTotpEnabled && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-subtle text-secondary border border-subtle">
                                                {totpFactors.length} / {maxTotpFactors}
                                            </span>
                                        )}
                                    </>
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
                        ) : (
                            <Button
                                type="button"
                                size="sm"
                                disabled={totpFactors.length >= maxTotpFactors}
                                onClick={() => setStepUpAction('enableTotp')}
                                className="text-xs whitespace-nowrap inline-flex items-center gap-1.5"
                            >
                                {isTotpEnabled ? <Plus size={14} /> : <ShieldCheck size={14} />}
                                {isTotpEnabled ? t('security:totp.addFactorButton') : t('security:totp.enableButton')}
                            </Button>
                        )}
                    </div>
                </div>

                {totpError && (
                    <div className="p-3 bg-error/10 border border-error/20 rounded-xl flex items-center gap-2 text-error text-xs">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>{totpError}</span>
                    </div>
                )}

                {!isGoogleAccount && isTotpEnabled && (
                    <div className="space-y-2 pt-1">
                        {totpFactors.map(factor => (
                            <div
                                key={factor.id}
                                className="flex items-center justify-between p-3 bg-subtle border border-subtle rounded-xl hover:border-border transition-colors"
                            >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <Smartphone size={18} className="text-success shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        {renamingFactorId === factor.id ? (
                                            <div className="flex items-center gap-1.5">
                                                <input
                                                    type="text"
                                                    value={renameFactorDraft}
                                                    onChange={(e) => setRenameFactorDraft(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            void commitRenameFactor(factor);
                                                        } else if (e.key === 'Escape') {
                                                            cancelRenameFactor();
                                                        }
                                                    }}
                                                    maxLength={60}
                                                    autoFocus
                                                    disabled={isRenamingFactor}
                                                    aria-label={t('security:totp.renameInputLabel')}
                                                    className="w-full max-w-[220px] px-2 py-1 text-xs rounded-lg bg-subtle text-primary border border-subtle focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => void commitRenameFactor(factor)}
                                                    disabled={isRenamingFactor || !renameFactorDraft.trim()}
                                                    title={t('common:buttons.save')}
                                                    aria-label={t('common:buttons.save')}
                                                    className="p-1.5 text-positive hover:bg-card rounded-lg transition-colors disabled:opacity-40"
                                                >
                                                    <Check size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={cancelRenameFactor}
                                                    disabled={isRenamingFactor}
                                                    title={t('common:buttons.cancel')}
                                                    aria-label={t('common:buttons.cancel')}
                                                    className="p-1.5 text-tertiary hover:text-primary hover:bg-card rounded-lg transition-colors"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="text-xs font-semibold text-primary truncate">
                                                {factor.friendlyName}
                                            </div>
                                        )}
                                        {factor.enrolledAt && (
                                            <div className="text-[11px] text-tertiary">
                                                {t('security:passkeys.createdOn', {
                                                    date: new Date(factor.enrolledAt).toLocaleDateString(),
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                    {!isServerMfa && renamingFactorId !== factor.id && (
                                        <button
                                            type="button"
                                            onClick={() => startRenameFactor(factor)}
                                            title={t('security:totp.renameTooltip')}
                                            aria-label={t('security:totp.renameTooltip')}
                                            className="p-2 text-tertiary hover:text-primary rounded-lg hover:bg-card transition-colors"
                                        >
                                            <Pencil size={15} />
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTotpFactorToRemove(factor);
                                            setStepUpAction('removeTotp');
                                        }}
                                        title={t('security:totp.removeFactorTooltip')}
                                        aria-label={t('security:totp.removeFactorTooltip')}
                                        className="p-2 text-tertiary hover:text-error rounded-lg hover:bg-card transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {!isServerMfa && remainingBackupCodes !== undefined && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-subtle/60 border border-subtle rounded-xl text-xs">
                                <div className="flex items-center gap-2 text-secondary">
                                    <KeyRound size={14} className="text-brand shrink-0" />
                                    <span>{t('security:totp.backupCodesRemaining', { count: remainingBackupCodes })}</span>
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setStepUpAction('regenerateBackupCodes')}
                                    className="text-xs whitespace-nowrap"
                                >
                                    <RefreshCw size={13} className="mr-1.5" />
                                    {t('security:totp.regenerateBackupButton')}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
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
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
                    <div className="relative w-full max-w-md bg-card border border-subtle rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
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

                        <form onSubmit={handleChangeMasterPassword} method="post" action="/settings" className="space-y-4">
                            <PasswordManagerUsernameField username={getAccountIdentifier(user)} />

                            {/* 1. Current Password */}
                            <div>
                                <label htmlFor="change-current-password" className="block text-xs font-medium text-secondary mb-1">
                                    {t('security:vaultSection.oldPassword', 'Current Master Password')}
                                </label>
                                <input
                                    id="change-current-password"
                                    name="current-password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    autoFocus
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5 placeholder-tertiary"
                                    placeholder="••••••••••••"
                                />
                            </div>

                            {/* 2. New Password */}
                            <div>
                                <label htmlFor="change-new-password" className="block text-xs font-medium text-secondary mb-1">
                                    {t('security:vaultSection.newPassword', 'New Master Password')}
                                </label>
                                <input
                                    id="change-new-password"
                                    name="new-password"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5 placeholder-tertiary"
                                    placeholder="••••••••••••"
                                />
                                <PasswordStrengthMeter password={newPassword} />
                            </div>

                            {/* 3. Confirm New Password */}
                            <div>
                                <label htmlFor="change-confirm-password" className="block text-xs font-medium text-secondary mb-1">
                                    {t('security:vaultSection.confirmPassword', 'Confirm New Master Password')}
                                </label>
                                <input
                                    id="change-confirm-password"
                                    name="confirm-password"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5 placeholder-tertiary"
                                    placeholder="••••••••••••"
                                />
                            </div>

                            {/* 4. Optional 2FA Code if TOTP is active */}
                            {isTotpEnabled && (
                                <div className="space-y-3">
                                    {isServerMfa && totpFactors.length > 1 && (
                                        <div>
                                            <label htmlFor="change-totp-factor" className="block text-xs font-medium text-secondary mb-1">
                                                {t('security:totp.selectFactorLabel')}
                                            </label>
                                            <div className="relative">
                                                <select
                                                    id="change-totp-factor"
                                                    value={selectedPasswordFactorId}
                                                    onChange={(e) => setSelectedPasswordFactorId(e.target.value)}
                                                    className="w-full appearance-none pl-3 pr-9 bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5"
                                                >
                                                    {totpFactors.map(factor => (
                                                        <option key={factor.id} value={factor.id}>
                                                            {factor.friendlyName}
                                                        </option>
                                                    ))}
                                                </select>
                                                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary pointer-events-none" />
                                            </div>
                                        </div>
                                    )}
                                    <div>
                                        <label htmlFor="change-totp" className="block text-xs font-medium text-secondary mb-1">
                                            {t('security:stepUp.totpLabel', 'Authentication Code (2FA)')}
                                        </label>
                                        <input
                                            id="change-totp"
                                            name="otp"
                                            type="text"
                                            // Local backup codes (XXXX-XXXX) hold letters
                                            inputMode={getAuthCapabilities().backupCodes ? 'text' : 'numeric'}
                                            autoComplete="one-time-code"
                                            value={totpCode}
                                            onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9A-Za-z-]/g, '').slice(0, 9))}
                                            className="w-full bg-subtle border border-subtle text-primary text-sm font-mono tracking-wider rounded-lg focus:ring-primary focus:border-primary p-2.5 placeholder-tertiary text-center"
                                            placeholder={t('security:totp.codePlaceholder', '000000')}
                                        />
                                    </div>
                                </div>
                            )}

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
                userEmail={getAccountIdentifier(user)}
                existingNames={totpFactors.map(f => f.friendlyName)}
                onEnrolled={() => {
                    void refreshTotpStatus();
                }}
            />

            {/* Regenerated Local Backup Codes Modal */}
            {regeneratedBackupCodes && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
                    <div className="relative w-full max-w-md bg-card border border-subtle rounded-2xl p-6 shadow-2xl space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 text-brand flex items-center justify-center shrink-0">
                                <KeyRound size={20} />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-primary">
                                    {t('security:totp.backupTitle')}
                                </h2>
                                <p className="text-xs text-secondary mt-0.5">
                                    {t('security:totp.backupSubtitle')}
                                </p>
                            </div>
                        </div>

                        <div className="p-4 bg-subtle border border-subtle rounded-xl space-y-3">
                            <div className="grid grid-cols-2 gap-2 font-mono text-xs font-semibold text-primary">
                                {regeneratedBackupCodes.map((code, idx) => (
                                    <div key={idx} className="p-1.5 bg-card border border-subtle rounded text-center">
                                        {code}
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={handleCopyRegenBackup}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-subtle text-primary hover:bg-card-hover text-xs font-medium transition-colors"
                                >
                                    {copiedRegenBackup ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                                    {copiedRegenBackup ? t('security:totp.codesCopied') : t('security:totp.copyBackupCodes')}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDownloadRegenBackup}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-subtle text-primary hover:bg-card-hover text-xs font-medium transition-colors"
                                >
                                    <Download size={14} />
                                    {t('security:totp.downloadBackupCodes')}
                                </button>
                            </div>
                        </div>

                        <Button
                            type="button"
                            onClick={() => setRegeneratedBackupCodes(null)}
                            className="w-full"
                        >
                            {t('security:totp.finishEnrollment')}
                        </Button>
                    </div>
                </div>,
                document.body
            )}

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
                actionVariant={stepUpAction === 'removeTotp' ? 'danger' : 'primary'}
                onVerified={runVerifiedAction}
                onClose={() => {
                    setStepUpAction(null);
                    setTotpFactorToRemove(null);
                }}
            />
        </div>
    );
};
