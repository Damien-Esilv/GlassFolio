import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import { Hexagon, Mail, Lock, User, AlertCircle, ArrowLeft, Key } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PasswordStrengthMeter } from '../components/security/PasswordStrengthMeter';
import { RecoveryKeyDialog } from '../components/security/RecoveryKeyDialog';
import { evaluatePassword } from '../src/services/security/passwordValidator';
import { ThemeLangDropdowns } from '../components/ui/ThemeLangDropdowns';
import { isShowcaseAvailable, buildShowcaseDestinationUrl, getShowcaseUrl, getDeploymentMode } from '../src/config/deployment';

const Signup: React.FC = () => {
   const { t } = useTranslation();
   const { signup, setupLocalVault } = useAuth();
   const navigate = useNavigate();
   const deploymentMode = getDeploymentMode();
   const isLocal = deploymentMode === 'local';

   const [name, setName] = useState('');
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [error, setError] = useState('');
   const [isLoading, setIsLoading] = useState(false);
   const [pendingRecoveryKey, setPendingRecoveryKey] = useState<string | null>(null);

   const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      const evalResult = evaluatePassword(password);
      if (!evalResult.isValid) {
         setError(t('auth:signup.passwordWeakError'));
         return;
      }

      setIsLoading(true);
      try {
         let recoveryKey: string | undefined;
         if (isLocal) {
            recoveryKey = await setupLocalVault(name, password);
         } else {
            recoveryKey = await signup(email, password, name);
         }

         if (recoveryKey) {
            setPendingRecoveryKey(recoveryKey);
         } else {
            navigate('/', { replace: true });
         }
      } catch (err: unknown) {
         const message = err instanceof Error ? err.message : t('auth:signup.failedToSignup');
         setError(message);
      } finally {
         setIsLoading(false);
      }
   };

   const showcaseAvailable = isShowcaseAvailable();
   const isExternalShowcase = Boolean(getShowcaseUrl());
   const showcaseDestination = buildShowcaseDestinationUrl('/');

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

            <form onSubmit={handleSubmit} className="space-y-4">
               <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">{t('auth:signup.fullNameLabel')}</label>
                  <div className="relative">
                     <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-tertiary" size={18} />
                     <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary block pl-10 p-2.5 placeholder-tertiary"
                        placeholder={t('auth:signup.fullNamePlaceholder')}
                     />
                  </div>
               </div>

               {!isLocal && (
                  <div>
                     <label className="block text-xs font-medium text-secondary mb-1.5">{t('auth:signup.emailLabel')}</label>
                     <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-tertiary" size={18} />
                        <input
                           type="email"
                           required
                           value={email}
                           onChange={(e) => setEmail(e.target.value)}
                           className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary block pl-10 p-2.5 placeholder-tertiary"
                           placeholder={t('auth:signup.emailPlaceholder')}
                        />
                     </div>
                  </div>
               )}

               <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">
                     {isLocal ? t('auth:signup.masterPasswordLabel') : t('auth:signup.passwordLabel')}
                  </label>
                  <div className="relative">
                     {isLocal ? (
                        <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-tertiary" size={18} />
                     ) : (
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-tertiary" size={18} />
                     )}
                     <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary block pl-10 p-2.5 placeholder-tertiary"
                        placeholder={isLocal ? t('auth:signup.masterPasswordPlaceholder') : t('auth:signup.passwordPlaceholder')}
                     />
                  </div>
                  <PasswordStrengthMeter password={password} />
               </div>

               <div className="text-xs text-secondary mt-2">
                  {t('auth:signup.termsText')}
               </div>

               <Button type="submit" className="w-full" isLoading={isLoading}>
                  {isLocal ? t('auth:signup.initVaultButton') : t('auth:signup.createAccountButton')}
               </Button>
            </form>

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
               onConfirmed={() => {
                  setPendingRecoveryKey(null);
                  navigate('/', { replace: true });
               }}
            />
         )}
      </div>
   );
};

export default Signup;