import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import { Hexagon, Mail, Lock, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Signup: React.FC = () => {
   const { t } = useTranslation();
   const { signup } = useAuth();
   const navigate = useNavigate();

   const [name, setName] = useState('');
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [isLoading, setIsLoading] = useState(false);

   const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      await signup(email, password, name);
      setIsLoading(false);
      navigate('/');
   };

   return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
         {/* Background Elements */}
         <div className="fixed inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-purple-600/20 blur-[100px]"></div>
            <div className="absolute top-[20%] -left-[10%] w-[40%] h-[40%] rounded-full bg-blue-600/20 blur-[100px]"></div>
         </div>

         <div className="relative w-full max-w-md bg-slate-800/50 border border-slate-700 backdrop-blur-xl rounded-2xl p-8 shadow-2xl">

            <div className="flex flex-col items-center mb-8">
               <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center transform rotate-45 mb-4 shadow-lg shadow-blue-600/20">
                  <div className="transform -rotate-45 text-white font-bold text-xl">
                     <Hexagon size={24} fill="currentColor" />
                  </div>
               </div>
               <h1 className="text-2xl font-bold text-white">{t('auth:signup.title')}</h1>
               <p className="text-slate-400 mt-1">{t('auth:signup.subtitle')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
               <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('auth:signup.fullNameLabel')}</label>
                  <div className="relative">
                     <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" size={18} />
                     <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-700 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block pl-10 p-2.5 placeholder-slate-500"
                        placeholder={t('auth:signup.fullNamePlaceholder')}
                     />
                  </div>
               </div>
               <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('auth:signup.emailLabel')}</label>
                  <div className="relative">
                     <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" size={18} />
                     <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-700 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block pl-10 p-2.5 placeholder-slate-500"
                        placeholder={t('auth:signup.emailPlaceholder')}
                     />
                  </div>
               </div>
               <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('auth:signup.passwordLabel')}</label>
                  <div className="relative">
                     <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" size={18} />
                     <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-700 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block pl-10 p-2.5 placeholder-slate-500"
                        placeholder={t('auth:signup.passwordPlaceholder')}
                     />
                  </div>
               </div>

               <div className="text-xs text-slate-500 mt-2">
                  {t('auth:signup.termsText')}
               </div>

               <Button type="submit" className="w-full" isLoading={isLoading}>{t('auth:signup.createAccountButton')}</Button>
            </form>

            <p className="text-center text-slate-400 text-sm mt-6">
               {t('auth:signup.hasAccount')} <Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium">{t('auth:signup.loginLink')}</Link>
            </p>
         </div>
      </div>
   );
};

export default Signup;