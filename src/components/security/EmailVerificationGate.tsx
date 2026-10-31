import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MailCheck, Send, RefreshCw, LogOut, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import Button from '../Button';
import { authService } from '../../services/security/authService';
import { mapAuthErrorMessage } from '../../services/security/authErrorMapper';
import { captchaTokenForResend, CaptchaRequiredError } from '../../services/security/captchaResend';
import { AntiBotShield, AntiBotShieldHandle } from './AntiBotShield';

interface EmailVerificationGateProps {
    userEmail: string;
    onVerified: () => void;
    onSignOut: () => void;
}

const RESEND_COOLDOWN_SECONDS = 60;

export const EmailVerificationGate: React.FC<EmailVerificationGateProps> = ({
    userEmail,
    onVerified,
    onSignOut,
}) => {
    const { t } = useTranslation(['auth', 'common']);
    const [otpCode, setOtpCode] = useState('');
    const [cooldown, setCooldown] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const antiBotRef = useRef<AntiBotShieldHandle | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
        const channel = new BroadcastChannel('glassfolio_auth_channel');
        channel.onmessage = (event) => {
            if (event.data?.type === 'EMAIL_VERIFIED') {
                onVerified();
            }
        };
        return () => {
            channel.close();
        };
    }, [onVerified]);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setInterval(() => {
            setCooldown((prev) => Math.max(0, prev - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanOtp = otpCode.trim();
        if (!cleanOtp) return;

        setError(null);
        setSuccessMessage(null);
        setIsVerifying(true);

        try {
            if (!authService.verifyEmailOtp) {
                throw new Error('Email verification is not supported in this mode.');
            }
            await authService.verifyEmailOtp(userEmail, cleanOtp);
            setSuccessMessage(t('auth:verification.success', 'Email verified successfully! Redirecting...'));
            setTimeout(() => {
                onVerified();
            }, 1000);
        } catch (err: unknown) {
            setError(mapAuthErrorMessage(err, t, 'auth:verification.invalidOtp'));
        } finally {
            setIsVerifying(false);
        }
    };

    const handleResend = async () => {
        if (cooldown > 0 || isResending) return;

        setError(null);
        setSuccessMessage(null);
        setIsResending(true);

        try {
            const captchaToken = captchaTokenForResend(antiBotRef.current?.getPayload().captchaToken);
            if (authService.resendEmailVerification) {
                await authService.resendEmailVerification(userEmail, { captchaToken });
            }
            setCooldown(RESEND_COOLDOWN_SECONDS);
            setSuccessMessage(t('auth:verification.emailSent'));
        } catch (err: unknown) {
            setError(err instanceof CaptchaRequiredError
                ? t('auth:verification.captchaRequired')
                : mapAuthErrorMessage(err, t, 'auth:verification.resendFailed'));
        } finally {
            antiBotRef.current?.reset();
            setIsResending(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-card border border-subtle shadow-2xl space-y-6">
                <div className="text-center space-y-3">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
                        <MailCheck size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-primary">
                        {t('auth:verification.title', 'Verify your email')}
                    </h2>
                    <p className="text-sm text-subtle">
                        {t('auth:verification.subtitle', 'We sent a verification link and security code to:')}
                    </p>
                    <p className="font-semibold text-primary break-all bg-subtle py-1.5 px-3 rounded-lg border border-subtle inline-block text-xs sm:text-sm">
                        {userEmail}
                    </p>
                </div>

                {error && (
                    <div className="flex items-center space-x-2 p-3 text-xs rounded-xl bg-negative/10 border border-negative/20 text-negative">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {successMessage && (
                    <div className="flex items-center space-x-2 p-3 text-xs rounded-xl bg-positive/10 border border-positive/20 text-positive">
                        <CheckCircle2 size={16} className="shrink-0" />
                        <span>{successMessage}</span>
                    </div>
                )}

                <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <div>
                        <label htmlFor="email-otp" className="block text-xs font-semibold text-subtle uppercase tracking-wider mb-1">
                            {t('auth:verification.otpLabel', 'Verification Code (6 digits)')}
                        </label>
                        <input
                            id="email-otp"
                            name="otp"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={8}
                            autoFocus
                            placeholder={t('security:totp.codePlaceholder', '000000')}
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl bg-subtle text-primary border border-subtle focus:outline-none focus:ring-1 focus:border-primary text-center font-mono text-base tracking-widest"
                        />
                    </div>

                    <Button
                        type="submit"
                        variant="primary"
                        disabled={isVerifying || !otpCode.trim()}
                        className="w-full justify-center"
                    >
                        {isVerifying ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <CheckCircle2 size={16} className="mr-2" />
                        )}
                        {t('auth:verification.confirmButton', 'Confirm Code & Continue')}
                    </Button>
                </form>

                <div className="pt-2 border-t border-subtle flex flex-col gap-2">
                    <AntiBotShield ref={antiBotRef} />
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={handleResend}
                        disabled={cooldown > 0 || isResending}
                        className="w-full justify-center"
                    >
                        {isResending ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <Send size={16} className="mr-2" />
                        )}
                        {cooldown > 0
                            ? t('auth:verification.resendCooldown', { seconds: cooldown })
                            : t('auth:verification.resendButton')}
                    </Button>

                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onSignOut}
                        className="w-full justify-center text-subtle hover:text-primary"
                    >
                        <LogOut size={16} className="mr-2" />
                        {t('auth:verification.signOut', 'Sign in with another account')}
                    </Button>
                </div>
            </div>
        </div>
    );
};
