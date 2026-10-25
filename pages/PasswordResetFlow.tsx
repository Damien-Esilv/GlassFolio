import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, Mail, ArrowLeft, AlertCircle, CheckCircle2, ShieldAlert, Lock, Loader2 } from 'lucide-react';
import Button from '../components/Button';
import { authService } from '../src/services/security/authService';
import { evaluatePassword } from '../src/services/security/passwordValidator';
import { AntiBotShield, AntiBotShieldHandle } from '../components/security/AntiBotShield';
import { RecoveryKeyDialog } from '../components/security/RecoveryKeyDialog';

interface PasswordResetFlowProps {
    initialMode?: 'request' | 'recover';
}

export const PasswordResetFlow: React.FC<PasswordResetFlowProps> = ({ initialMode = 'request' }) => {
    const { t } = useTranslation(['auth', 'common', 'security']);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Determine mode from prop or query parameter (?mode=recover or default)
    const modeFromQuery = searchParams.get('mode') === 'recover' ? 'recover' : initialMode;
    const [mode, setMode] = useState<'request' | 'recover'>(modeFromQuery);

    // Form states
    const [email, setEmail] = useState('');
    const [recoveryKey, setRecoveryKey] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Feedback states
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [requestSuccess, setRequestSuccess] = useState(false);
    const [newRotatedRecoveryKey, setNewRotatedRecoveryKey] = useState<string | null>(null);
    const [showLostKeyWarning, setShowLostKeyWarning] = useState(false);

    const antiBotRef = useRef<AntiBotShieldHandle | null>(null);

    // Handle Forgot Password Email Request
    const handleRequestReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!email.trim()) return;

        // AntiBot validation
        if (antiBotRef.current) {
            const botCheck = await antiBotRef.current.validate();
            if (!botCheck.success) {
                setError(botCheck.error.message);
                return;
            }
        }

        setIsLoading(true);
        try {
            if (authService.requestPasswordReset) {
                await authService.requestPasswordReset(email.trim());
            }
            setRequestSuccess(true);
        } catch {
            // Anti-enumeration: display success even on silent failure
            setRequestSuccess(true);
        } finally {
            setIsLoading(false);
        }
    };

    // Handle Recovery Key + New Password Reset
    const handleRecoverVault = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const cleanKey = recoveryKey.trim();
        if (!cleanKey) {
            setError(t('auth:recovery.keyRequired', 'Emergency recovery key is required.'));
            return;
        }

        if (newPassword !== confirmPassword) {
            setError(t('auth:recovery.passwordMismatch', 'Passwords do not match.'));
            return;
        }

        const passwordEval = evaluatePassword(newPassword);
        if (!passwordEval.isValid) {
            setError(t('auth:signup.passwordWeakError', 'Password does not meet NIST complexity standards (min 12 characters).'));
            return;
        }

        // AntiBot validation
        if (antiBotRef.current) {
            const botCheck = await antiBotRef.current.validate();
            if (!botCheck.success) {
                setError(botCheck.error.message);
                return;
            }
        }

        setIsLoading(true);
        try {
            if (!authService.recoverPassword) {
                throw new Error('Vault recovery is not supported.');
            }
            const res = await authService.recoverPassword(cleanKey, newPassword);
            // Mandatory Rotation: open dialog with the newly generated recovery key
            setNewRotatedRecoveryKey(res.newRecoveryKey);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t('auth:recovery.failed', 'Failed to recover vault. Invalid recovery key.'));
        } finally {
            setIsLoading(false);
        }
    };

    // When new recovery key dialog is confirmed by user
    const handleRotatedKeyConfirmed = () => {
        setNewRotatedRecoveryKey(null);
        navigate('/login', { replace: true });
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-card border border-subtle shadow-2xl space-y-6">
                <AntiBotShield ref={antiBotRef} />

                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
                        <KeyRound size={28} />
                    </div>
                    <h2 className="text-xl font-bold text-primary">
                        {mode === 'request'
                            ? t('auth:recovery.requestTitle', 'Reset your password')
                            : t('auth:recovery.vaultRecoveryTitle', 'Vault Recovery')}
                    </h2>
                    <p className="text-xs sm:text-sm text-subtle">
                        {mode === 'request'
                            ? t('auth:recovery.requestSubtitle', 'Enter your email to receive recovery instructions.')
                            : t('auth:recovery.vaultRecoverySubtitle', 'Use your 256-bit emergency recovery key to re-wrap your vault.')}
                    </p>
                </div>

                {error && (
                    <div className="flex items-center space-x-2 p-3 text-xs rounded-xl bg-negative/10 border border-negative/20 text-negative">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Mode 1: Forgot Password Request */}
                {mode === 'request' && !requestSuccess && (
                    <form onSubmit={handleRequestReset} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-subtle uppercase tracking-wider mb-1">
                                {t('auth:login.emailLabel', 'Email address')}
                            </label>
                            <div className="relative">
                                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                                <input
                                    type="email"
                                    required
                                    autoFocus
                                    placeholder="alex@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-subtle text-primary border border-subtle focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm"
                                />
                            </div>
                        </div>

                        <Button
                            type="submit"
                            variant="primary"
                            disabled={isLoading || !email.trim()}
                            className="w-full justify-center"
                        >
                            {isLoading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Mail size={16} className="mr-2" />
                            )}
                            {t('auth:recovery.sendResetLink', 'Send recovery instructions')}
                        </Button>

                        <div className="pt-2 text-center">
                            <button
                                type="button"
                                onClick={() => setMode('recover')}
                                className="text-xs text-brand hover:underline font-medium"
                            >
                                {t('auth:recovery.haveRecoveryKey', 'I already have my emergency recovery key →')}
                            </button>
                        </div>
                    </form>
                )}

                {/* Success state for Request */}
                {mode === 'request' && requestSuccess && (
                    <div className="space-y-4 text-center">
                        <div className="p-4 rounded-xl bg-positive/10 border border-positive/20 text-positive flex items-center justify-center space-x-2 text-xs sm:text-sm">
                            <CheckCircle2 size={18} className="shrink-0" />
                            <span>
                                {t(
                                    'auth:recovery.requestDispatched',
                                    'If an account matches this email, reset instructions have been sent.'
                                )}
                            </span>
                        </div>
                        <p className="text-xs text-subtle">
                            {t(
                                'auth:recovery.checkSpamNotice',
                                'Check your spam or junk folder. You will need your emergency recovery key to decrypt your financial vault.'
                            )}
                        </p>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setMode('recover')}
                            className="w-full justify-center"
                        >
                            <KeyRound size={16} className="mr-2" />
                            {t('auth:recovery.proceedToKeyEntry', 'Enter Emergency Recovery Key')}
                        </Button>
                    </div>
                )}

                {/* Mode 2: Emergency Recovery Key Unlock + New Password */}
                {mode === 'recover' && (
                    <form onSubmit={handleRecoverVault} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-subtle uppercase tracking-wider mb-1">
                                {t('auth:recovery.keyInputLabel', 'Emergency Recovery Key')}
                            </label>
                            <div className="relative">
                                <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                                <input
                                    type="text"
                                    required
                                    autoFocus
                                    placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                                    value={recoveryKey}
                                    onChange={(e) => setRecoveryKey(e.target.value.toUpperCase())}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-subtle text-primary border border-subtle focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-xs font-mono tracking-wider"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-subtle uppercase tracking-wider mb-1">
                                {t('auth:recovery.newPasswordLabel', 'New Master Password (min 12 chars)')}
                            </label>
                            <div className="relative">
                                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                                <input
                                    type="password"
                                    required
                                    placeholder="••••••••••••"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-subtle text-primary border border-subtle focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-subtle uppercase tracking-wider mb-1">
                                {t('auth:recovery.confirmPasswordLabel', 'Confirm New Master Password')}
                            </label>
                            <div className="relative">
                                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                                <input
                                    type="password"
                                    required
                                    placeholder="••••••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-subtle text-primary border border-subtle focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm"
                                />
                            </div>
                        </div>

                        <Button
                            type="submit"
                            variant="primary"
                            disabled={isLoading || !recoveryKey.trim() || !newPassword}
                            className="w-full justify-center"
                        >
                            {isLoading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <KeyRound size={16} className="mr-2" />
                            )}
                            {t('auth:recovery.submitButton', 'Decrypt & Re-wrap Vault')}
                        </Button>

                        <div className="pt-2 text-center">
                            <button
                                type="button"
                                onClick={() => setShowLostKeyWarning(true)}
                                className="text-xs text-subtle hover:text-negative transition-colors"
                            >
                                {t('auth:recovery.lostKeyQuestion', 'I lost both my password and my recovery key')}
                            </button>
                        </div>
                    </form>
                )}

                {/* Back to Login Link */}
                <div className="pt-2 border-t border-subtle text-center">
                    <Link
                        to="/login"
                        className="inline-flex items-center text-xs text-subtle hover:text-primary transition-colors font-medium"
                    >
                        <ArrowLeft size={14} className="mr-1" />
                        {t('auth:recovery.backToLogin', 'Back to login')}
                    </Link>
                </div>
            </div>

            {/* Lost Key Warning Modal */}
            {showLostKeyWarning && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
                    <div className="w-full max-w-md p-6 rounded-2xl bg-card border border-subtle shadow-2xl space-y-4">
                        <div className="flex items-center space-x-3 text-negative">
                            <ShieldAlert size={28} />
                            <h3 className="text-lg font-bold">
                                {t('auth:recovery.e2eeNoticeTitle', 'Security Notice')}
                            </h3>
                        </div>
                        <p className="text-xs text-subtle leading-relaxed">
                            {t(
                                'auth:recovery.e2eeNoticeExplanation',
                                'GlassFolio uses client-side End-to-End Encryption (AES-256-GCM). Neither GlassFolio nor Supabase possesses your decryption keys. Without your master password or emergency recovery key, encrypted data cannot be decrypted by anyone.'
                            )}
                        </p>
                        <p className="text-xs text-subtle leading-relaxed">
                            {t(
                                'auth:recovery.e2eeNoticeResetWarning',
                                'If you cannot find your emergency recovery key, you must initialize a new empty vault.'
                            )}
                        </p>
                        <div className="pt-2 flex justify-end space-x-2">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setShowLostKeyWarning(false)}
                            >
                                {t('common:close', 'Close')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mandatory Recovery Key Rotation Dialog */}
            {newRotatedRecoveryKey && (
                <RecoveryKeyDialog
                    recoveryKey={newRotatedRecoveryKey}
                    onConfirmed={handleRotatedKeyConfirmed}
                />
            )}
        </div>
    );
};
