import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import { Hexagon, Mail, Lock, AlertCircle, Sparkles, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authService } from '../src/services/security/authService';

const Login: React.FC = () => {
   const { t } = useTranslation();
   const { login } = useAuth();
   const navigate = useNavigate();

   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [error, setError] = useState('');
   const [isLoading, setIsLoading] = useState(false);
   const [lockoutSeconds, setLockoutSeconds] = useState(() => authService.getLockoutRemainingSeconds());

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

      const remaining = authService.getLockoutRemainingSeconds();
      if (remaining > 0) {
         setLockoutSeconds(remaining);
         setError(t('auth:login.accountLocked', { seconds: remaining }));
         return;
      }

      setIsLoading(true);
      try {
         await login(email, password);
         navigate('/');
      } catch (err: unknown) {
         const currentLockout = authService.getLockoutRemainingSeconds();
         if (currentLockout > 0) {
            setLockoutSeconds(currentLockout);
            setError(t('auth:login.accountLocked', { seconds: currentLockout }));
         } else {
            const message = err instanceof Error ? err.message : t('auth:login.failedToLogin');
            setError(message);
         }
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

   const handleExploreDemo = async () => {
      setError('');
      setIsLoading(true);
      try {
         await login('demo@glassfolio.com', 'password');
         navigate('/');
      } catch (err: unknown) {
         const message = err instanceof Error ? err.message : t('auth:login.failedToLogin');
         setError(message);
      } finally {
         setIsLoading(false);
      }
   };

   return (
      <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
         {/* Background Elements */}
         <div className="fixed inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-brand/10 blur-[100px]"></div>
            <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-brand/10 blur-[100px]"></div>
         </div>

         <div className="relative w-full max-w-md bg-card/50 border border-subtle backdrop-blur-xl rounded-2xl p-8 shadow-2xl">
            <div className="flex flex-col items-center mb-8">
               <div className="w-12 h-12 bg-brand-static rounded-xl flex items-center justify-center transform rotate-45 mb-4 shadow-lg shadow-brand/20">
                  <div className="transform -rotate-45 text-white font-bold text-xl">
                     <Hexagon size={24} fill="currentColor" />
                  </div>
               </div>
               <h1 className="text-2xl font-bold text-primary">{t('auth:login.title')}</h1>
               <p className="text-secondary mt-1">{t('auth:login.subtitle')}</p>
            </div>

            {error && (
               <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg flex items-center gap-2 text-error text-sm">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
               </div>
            )}

            {lockoutSeconds > 0 && (
               <div className="mb-4 p-3 bg-warning/10 border border-warning/20 rounded-lg flex items-center gap-2 text-warning text-xs">
                  <ShieldAlert size={16} className="shrink-0" />
                  <span>{t('auth:login.accountLocked', { seconds: lockoutSeconds })}</span>
               </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
               <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">{t('auth:login.emailLabel')}</label>
                  <div className="relative">
                     <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-tertiary" size={18} />
                     <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary block pl-10 p-2.5 placeholder-tertiary"
                        placeholder={t('auth:login.emailPlaceholder')}
                     />
                  </div>
               </div>
               <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">{t('auth:login.passwordLabel')}</label>
                  <div className="relative">
                     <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-tertiary" size={18} />
                     <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary block pl-10 p-2.5 placeholder-tertiary"
                        placeholder={t('auth:login.passwordPlaceholder')}
                     />
                  </div>
               </div>

               <div className="flex justify-end">
                  <Link to="#" className="text-xs text-brand hover:text-brand/80">{t('auth:login.forgotPassword')}</Link>
               </div>

               <Button type="submit" className="w-full" isLoading={isLoading} disabled={lockoutSeconds > 0}>
                  {t('auth:login.signInButton')}
               </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-subtle space-y-2.5">
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

               <button
                  type="button"
                  onClick={handleAppleLogin}
                  className="w-full flex items-center justify-center gap-3 bg-subtle hover:bg-card-hover text-primary px-4 py-2.5 rounded-lg border border-subtle transition-colors text-sm font-medium"
               >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                     <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.42c.67-.82 1.13-1.96.99-3.12-1 .04-2.22.67-2.93 1.5-.63.73-1.18 1.9-1.03 3.02 1.12.09 2.29-.58 2.97-1.4z" />
                  </svg>
                  {t('auth:login.signInWithApple')}
               </button>

               <button
                  type="button"
                  onClick={handleExploreDemo}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 bg-brand/10 hover:bg-brand/20 text-brand border border-brand/30 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm"
               >
                  <Sparkles size={16} />
                  {t('auth:login.exploreDemoAccount')}
               </button>
            </div>

            <p className="text-center text-secondary text-sm mt-6">
               {t('auth:login.noAccount')} <Link to="/signup" className="text-brand hover:text-brand/80 font-medium">{t('auth:login.signUpLink')}</Link>
            </p>
         </div>
      </div>
   );
};

export default Login;