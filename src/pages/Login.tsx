import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import { Hexagon, Mail, Lock, AlertCircle, Sparkles, ShieldAlert, ArrowLeft, KeyRound, Fingerprint, Key } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/security/authService';
import { isPasskeySupported, passkeyService } from '../services/security/passkeyService';
import { getDeploymentMode, isShowcaseAvailable, buildShowcaseDestinationUrl, getShowcaseUrl } from '../config/deployment';
import { useDemoAccess } from '../hooks/useDemoAccess';
import { usePublicThemeLang } from '../hooks/usePublicThemeLang';
import { ThemeLangDropdowns } from '../components/ui/ThemeLangDropdowns';
import { AntiBotShield, AntiBotShieldHandle } from '../components/security/AntiBotShield';
import { TwoFactorChallengeModal } from '../components/security/TwoFactorChallengeModal';
import { mapAuthErrorMessage } from '../services/security/authErrorMapper';
import { isDemoAccount } from '../services/security/demoAccount';

const Login: React.FC = () => {
   const { t } = useTranslation();
   const { login, logout, unlockLocalVault, signInWithPasskey, user, pendingSecondFactor, cancelSecondFactor, pendingSignupCompletion } = useAuth();
   const navigate = useNavigate();
   const location = useLocation();
   const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [passkeySupported, setPasskeySupported] = useState(false);
   const [error, setError] = useState('');
   const [isLoading, setIsLoading] = useState(false);
   const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
   const [lockoutSeconds, setLockoutSeconds] = useState(() => authService.getLockoutRemainingSeconds());
   const antiBotRef = useRef<AntiBotShieldHandle | null>(null);
   const deploymentMode = getDeploymentMode();
   const isLocal = deploymentMode === 'local';
   const { launchDemo, isLaunchingDemo, demoError } = useDemoAccess();

   useEffect(() => {
      isPasskeySupported().then(setPasskeySupported).catch(() => setPasskeySupported(false));
   }, []);

   const logoutRef = useRef(logout);
   logoutRef.current = logout;

   useEffect(() => {
      if (!user) return;
      // A demo session left over from the showcase must not block signing in to a real account.
      if (isDemoAccount(user)) {
         if (!isLaunchingDemo) logoutRef.current();
         return;
      }
      navigate(from, { replace: true });
   }, [user, navigate, from, isLaunchingDemo]);

   // Verified account whose vault was never finalized: finish the sign-up (no secret in router state).
   useEffect(() => {
      if (pendingSignupCompletion) {
         navigate('/signup', { state: { resume: true } });
      }
   }, [pendingSignupCompletion, navigate]);

   const handleEnterVerificationCode = async () => {
      setError('');
      try {
         await authService.resendEmailVerification?.(email);
      } catch {
         // The page still lets the user ask for a new code.
      }
      navigate('/signup', { state: { verify: true } });
   };

   useEffect(() => {
      if (lockoutSeconds <= 0) return;
      const interval = setInterval(() => {
         const remaining = authService.getLockoutRemainingSeconds();
         setLockoutSeconds(remaining);
         if (remaining <= 0) {
            clearInterval(interval);
            setError('');
         }
      }, 1000);
      return () => clearInterval(interval);
   }, [lockoutSeconds]);

   const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setEmailNotConfirmed(false);

      const remaining = authService.getLockoutRemainingSeconds();
      if (remaining > 0) {
         setLockoutSeconds(remaining);
         setError(t('auth:login.accountLocked', { seconds: remaining }));
         return;
      }

      setIsLoading(true);
      try {
         // Navigation happens once AuthContext sets the user, i.e. after any pending second factor.
         if (isLocal) {
            await unlockLocalVault(password);
         } else {
            // Anti-bot check in cloud mode
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
            await login(email, password, { captchaToken: payload?.captchaToken });
         }
      } catch (err: unknown) {
         antiBotRef.current?.reset();
         const currentLockout = authService.getLockoutRemainingSeconds();
         if (err instanceof Error && err.name === 'EmailNotConfirmedError') {
            setEmailNotConfirmed(true);
            setError(t('auth:verification.emailNotConfirmed'));
         } else if (currentLockout > 0) {
            setLockoutSeconds(currentLockout);
            setError(t('auth:login.accountLocked', { seconds: currentLockout }));
         } else {
            setError(mapAuthErrorMessage(err, t, 'auth:login.failedToLogin'));
         }
      } finally {
         setIsLoading(false);
      }
   };

   // Local: PRF unlock of this device's vault. Cloud: Supabase passkey sign-in (+ PRF unlock).
   const handlePasskeySignIn = async () => {
      setError('');
      setIsLoading(true);
      try {
         await signInWithPasskey();
      } catch (err: unknown) {
         setError(mapAuthErrorMessage(err, t, 'common:errors.passkey.FAILED'));
      } finally {
         setIsLoading(false);
      }
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

   const handleAppleLogin = async () => {
      setError('');
      setIsLoading(true);
      try {
         await authService.signInWithOAuth('apple');
      } catch {
         setError(t('auth:login.appleSandboxError'));
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
            <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-brand/10 blur-[100px]"></div>
            <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-brand/10 blur-[100px]"></div>
         </div>

         <div className="relative w-full max-w-md bg-card border border-subtle rounded-2xl p-8 shadow-2xl">
            <div className="flex flex-col items-center mb-8 text-center">
               <div className="w-12 h-12 bg-brand-static rounded-xl flex items-center justify-center transform rotate-45 mb-4 shadow-lg shadow-brand/20">
                  <div className="transform -rotate-45 text-white font-bold text-xl">
                     <Hexagon size={24} fill="currentColor" />
                  </div>
               </div>
               <h1 className="text-2xl font-bold text-primary">
                  {isLocal ? t('auth:login.localVaultTitle') : t('auth:login.title')}
               </h1>
               <p className="text-secondary mt-1 text-xs">
                  {isLocal ? t('auth:login.localVaultSubtitle') : t('auth:login.subtitle')}
               </p>
            </div>

            {user && (
               <div className="mb-6 p-3 bg-brand/10 border border-brand/20 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate pr-2">
                     <span className="w-2 h-2 rounded-full bg-positive animate-pulse shrink-0" />
                     <span className="text-secondary truncate">
                        {t('auth:login.alreadyLoggedInAs', { name: user.name })}
                     </span>
                  </div>
                  <Link
                     to="/"
                     className="text-brand hover:underline font-semibold flex items-center gap-1 shrink-0"
                  >
                     <span>{t('auth:login.goToDashboard')}</span>
                     <span>→</span>
                  </Link>
               </div>
            )}

            {(error || demoError) && (
               <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg flex items-center gap-2 text-error text-sm">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error || demoError}</span>
               </div>
            )}

            {emailNotConfirmed && (
               <Button type="button" variant="secondary" className="w-full mb-4" onClick={handleEnterVerificationCode}>
                  {t('auth:verification.enterCodeButton')}
               </Button>
            )}

            {lockoutSeconds > 0 && (
               <div className="mb-4 p-3 bg-warning/10 border border-warning/20 rounded-lg flex items-center gap-2 text-warning text-xs">
                  <ShieldAlert size={16} className="shrink-0" />
                  <span>{t('auth:login.accountLocked', { seconds: lockoutSeconds })}</span>
               </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
               {isLocal ? (
                     <div>
                        {/* Hidden username to anchor password autofill in local mode */}
                        <input
                           type="text"
                           name="username"
                           id="local-username"
                           autoComplete="username"
                           defaultValue="local-user"
                           className="sr-only"
                           tabIndex={-1}
                           aria-hidden="true"
                        />
                        <label htmlFor="login-password" className="block text-xs font-medium text-secondary mb-1.5">{t('auth:login.masterPasswordLabel')}</label>
                        <div className="relative">
                           <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-tertiary" size={18} />
                           <input
                              id="login-password"
                              name="password"
                              type="password"
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              autoComplete="current-password"
                              className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary block pl-10 p-2.5 placeholder-tertiary"
                              placeholder={t('auth:login.masterPasswordPlaceholder')}
                           />
                        </div>
                     </div>
               ) : (
                  <>
                     <div>
                        <label htmlFor="login-email" className="block text-xs font-medium text-secondary mb-1.5">{t('auth:login.emailLabel')}</label>
                        <div className="relative">
                           <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-tertiary" size={18} />
                           <input
                              id="login-email"
                              name="email"
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              autoComplete="username webauthn"
                              spellCheck={false}
                              className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary block pl-10 p-2.5 placeholder-tertiary"
                              placeholder={t('auth:login.emailPlaceholder')}
                           />
                        </div>
                     </div>
                     <div>
                        <label htmlFor="login-password" className="block text-xs font-medium text-secondary mb-1.5">{t('auth:login.passwordLabel')}</label>
                        <div className="relative">
                           <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-tertiary" size={18} />
                           <input
                              id="login-password"
                              name="password"
                              type="password"
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              autoComplete="current-password"
                              className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary block pl-10 p-2.5 placeholder-tertiary"
                              placeholder={t('auth:login.passwordPlaceholder')}
                           />
                        </div>
                     </div>
                     <div className="flex justify-end">
                        <Link to="/forgot-password" className="text-xs text-brand hover:text-brand/80">{t('auth:login.forgotPassword')}</Link>
                     </div>
                  </>
               )}

               <Button type="submit" className="w-full" isLoading={isLoading} disabled={lockoutSeconds > 0}>
                  {isLocal ? t('auth:login.unlockVaultButton') : t('auth:login.signInButton')}
               </Button>
            </form>

            {!isLocal && <AntiBotShield ref={antiBotRef} />}

            {isLocal && (
               <div className="mt-3 text-center">
                  {/* The recovery key resets the master password and is rotated at the same time. */}
                  <Link
                     to="/reset-password?mode=recover"
                     className="text-xs text-brand hover:text-brand/80 transition-colors inline-flex items-center gap-1.5"
                  >
                     <KeyRound size={13} />
                     {t('auth:login.useRecoveryKey')}
                  </Link>
               </div>
            )}

            <div className="mt-6 pt-6 border-t border-subtle space-y-2.5">
               {passkeySupported && (!isLocal || passkeyService.canUnlockVaultHere()) && (
                  <button
                     type="button"
                     onClick={handlePasskeySignIn}
                     disabled={isLoading}
                     className="w-full flex items-center justify-center gap-2.5 bg-subtle hover:bg-card-hover text-primary px-4 py-2.5 rounded-lg border border-subtle transition-colors text-sm font-medium shadow-sm"
                  >
                     <Fingerprint size={18} className="text-brand" />
                     {isLocal ? t('auth:login.unlockWithPasskey') : t('auth:login.signInWithPasskey')}
                  </button>
               )}

               {!isLocal && (
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
                     {t('auth:login.signInWithGoogle')}
                  </button>
               )}

                {isLocal && (
                   <button
                      type="button"
                      onClick={() => launchDemo(from)}
                      disabled={isLoading || isLaunchingDemo}
                      className="w-full flex items-center justify-center gap-2 bg-brand/10 hover:bg-brand/20 text-brand border border-brand/30 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm disabled:opacity-60"
                   >
                      <Sparkles size={16} />
                      {t('auth:login.exploreDemoAccount')}
                   </button>
                )}
            </div>

            <p className="text-center text-secondary text-sm mt-6">
               {isLocal ? (
                  <>
                     {t('auth:login.noLocalVault')}{' '}
                     <Link to="/signup" className="text-brand hover:text-brand/80 font-medium">
                        {t('auth:login.initLocalVaultLink')}
                     </Link>
                  </>
               ) : (
                  <>
                     {t('auth:login.noAccount')}{' '}
                     <Link to="/signup" className="text-brand hover:text-brand/80 font-medium">
                        {t('auth:login.signUpLink')}
                     </Link>
                  </>
               )}
            </p>

            <div className="flex items-center justify-center gap-3 text-xs text-tertiary mt-4 pt-4 border-t border-subtle">
               <Link to="/welcome" className="hover:text-primary transition-colors">
                  {t('landing:header.brandName')}
               </Link>
               <span>&bull;</span>
               <Link to="/privacy" className="hover:text-primary transition-colors">
                  {t('legal:center.tabs.privacy')}
               </Link>
               <span>&bull;</span>
               <Link to="/terms" className="hover:text-primary transition-colors">
                  {t('legal:center.tabs.terms')}
               </Link>
            </div>
         </div>

         {pendingSecondFactor && (
            <TwoFactorChallengeModal
               isOpen
               methods={pendingSecondFactor}
               onCancel={() => {
                  void cancelSecondFactor();
               }}
            />
         )}
      </div>
   );
};

export default Login;
