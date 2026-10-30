import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, X, AlertCircle, Fingerprint, Lock, KeyRound, Loader2 } from 'lucide-react';
import Button from '../Button';
import { useAuth } from '../../context/AuthContext';
import { stepUpService, StepUpRequirements } from '../../services/security/stepUpService';
import { mapAuthErrorMessage } from '../../services/security/authErrorMapper';
import { getAuthCapabilities } from '../../services/security/authCapabilities';
import { useEscapeKey } from '../../hooks/useEscapeKey';

export interface StepUpAuthModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  actionLabel?: string;
  actionVariant?: 'primary' | 'danger';
  /**
   * Runs once the user is re-authenticated (see stepUpService). Receives the verified password
   * for actions that need it, e.g. re-wrapping the vault key.
   */
  onVerified: (proof: { password: string }) => Promise<void>;
  onClose: () => void;
  /** The action re-authenticates with Google by itself (account deletion): skip the recent sign-in check. */
  googleRoundTrip?: boolean;
}

export const StepUpAuthModal: React.FC<StepUpAuthModalProps> = ({
  isOpen,
  title,
  description,
  actionLabel,
  actionVariant = 'primary',
  onVerified,
  onClose,
  googleRoundTrip = false,
}) => {
  const { t } = useTranslation(['security', 'common']);
  const { user, startGoogleReauth } = useAuth();

  const [requirements, setRequirements] = useState<StepUpRequirements | null>(null);
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  useEscapeKey(() => { if (!isLoading) onClose(); }, isOpen);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setRequirements(null);
      setPassword('');
      setTotpCode('');
      setError('');
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    stepUpService.getRequirements(user, { googleRoundTrip })
      .then((next) => {
        if (!cancelled) setRequirements(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(mapAuthErrorMessage(err, t, 'security:stepUp.invalidPassword'));
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, user, t, googleRoundTrip]);

  if (!isOpen || typeof document === 'undefined') return null;

  const hasTotp = Boolean(requirements?.secondFactor.includes('totp'));
  const hasPasskey = Boolean(requirements?.secondFactor.includes('passkey'));

  const confirm = async (usePasskey: boolean) => {
    if (!requirements) return;
    setError('');
    if (requirements.password && !password) {
      setError(t('security:stepUp.invalidPassword'));
      return;
    }
    if (hasTotp && !usePasskey && !totpCode.trim()) {
      setError(t('security:stepUp.invalidTotp'));
      return;
    }

    setIsLoading(true);
    try {
      try {
        await stepUpService.verify(user, { password, totpCode: totpCode.trim() || undefined, usePasskey }, { googleRoundTrip });
      } catch (err: unknown) {
        setError(err instanceof Error && err.name === 'RecentSignInRequiredError'
          ? t('security:stepUp.recentSignInRequired')
          : mapAuthErrorMessage(err, t, 'security:stepUp.invalidPassword'));
        return;
      }
      try {
        await onVerified({ password });
        onClose();
      } catch (err: unknown) {
        // The identity was proven: a failure now belongs to the action, never to the password
        setError(mapAuthErrorMessage(err, t, 'common:errors.auth.actionFailed'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  /** Google accounts have no password: the proof is a fresh Google sign-in, then back to this page. */
  const confirmWithGoogle = async () => {
    setError('');
    setIsLoading(true);
    try {
      await startGoogleReauth('step-up', { returnTo: `${window.location.pathname}${window.location.search}` });
    } catch (err: unknown) {
      setError(mapAuthErrorMessage(err, t, 'common:errors.auth.actionFailed'));
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Without TOTP, an account with passkeys confirms with one of them.
    void confirm(hasPasskey && !hasTotp);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-md bg-card border border-subtle rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common:buttons.cancel')}
          className="absolute top-4 right-4 p-2 text-tertiary hover:text-primary rounded-lg transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
              actionVariant === 'danger'
                ? 'bg-negative/15 border-negative/30 text-negative'
                : 'bg-brand/15 border-brand/30 text-brand'
            }`}
          >
            <ShieldAlert size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-primary">
              {title || t('security:stepUp.title')}
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              {description || t('security:stepUp.description')}
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-negative/10 border border-negative/20 rounded-xl flex items-center gap-2 text-negative text-xs">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!requirements ? (
          <div className="flex justify-center py-4 text-tertiary">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {requirements.recentSignInRequired && (
              <p className="text-xs text-secondary">
                {requirements.recentSignInSatisfied
                  ? t('security:stepUp.recentSignInOk')
                  : t('security:stepUp.recentSignInRequired')}
              </p>
            )}
            {requirements.recentSignInRequired && !requirements.recentSignInSatisfied && (
              <Button type="button" variant="secondary" onClick={() => void confirmWithGoogle()} isLoading={isLoading} className="w-full">
                {t('security:stepUp.confirmWithGoogle')}
              </Button>
            )}

            {/* Hidden username to anchor password manager identification */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              defaultValue={user?.email || 'user'}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />

            {requirements.password && (
              <div>
                <label htmlFor="step-up-password" className="block text-xs font-medium text-secondary mb-1">
                  {t('security:stepUp.passwordLabel')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-tertiary">
                    <Lock size={16} />
                  </div>
                  <input
                    id="step-up-password"
                    name="password"
                    type="password"
                    required
                    autoFocus
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5 placeholder-tertiary"
                    placeholder={t('security:stepUp.passwordPlaceholder')}
                  />
                </div>
              </div>
            )}

            {hasTotp && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="step-up-totp" className="block text-xs font-medium text-secondary">
                    {t('security:stepUp.totpLabel')}
                  </label>
                  {hasPasskey && (
                    <button
                      type="button"
                      onClick={() => void confirm(true)}
                      disabled={isLoading}
                      className="text-xs text-brand hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      <Fingerprint size={12} />
                      <span>{t('security:stepUp.usePasskeyButton')}</span>
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-tertiary">
                    <KeyRound size={16} />
                  </div>
                  <input
                    id="step-up-totp"
                    name="otp"
                    type="text"
                    // Local backup codes hold letters: a numeric keypad could not type them
                    inputMode={getAuthCapabilities().backupCodes ? 'text' : 'numeric'}
                    autoComplete="one-time-code"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9A-Za-z-]/g, '').slice(0, 9))}
                    className="w-full pl-9 bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5 placeholder-tertiary font-mono tracking-wider"
                    placeholder={t('security:stepUp.totpPlaceholder')}
                  />
                </div>
              </div>
            )}

            {hasPasskey && !hasTotp && (
              <p className="text-xs text-secondary inline-flex items-center gap-1.5">
                <Fingerprint size={14} className="text-brand shrink-0" />
                {t('security:stepUp.passkeyRequired')}
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isLoading}
                className="flex-1"
              >
                {t('security:stepUp.cancelButton')}
              </Button>
              <Button
                type="submit"
                variant={actionVariant}
                isLoading={isLoading}
                disabled={requirements.recentSignInRequired && !requirements.recentSignInSatisfied}
                className="flex-1"
              >
                {actionLabel || t('security:stepUp.confirmButton')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};
