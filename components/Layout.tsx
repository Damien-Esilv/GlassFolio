import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, PieChart, ArrowRightLeft, FileText, Settings, Search, Bell, Hexagon, LogOut, User as UserIcon, ChevronDown, Trophy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // If not authenticated (e.g. on login page), just show children without the sidebar/header
  if (!user) {
      return <>{children}</>;
  }

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Positions', path: '/positions', icon: PieChart },
    { name: 'Transactions', path: '/transactions', icon: ArrowRightLeft },
    { name: 'Progress', path: '/progress', icon: Trophy },
    { name: 'Reports', path: '/reports', icon: FileText },
  ];

  const handleLogout = () => {
      logout();
      navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background text-white font-display">
      {/* Top Navigation - Solid Background */}
      <header className="sticky top-0 z-40 border-b border-black/10 dark:border-white/10 bg-background shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center transform rotate-45">
               <div className="transform -rotate-45 text-white font-bold text-lg">
                 <Hexagon size={20} fill="currentColor" />
               </div>
            </div>
            <span className="text-xl font-bold tracking-tight text-black dark:text-white">Glassfolio</span>
          </Link>

          {/* Nav Links */}
          <nav className="hidden md:flex space-x-1">
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center gap-2 ${
                  isActive(item.path)
                    ? 'bg-black/5 dark:bg-white/10 text-primary'
                    : 'text-black/60 dark:text-white/60 hover:text-primary dark:hover:text-primary'
                }`}
              >
                <item.icon size={18} />
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            <div className="hidden md:flex relative">
               <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black/40 dark:text-white/40" size={16} />
               <input 
                  type="text" 
                  placeholder="Search..." 
                  className="bg-black/5 dark:bg-white/5 border-none rounded-full py-1.5 pl-10 pr-4 text-sm text-black dark:text-white focus:ring-2 focus:ring-primary w-32 lg:w-64 transition-all placeholder-black/40 dark:placeholder-white/40"
               />
            </div>
            <button className="p-2 text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors relative">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-background"></span>
            </button>
            
            {/* User Menu Dropdown */}
            <div className="relative ml-2" ref={userMenuRef}>
                <button 
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center gap-3 pl-2 border-l border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 rounded-r-lg transition-colors p-1"
                >
                    <div className="hidden lg:block text-right">
                        <p className="text-xs font-bold text-black dark:text-white">{user.name}</p>
                        <p className="text-[10px] text-black/50 dark:text-white/50">Pro Plan</p>
                    </div>
                    <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-xs font-bold border-2 border-background cursor-pointer overflow-hidden shrink-0 ring-1 ring-black/10 dark:ring-white/10">
                    {user.avatar ? (
                        <img src={user.avatar} alt="User" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-white">{user.name.charAt(0)}</span>
                    )}
                    </div>
                    <ChevronDown size={14} className={`text-black/40 dark:text-white/40 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Box */}
                {isUserMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-xl border border-black/10 dark:border-white/10 shadow-xl py-2 animate-in fade-in slide-in-from-top-2 z-50">
                        <div className="px-4 py-3 border-b border-black/5 dark:border-white/5 mb-1">
                            <p className="text-sm font-medium text-black dark:text-white">{user.name}</p>
                            <p className="text-xs text-black/50 dark:text-white/50 truncate">{user.email}</p>
                        </div>
                        
                        <Link 
                            to="/settings?tab=profile" 
                            className="flex items-center gap-2 px-4 py-2 text-sm text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 hover:text-primary transition-colors"
                            onClick={() => setIsUserMenuOpen(false)}
                        >
                            <UserIcon size={16} />
                            Profile & Account
                        </Link>
                         <Link 
                            to="/settings?tab=preferences" 
                            className="flex items-center gap-2 px-4 py-2 text-sm text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 hover:text-primary transition-colors"
                            onClick={() => setIsUserMenuOpen(false)}
                        >
                            <Settings size={16} />
                            Preferences
                        </Link>
                        
                        <div className="border-t border-black/5 dark:border-white/5 mt-1 pt-1">
                            <button 
                                onClick={handleLogout}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-accent-red hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
                            >
                                <LogOut size={16} />
                                Sign Out
                            </button>
                        </div>
                    </div>
                )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};

export default Layout;