import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import { Hexagon, Mail, Lock, AlertCircle } from 'lucide-react';

const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
     // Visual simulation
     setIsLoading(true);
     setTimeout(() => {
        setIsLoading(false);
        setError("Google Login is currently in sandbox mode. Please use the Demo User.");
     }, 800);
  };

  const fillDemo = () => {
      setEmail('demo@glassfolio.com');
      setPassword('password');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
       {/* Background Elements */}
       <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-600/20 blur-[100px]"></div>
          <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[100px]"></div>
       </div>

       <div className="relative w-full max-w-md bg-slate-800/50 border border-slate-700 backdrop-blur-xl rounded-2xl p-8 shadow-2xl">
          
          <div className="flex flex-col items-center mb-8">
             <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center transform rotate-45 mb-4 shadow-lg shadow-blue-600/20">
                <div className="transform -rotate-45 text-white font-bold text-xl">
                   <Hexagon size={24} fill="currentColor" />
                </div>
             </div>
             <h1 className="text-2xl font-bold text-white">Welcome Back</h1>
             <p className="text-slate-400 mt-1">Sign in to your Glassfolio account</p>
          </div>

          {error && (
             <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2 text-rose-400 text-sm">
                <AlertCircle size={16} />
                {error}
             </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
             <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email Address</label>
                <div className="relative">
                   <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" size={18} />
                   <input 
                      type="email" 
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-900/50 border border-slate-700 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block pl-10 p-2.5 placeholder-slate-500"
                      placeholder="you@example.com"
                   />
                </div>
             </div>
             <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
                <div className="relative">
                   <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" size={18} />
                   <input 
                      type="password" 
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-900/50 border border-slate-700 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block pl-10 p-2.5 placeholder-slate-500"
                      placeholder="••••••••"
                   />
                </div>
             </div>

             <div className="flex justify-end">
                <Link to="#" className="text-xs text-blue-400 hover:text-blue-300">Forgot password?</Link>
             </div>

             <Button type="submit" className="w-full" isLoading={isLoading}>Sign In</Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-700/50">
             <button 
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 bg-slate-700/50 hover:bg-slate-700 text-white px-4 py-2.5 rounded-lg transition-colors text-sm font-medium mb-3"
             >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with Google
             </button>
             <button 
                onClick={fillDemo}
                className="w-full text-xs text-slate-400 hover:text-slate-300 underline"
             >
                Use Demo Account (demo@glassfolio.com)
             </button>
          </div>

          <p className="text-center text-slate-400 text-sm mt-6">
             Don't have an account? <Link to="/signup" className="text-blue-400 hover:text-blue-300 font-medium">Sign up</Link>
          </p>
       </div>
    </div>
  );
};

export default Login;