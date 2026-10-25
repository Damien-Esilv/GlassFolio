import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, KeyRound, ShieldAlert, AlertCircle, RefreshCw, Key, Fingerprint, Sparkles } from 'lucide-react';
import Button from '../Button';
import { vaultService } from '../../src/services/security/vaultService';
import { authService } from '../../src/services/security/authService';
import { passkeyService, isPasskeySupported } from '../../src/services/security/passkeyService';
import { useData } from '../../context/DataContext';

interface LockScreenProps {
    onUnlocked?: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ onUnlocked }) => {
    const { t } = useTranslation();
    const { refreshData } = useData();
    const isDemo = vaultService.isDemoVault();

    const [password, setPassword] = useState(isDemo ? 'password' : '');
    const [recoveryKey, setRecoveryKey] = useState('');
    const [mode, setMode] = useState<'password' | 'recovery'>('password');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [passkeySupported, setPasskeySupported] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    React.useEffect(() => {
        isPasskeySupported().then(setPasskeySupported).catch(() => setPasskeySupported(false));
    }, []);

    const handleUnlockDemo = async () => {
        setError(null);
        setIsLoading(true);
        try {
            await vaultService.unlock('password');
            await refreshData();
            onUnlocked?.();
        } catch {
            try {
                await authService.signIn('demo@glassfolio.com', 'password');
                await refreshData();
                onUnlocked?.();
            } catch {
                setError(t('security:lockScreen.invalidCredentials'));
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleUnlockWithPasskey = async () => {
        setError(null);
        setIsLoading(true);
        try {
            await passkeyService.unlockVault();
            await refreshData();
            onUnlocked?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('security:lockScreen.invalidCredentials'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleUnlockWithPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) return;
        setError(null);
        setIsLoading(true);

        try {
            await vaultService.unlock(password);
            await refreshData();
            setPassword('');
            onUnlocked?.();
        } catch {
            setError(t('security:lockScreen.invalidCredentials'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleUnlockWithRecoveryKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!recoveryKey) return;
        setError(null);
        setIsLoading(true);

        try {
            await vaultService.unlockWithRecoveryKey(recoveryKey.trim());
            await refreshData();
            setRecoveryKey('');
            onUnlocked?.();
        } catch {
            setError(t('security:lockScreen.invalidCredentials'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetVault = async () => {
        setIsResetting(true);
        setError(null);
        try {
            if (isDemo) {
                await vaultService.resetVault();
                await authService.signIn('demo@glassfolio.com', 'password');
                await refreshData();
                setShowResetConfirm(false);
                onUnlocked?.();
            } else {
                await vaultService.resetVault();
                await refreshData();
                setShowResetConfirm(false);
                window.location.reload();
            }
        } catch (err) {
            console.error('Failed to reset vault', err);
            setError(t('security:lockScreen.resetFailed'));
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-canvas p-4 relative overflow-hidden">
            {/* Background Atmosphere */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-brand/10 blur-[100px]" />
                <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-brand/10 blur-[100px]" />
            </div>

            <div className="relative w-full max-w-md bg-card/60 border border-subtle backdrop-blur-xl rounded-2xl p-8 shadow-2xl">
                {/* Shield Icon & Header */}
                <div className="flex flex-col items-center text-center mb-6">
                    <div className="w-14 h-14 bg-brand/15 border border-brand/30 text-brand rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand/10">
                        <Lock size={26} className="text-brand animate-pulse" />
                    </div>
                    <h1 className="text-2xl font-bold text-primary tracking-tight">
                        {t('security:lockScreen.title')}
                    </h1>
                    <p className="text-xs text-secondary mt-1 max-w-sm">
                        {t('security:lockScreen.subtitle')}
                    </p>
                </div>

                {/* Demo Mode Quick-Unlock Banner */}
                {isDemo && (
                    <div className="mb-5 p-3.5 bg-brand/10 border border-brand/20 rounded-xl space-y-2.5 animate-in fade-in">
                        <div className="flex items-center gap-2 text-xs font-semibold text-brand">
                            <Sparkles size={15} className="shrink-0" />
                            <span>{t('security:lockScreen.demoBannerTitle', 'Mode Démonstration Actif')}</span>
                        </div>
                        <p className="text-[11px] text-secondary leading-relaxed">
                            {t('security:lockScreen.demoBannerDesc', 'Vous explorez le portefeuille fictif. Déverrouillez en 1 clic sans avoir à taper votre mot de passe.')}
                        </p>
                        <Button
                            type="button"
                            variant="primary"
                            className="w-full text-xs py-2 shadow-md shadow-brand/20 font-semibold"
                            onClick={handleUnlockDemo}
                            isLoading={isLoading}
                        >
                            <Sparkles size={14} className="mr-1.5" />
                            {t('security:lockScreen.unlockDemoButton', 'Déverrouiller la démo (1-clic)')}
                        </Button>
                    </div>
                )}

                {error && (
                    <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg flex items-center gap-2 text-error text-xs" role="alert">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {mode === 'password' ? (
                    <form onSubmit={handleUnlockWithPassword} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-secondary mb-1.5" htmlFor="vault-password">
                                {t('security:lockScreen.passwordLabel')}
                            </label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" size={18} />
                                <input
                                    id="vault-password"
                                    type="password"
                                    autoFocus={!isDemo}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary block pl-10 p-2.5 placeholder-tertiary"
                                    placeholder={t('security:lockScreen.passwordPlaceholder')}
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        <Button type="submit" className="w-full" isLoading={isLoading} aria-label={t('security:lockScreen.unlockButton')}>
                            {isLoading ? t('security:lockScreen.unlocking') : t('security:lockScreen.unlockButton')}
                        </Button>

                        {passkeySupported && vaultService.hasPasskeySlot() && (
                            <button
                                type="button"
                                onClick={handleUnlockWithPasskey}
                                disabled={isLoading}
                                className="w-full flex items-center justify-center gap-2 bg-subtle hover:bg-card-hover text-primary px-4 py-2.5 rounded-lg border border-subtle transition-colors text-xs font-semibold shadow-sm"
                            >
                                <Fingerprint size={16} className="text-brand" />
                                {t('security:lockScreen.unlockWithPasskey')}
                            </button>
                        )}

                        <div className="text-center pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setError(null);
                                    setMode('recovery');
                                }}
                                className="text-xs text-brand hover:text-brand/80 transition-colors inline-flex items-center gap-1.5"
                            >
                                <KeyRound size={13} />
                                {t('security:lockScreen.useRecoveryKey')}
                            </button>
                        </div>
                    </form>
                ) : (
                    <form onSubmit={handleUnlockWithRecoveryKey} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-secondary mb-1.5" htmlFor="vault-recovery-key">
                                {t('security:lockScreen.recoveryKeyLabel')}
                            </label>
                            <div className="relative">
                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" size={18} />
                                <input
                                    id="vault-recovery-key"
                                    type="text"
                                    autoFocus
                                    required
                                    value={recoveryKey}
                                    onChange={(e) => setRecoveryKey(e.target.value)}
                                    className="w-full bg-subtle border border-subtle text-primary text-xs font-mono rounded-lg focus:ring-primary focus:border-primary block pl-10 p-2.5 placeholder-tertiary uppercase"
                                    placeholder={t('security:lockScreen.recoveryKeyPlaceholder')}
                                    disabled={isLoading}
                                />
                            </div>
                            <p className="text-[11px] text-tertiary mt-1.5">
                                {t('security:lockScreen.recoveryKeyHint')}
                            </p>
                        </div>

                        <Button type="submit" className="w-full" isLoading={isLoading} aria-label={t('security:lockScreen.unlockButton')}>
                            {isLoading ? t('security:lockScreen.unlocking') : t('security:lockScreen.unlockButton')}
                        </Button>

                        <div className="text-center pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setError(null);
                                    setMode('password');
                                }}
                                className="text-xs text-brand hover:text-brand/80 transition-colors inline-flex items-center gap-1.5"
                            >
                                <Lock size={13} />
                                {t('security:lockScreen.usePassword')}
                            </button>
                        </div>
                    </form>
                )}

                {/* Escape Hatch Divider & Button */}
                <div className="mt-8 pt-6 border-t border-subtle text-center">
                    <p className="text-[11px] text-tertiary mb-2">
                        {t('security:lockScreen.forgotPrompt')}
                    </p>
                    <button
                        type="button"
                        onClick={() => setShowResetConfirm(true)}
                        className="text-xs text-error/80 hover:text-error transition-colors inline-flex items-center gap-1.5 underline decoration-error/30"
                    >
                        <ShieldAlert size={14} />
                        {t('security:lockScreen.resetButton')}
                    </button>
                </div>
            </div>

            {/* Confirmation Modal for Reset Vault */}
            {showResetConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-md bg-card border border-error/30 rounded-2xl p-6 shadow-2xl">
                        <div className="flex items-center gap-3 text-error mb-3">
                            <div className="w-10 h-10 rounded-xl bg-error/15 flex items-center justify-center shrink-0">
                                <ShieldAlert size={20} />
                            </div>
                            <h3 className="font-bold text-base text-primary">
                                {t('security:lockScreen.resetConfirmTitle')}
                            </h3>
                        </div>

                        <p className="text-xs text-secondary leading-relaxed mb-6">
                            {t('security:lockScreen.resetConfirmMessage')}
                        </p>

                        <div className="flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setShowResetConfirm(false)}
                                className="px-4 py-2 text-xs font-medium text-secondary hover:text-primary transition-colors rounded-lg bg-subtle"
                                disabled={isResetting}
                            >
                                {t('security:lockScreen.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={handleResetVault}
                                className="px-4 py-2 text-xs font-semibold text-white bg-error hover:bg-error/90 transition-colors rounded-lg inline-flex items-center gap-1.5"
                                disabled={isResetting}
                            >
                                {isResetting && <RefreshCw size={13} className="animate-spin" />}
                                {t('security:lockScreen.resetConfirmButton')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
