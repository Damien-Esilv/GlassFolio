import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isDemoAccount } from '../services/security/demoAccount';
import Button from '../components/Button';
import { Hexagon, Mail, Lock, User, AlertCircle, ArrowLeft, Key, Info } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import { createLegalAcceptance, LEGAL_DOCUMENTS_VERSION } from '../config/legal';
import { PasswordStrengthMeter } from '../components/security/PasswordStrengthMeter';
import { RecoveryKeyDialog } from '../components/security/RecoveryKeyDialog';
import { evaluatePassword } from '../services/security/passwordValidator';
import { ThemeLangDropdowns } from '../components/ui/ThemeLangDropdowns';
import { isShowcaseAvailable, buildShowcaseDestinationUrl, getShowcaseUrl, getDeploymentMode } from '../config/deployment';
import { usePublicThemeLang } from '../hooks/usePublicThemeLang';
import { authService } from '../services/security/authService';
import { AntiBotShield, AntiBotShieldHandle } from '../components/security/AntiBotShield';
import { captchaTokenForResend, CaptchaRequiredError } from '../services/security/captchaResend';
import { GoogleDrivePrivacyTooltip } from '../components/security/GoogleDrivePrivacyTooltip';
import { mapAuthErrorMessage } from '../services/security/authErrorMapper';
import { LegalLink } from '../components/ui/LegalLink';

const Signup: React.FC = () => {
   const { t } = useTranslation();
   const {
      user, logout, signup, setupLocalVault, verifySignupOtp, continueSignupAfterLink,
      pendingSignupCompletion, resumeSignup, cancelSignup, completeSignup,
   } = useAuth();
   const navigate = useNavigate();
   const location = useLocation();
   const deploymentMode = getDeploymentMode();
   const isLocal = deploymentMode === 'local';

   const logoutRef = useRef(logout);
   logoutRef.current = logout;

   useEffect(() => {
      if (!user) return;
      // A demo session left over from the showcase must not block creating a real account.
      if (isDemoAccount(user)) {
         logoutRef.current();
         return;
      }
      navigate('/', { replace: true });
   }, [user, navigate]);

   const [name, setName] = useState('');
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [error, setError] = useState('');
   const [acceptedLegal, setAcceptedLegal] = useState(false);
   const [isLoading, setIsLoading] = useState(false);
   const [pendingRecoveryKey, setPendingRecoveryKey] = useState<string | null>(null);
   const [signupStage, setSignupStage] = useState<'form' | 'verification'>('form');
   const [otp, setOtp] = useState('');
   const [info, setInfo] = useState('');
   const [resendCooldown, setResendCooldown] = useState(0);
   const [isResuming, setIsResuming] = useState(false);
   const [recoveryError, setRecoveryError] = useState('');
   const [isCompleting, setIsCompleting] = useState(false);
   const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
   const [overwriteText, setOverwriteText] = useState('');
   const antiBotRef = useRef<AntiBotShieldHandle | null>(null);

   // Entry points from the login page: a verified account to finish, or an unverified address.
   useEffect(() => {
      const entry = location.state as { resume?: boolean; verify?: boolean } | null;
      if (entry?.verify) {
         const draftEmail = authService.getSignupDraftEmail?.();
         if (draftEmail) {
            setEmail(draftEmail);
            setSignupStage('verification');
         }
      } else if (entry?.resume && pendingSignupCompletion) {
         setIsResuming(true);
         resumeSignup()
            .then(setPendingRecoveryKey)
            .catch((err: unknown) => setError(mapAuthErrorMessage(err, t, 'auth:signup.failedToSignup')))
            .finally(() => setIsResuming(false));
      }
      // Runs once per arrival on the page.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

   useEffect(() => {
      if (resendCooldown <= 0) return;
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
   }, [resendCooldown]);

   // The emailed link was opened in another tab of this browser: that tab only confirms the address
   // (it keeps no session), this one creates the vault with the password it holds in memory.
   useEffect(() => {
      if (signupStage !== 'verification' || typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
      const channel = new BroadcastChannel('glassfolio_auth_channel');
      channel.onmessage = async (event) => {
         if (event.data?.type !== 'EMAIL_VERIFIED') return;
         if (event.data.email && event.data.email !== email.trim().toLowerCase()) return;
         channel.postMessage({ type: 'EMAIL_VERIFIED_ACK' });
         try {
            setIsLoading(true);
            setError('');
            setPendingRecoveryKey(await continueSignupAfterLink());
         } catch (err) {
            setError(mapAuthErrorMessage(err, t, 'auth:verification.invalidOtp'));
         } finally {
            setIsLoading(false);
         }
      };
      return () => {
         channel.close();
      };
   }, [signupStage, email, continueSignupAfterLink, t]);

   const handleResendCode = async () => {
      setError('');
      setInfo('');
      try {
         const captchaToken = captchaTokenForResend(antiBotRef.current?.getPayload().captchaToken);
         await authService.resendEmailVerification?.(email, { captchaToken });
         setInfo(t('auth:verification.emailSent'));
         setResendCooldown(30);
      } catch (err: unknown) {
         setError(err instanceof CaptchaRequiredError
            ? t('auth:verification.captchaRequired')
            : mapAuthErrorMessage(err, t, 'auth:verification.resendFailed'));
      } finally {
         antiBotRef.current?.reset();
      }
   };

   const handleVerifiedViaLink = async () => {
      setError('');
      setIsLoading(true);
      try {
         setPendingRecoveryKey(await continueSignupAfterLink());
      } catch (err: unknown) {
         setError(mapAuthErrorMessage(err, t, 'auth:verification.notVerifiedYet'));
      } finally {
         setIsLoading(false);
      }
   };

   const handleChangeEmail = async () => {
      await cancelSignup();
      setOtp('');
      setInfo('');
      setError('');
      setSignupStage('form');
   };

   const handleStartOver = async () => {
      await cancelSignup();
      setPendingRecoveryKey(null);
      setRecoveryError('');
      navigate('/signup', { replace: true, state: null });
   };

   const handleGoogleLogin = async () => {
      setError('');
      setIsLoading(true);
      try {
         await authService.signInWithOAuth('google');
      } catch {
         setError(t('auth:login.googleSandboxError'));
      } finally {
         setIsLoading(false);
      }
   };

   const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      // The Terms and the Privacy Policy cover the hosted service; a local vault sends nothing to the publisher
      if (!isLocal && !acceptedLegal) {
         setError(t('auth:signup.acceptLegalRequired'));
         return;
      }

      const evalResult = evaluatePassword(password);
      if (!evalResult.isValid) {
         setError(t('auth:signup.passwordWeakError'));
         return;
      }

      setIsLoading(true);
      try {
         let recoveryKey: string | undefined;
         if (isLocal) {
            if (showOverwriteConfirm && overwriteText.trim().toUpperCase() !== t('auth:signup.existingVaultConfirmWord').toUpperCase()) {
               setError(t('auth:signup.existingVaultError'));
               return;
            }
            recoveryKey = await setupLocalVault(name, password, { overwriteExisting: showOverwriteConfirm });
         } else {
            if (antiBotRef.current) {
               const botRes = await antiBotRef.current.validate();
               if (!botRes.success) {
                  antiBotRef.current.reset();
                  setError(mapAuthErrorMessage(botRes.error, t, 'common:errors.auth.antiBot'));
                  setIsLoading(false);
                  return;
               }
            }

            const payload = antiBotRef.current?.getPayload();
            await signup(email, password, name, { captchaToken: payload?.captchaToken, legalAcceptance: createLegalAcceptance() });
            // The token was spent on the sign-up: a resend needs a new one
            antiBotRef.current?.reset();
            setSignupStage('verification');
            return;
         }

         if (recoveryKey) {
            setPendingRecoveryKey(recoveryKey);
         } else {
            navigate('/', { replace: true });
         }
      } catch (err: unknown) {
         antiBotRef.current?.reset();
         if (err instanceof Error && err.name === 'ExistingVaultError') {
            setShowOverwriteConfirm(true);
         }
         setError(mapAuthErrorMessage(err, t, 'auth:signup.failedToSignup'));
      } finally {
         setIsLoading(false);
      }
   };

   const handleOtpVerification = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setIsLoading(true);
      try {
         const recoveryKey = await verifySignupOtp(email, otp);
         setPendingRecoveryKey(recoveryKey);
      } catch (err: unknown) {
         setError(mapAuthErrorMessage(err, t, 'auth:verification.invalidOtp'));
      } finally {
         setIsLoading(false);
      }
   };

   const { theme, language } = usePublicThemeLang();
   const showcaseAvailable = isShowcaseAvailable();
   const isExternalShowcase = Boolean(getShowcaseUrl());
   const showcaseDestination = buildShowcaseDestinationUrl('/', { theme, lang: language });

   return (
      <div className="min-h-screen flex items-center justify-center bg-canvas p-4 relative">
         {/* Top Navigation Bar: Back to Welcome + Lang & Theme Controls */}
         <div className="absolute top-4 left-4 right-4 sm:top-6 sm:left-8 sm:right-8 z-20 flex items-center justify-between pointer-events-auto">
            {showcaseAvailable ? (
               isExternalShowcase ? (
                  <a
                     href={showcaseDestination}
                     className="inline-flex items-center gap-2 text-xs font-semibold text-secondary hover:text-primary transition-colors py-1.5 px-3 rounded-lg bg-card border border-subtle shadow-sm"
                  >
                     <ArrowLeft size={14} />
                     <span className="hidden sm:inline">{t('navigation:brandName')}</span>
                  </a>
               ) : (
                  <Link
                     to="/welcome"
                     className="inline-flex items-center gap-2 text-xs font-semibold text-secondary hover:text-primary transition-colors py-1.5 px-3 rounded-lg bg-card border border-subtle shadow-sm"
                  >
                     <ArrowLeft size={14} />
                     <span className="hidden sm:inline">{t('navigation:brandName')}</span>
                  </Link>
               )
            ) : (
               <div />
            )}
            <div className="flex items-center gap-2">
               <ThemeLangDropdowns align="right" showThemeLabel="always" />
            </div>
         </div>

         {/* Background Elements */}
         <div className="fixed inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-brand/10 blur-[100px]"></div>
            <div className="absolute top-[20%] -left-[10%] w-[40%] h-[40%] rounded-full bg-brand/10 blur-[100px]"></div>
         </div>

         <div className="relative w-full max-w-md bg-card border border-subtle rounded-2xl p-8 shadow-2xl">
            <div className="flex flex-col items-center mb-8 text-center">
               <div className="w-12 h-12 bg-brand-static rounded-xl flex items-center justify-center transform rotate-45 mb-4 shadow-lg shadow-brand/20">
                  <div className="transform -rotate-45 text-white font-bold text-xl">
                     <Hexagon size={24} fill="currentColor" />
                  </div>
               </div>
               <h1 className="text-2xl font-bold text-primary">
                  {isLocal ? t('auth:signup.localInitTitle') : t('auth:signup.title')}
               </h1>
               <p className="text-secondary mt-1 text-xs">
                  {isLocal ? t('auth:signup.localInitSubtitle') : t('auth:signup.subtitle')}
               </p>
            </div>

            {error && (
               <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg flex items-center gap-2 text-error text-sm">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
               </div>
            )}

            {info && (
               <div className="mb-4 p-3 bg-subtle border border-subtle rounded-lg flex items-center gap-2 text-secondary text-sm">
                  <Info size={16} className="shrink-0 text-brand" />
                  <span>{info}</span>
               </div>
            )}

            {(isResuming || (pendingSignupCompletion && (location.state as { resume?: boolean } | null)?.resume)) && (
               <div className="mb-4 p-3 bg-subtle border border-subtle rounded-lg space-y-2 text-sm">
                  <p className="font-semibold text-primary">{t('auth:signup.resumeTitle')}</p>
                  <p className="text-xs text-secondary">{t('auth:signup.resumeSubtitle')}</p>
                  <button type="button" onClick={handleStartOver} className="text-xs text-brand hover:text-brand/80 font-medium">
                     {t('auth:signup.startOverButton')}
                  </button>
               </div>
            )}

            {signupStage === 'form' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
               {isLocal && (
                  <input
                     type="text"
                     name="username"
                     id="local-signup-username"
                     autoComplete="username"
                     defaultValue="local-user"
                     className="sr-only"
                     tabIndex={-1}
                     aria-hidden="true"
                  />
               )}
               <div>
                  <label htmlFor="signup-name" className="block text-xs font-medium text-secondary mb-1.5">{t('auth:signup.fullNameLabel')}</label>
                  <div className="relative">
                     <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-tertiary" size={18} />
                     <input
                        id="signup-name"
                        name="name"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="name"
                        className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary block pl-10 p-2.5 placeholder-tertiary"
                        placeholder={t('auth:signup.fullNamePlaceholder')}
                     />
                  </div>
               </div>

               {!isLocal && (
                  <div>
                     <label htmlFor="signup-email" className="block text-xs font-medium text-secondary mb-1.5">{t('auth:signup.emailLabel')}</label>
                     <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-tertiary" size={18} />
                        <input
                           id="signup-email"
                           name="email"
                           type="email"
                           required
                           value={email}
                           onChange={(e) => setEmail(e.target.value)}
                           autoComplete="username"
                           spellCheck={false}
                           className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary block pl-10 p-2.5 placeholder-tertiary"
                           placeholder={t('auth:signup.emailPlaceholder')}
                        />
                     </div>
                  </div>
               )}

               <div>
                  <label htmlFor="signup-password" className="block text-xs font-medium text-secondary mb-1.5">
                     {isLocal ? t('auth:signup.masterPasswordLabel') : t('auth:signup.passwordLabel')}
                  </label>
                  <div className="relative">
                     {isLocal ? (
                        <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-tertiary" size={18} />
                     ) : (
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-tertiary" size={18} />
                     )}
                     <input
                        id="signup-password"
                        name="password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary block pl-10 p-2.5 placeholder-tertiary"
                        placeholder={isLocal ? t('auth:signup.masterPasswordPlaceholder') : t('auth:signup.passwordPlaceholder')}
                     />
                  </div>
                  <PasswordStrengthMeter password={password} />
               </div>

               {isLocal ? (
                  <p className="text-xs text-secondary mt-2">{t('auth:signup.localNotice')}</p>
               ) : (
                  <label className="flex items-start gap-2.5 text-xs text-secondary mt-2 cursor-pointer" htmlFor="accept-legal">
                     <input
                        id="accept-legal"
                        type="checkbox"
                        required
                        checked={acceptedLegal}
                        onChange={(e) => setAcceptedLegal(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-subtle bg-subtle text-primary focus:ring-primary focus:border-primary"
                     />
                     <span>
                        <Trans
                           i18nKey="auth:signup.acceptLegal"
                           values={{ version: LEGAL_DOCUMENTS_VERSION }}
                           components={{
                              terms: <LegalLink path="/terms" newTab className="text-brand hover:underline" />,
                              privacy: <LegalLink path="/privacy" newTab className="text-brand hover:underline" />,
                           }}
                        />
                     </span>
                  </label>
               )}

               {isLocal && showOverwriteConfirm && (
                  <div>
                     <label className="block text-xs font-medium text-error mb-1.5" htmlFor="overwrite-vault-confirm">
                        {t('auth:signup.existingVaultConfirmLabel')}
                     </label>
                     <input
                        id="overwrite-vault-confirm"
                        type="text"
                        value={overwriteText}
                        onChange={(e) => setOverwriteText(e.target.value)}
                        placeholder={t('auth:signup.existingVaultConfirmWord')}
                        className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 placeholder-tertiary"
                     />
                  </div>
               )}

               <Button type="submit" className="w-full" isLoading={isLoading}>
                  {isLocal
                     ? (showOverwriteConfirm ? t('auth:signup.existingVaultConfirmButton') : t('auth:signup.initVaultButton'))
                     : t('auth:signup.createAccountButton')}
               </Button>
            </form>
            ) : (
               <form onSubmit={handleOtpVerification} className="space-y-4">
                  <p className="text-sm text-secondary">{t('auth:verification.subtitle')} <span className="font-medium text-primary">{email}</span></p>
                  <div>
                     <label htmlFor="signup-otp" className="block text-xs font-medium text-secondary mb-1.5">{t('auth:verification.otpLabel')}</label>
                     <input
                        id="signup-otp"
                        name="otp"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        value={otp}
                        onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 8))}
                        className="w-full bg-subtle border border-subtle text-primary font-mono text-center tracking-[0.5em] text-lg rounded-lg focus:ring-primary focus:border-primary p-2.5"
                     />
                  </div>
                  <Button type="submit" className="w-full" isLoading={isLoading} disabled={otp.length < 6}>{t('auth:verification.confirmButton')}</Button>
                  <div className="flex flex-col items-center gap-2 pt-1 text-xs">
                     <button type="button" onClick={handleVerifiedViaLink} disabled={isLoading} className="text-brand hover:text-brand/80 font-medium">
                        {t('auth:verification.verifiedViaLinkButton')}
                     </button>
                     <button type="button" onClick={handleResendCode} disabled={resendCooldown > 0} className="text-secondary hover:text-primary disabled:opacity-60">
                        {resendCooldown > 0 ? t('auth:verification.resendCooldown', { seconds: resendCooldown }) : t('auth:verification.resendButton')}
                     </button>
                     <button type="button" onClick={handleChangeEmail} className="text-secondary hover:text-primary">
                        {t('auth:verification.changeEmailButton')}
                     </button>
                  </div>
               </form>
            )}

            {/* Also on the verification step: resending the email needs a new captcha token */}
            {!isLocal && <AntiBotShield ref={antiBotRef} />}

            {!isLocal && (
               <div className="mt-4 pt-4 border-t border-subtle">
                  <button
                     type="button"
                     onClick={handleGoogleLogin}
                     className="w-full flex items-center justify-center gap-3 bg-subtle hover:bg-card-hover text-primary px-4 py-2.5 rounded-lg border border-subtle transition-colors text-sm font-medium"
                  >
                     <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path className="text-brand" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="currentColor" />
                        <path className="text-success" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor" />
                        <path className="text-warning" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="currentColor" />
                        <path className="text-error" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="currentColor" />
                     </svg>
                     {t('auth:signup.signUpWithGoogle', 'Continue with Google')}
                  </button>
                  <GoogleDrivePrivacyTooltip />
                  <p className="text-xs text-tertiary mt-3 text-center">
                     <Trans
                        i18nKey="auth:signup.googleLegalNotice"
                        components={{
                           terms: <LegalLink path="/terms" newTab className="text-brand hover:underline" />,
                           privacy: <LegalLink path="/privacy" newTab className="text-brand hover:underline" />,
                        }}
                     />
                  </p>
               </div>
            )}

            <p className="text-center text-secondary text-sm mt-6">
               {isLocal ? (
                  <>
                     {t('auth:signup.hasLocalVault')}{' '}
                     <Link to="/login" className="text-brand hover:text-brand/80 font-medium">
                        {t('auth:signup.unlockLocalVaultLink')}
                     </Link>
                  </>
               ) : (
                  <>
                     {t('auth:signup.hasAccount')}{' '}
                     <Link to="/login" className="text-brand hover:text-brand/80 font-medium">
                        {t('auth:signup.loginLink')}
                     </Link>
                  </>
               )}
            </p>
         </div>

         {/* Emergency Recovery Key Modal */}
         {pendingRecoveryKey && (
            <RecoveryKeyDialog
               recoveryKey={pendingRecoveryKey}
               error={recoveryError}
               isSubmitting={isCompleting}
               onConfirmed={() => {
                  setRecoveryError('');
                  setIsCompleting(true);
                  completeSignup()
                     .then(() => {
                        setPendingRecoveryKey(null);
                        navigate('/', { replace: true });
                     })
                     .catch((err: unknown) => setRecoveryError(mapAuthErrorMessage(err, t, 'auth:signup.failedToSignup')))
                     .finally(() => setIsCompleting(false));
               }}
            />
         )}
      </div>
   );
};

export default Signup;
