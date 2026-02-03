import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, PieChart, ArrowRightLeft, FileText, Settings, Search, Bell, Hexagon,
  LogOut, User as UserIcon, ChevronDown, ChevronRight, Trophy, Briefcase, Menu, X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isPortfolioExpanded, setIsPortfolioExpanded] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

  // Auto-expand Portfolio section if on a portfolio-related page
  useEffect(() => {
    if (['/portfolio', '/positions', '/transactions'].includes(location.pathname)) {
      setIsPortfolioExpanded(true);
    }
  }, [location.pathname]);

  // If not authenticated (e.g. on login page), just show children without the sidebar/header
  if (!user) {
    return <>{children}</>;
  }

  const isActive = (path: string) => location.pathname === path;
  const isPortfolioActive = ['/portfolio', '/positions', '/transactions'].includes(location.pathname);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Sidebar nav item component
  const NavItem: React.FC<{
    path: string;
    icon: React.ElementType;
    name: string;
    indent?: boolean;
    onClick?: () => void;
  }> = ({ path, icon: Icon, name, indent = false, onClick }) => (
    <Link
      to={path}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${indent ? 'ml-6' : ''
        } ${isActive(path)
          ? 'bg-primary/10 text-primary'
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
        }`}
    >
      <Icon size={18} />
      {name}
    </Link>
  );

  // Sidebar content (shared between desktop and mobile)
  const SidebarContent = () => (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {/* Dashboard */}
      <NavItem path="/" icon={LayoutDashboard} name="Dashboard" onClick={() => setIsMobileMenuOpen(false)} />

      {/* Portfolio Section (Collapsible) */}
      <div>
        <button
          onClick={() => setIsPortfolioExpanded(!isPortfolioExpanded)}
          className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${isPortfolioActive
            ? 'bg-primary/10 text-primary'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
            }`}
        >
          <div className="flex items-center gap-3">
            <Briefcase size={18} />
            Portfolio
          </div>
          {isPortfolioExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {/* Portfolio Sub-items */}
        {isPortfolioExpanded && (
          <div className="mt-1 space-y-0.5 animate-in slide-in-from-top-2">
            <NavItem path="/portfolio" icon={PieChart} name="Summary" indent onClick={() => setIsMobileMenuOpen(false)} />
            <NavItem path="/positions" icon={LayoutDashboard} name="Positions" indent onClick={() => setIsMobileMenuOpen(false)} />
            <NavItem path="/transactions" icon={ArrowRightLeft} name="Transactions" indent onClick={() => setIsMobileMenuOpen(false)} />
          </div>
        )}
      </div>

      {/* Progress */}
      <NavItem path="/progress" icon={Trophy} name="Progress" onClick={() => setIsMobileMenuOpen(false)} />

      {/* Reports */}
      <NavItem path="/reports" icon={FileText} name="Reports" onClick={() => setIsMobileMenuOpen(false)} />
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-display">
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Desktop (Fixed) */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-60 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-30">
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-slate-200 dark:border-slate-800">
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="w-8 h-8 bg-brand-static rounded-lg flex items-center justify-center transform rotate-45">
              <div className="transform -rotate-45 text-white font-bold text-lg">
                <Hexagon size={20} fill="currentColor" />
              </div>
            </div>
            <span className="text-xl font-bold tracking-tight">Glassfolio</span>
          </Link>
        </div>

        <SidebarContent />

        {/* Settings at bottom */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          <NavItem path="/settings" icon={Settings} name="Settings" />
        </div>
      </aside>

      {/* Sidebar - Mobile (Slide in) */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-50 transform transition-transform duration-200 md:hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
        {/* Mobile Logo & Close */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-static rounded-lg flex items-center justify-center transform rotate-45">
              <div className="transform -rotate-45 text-white font-bold text-lg">
                <Hexagon size={20} fill="currentColor" />
              </div>
            </div>
            <span className="text-xl font-bold tracking-tight">Glassfolio</span>
          </Link>
          <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <SidebarContent />
      </aside>

      {/* Main Content Area */}
      <div className="md:pl-60">
        {/* Top Header */}
        <header className="sticky top-0 z-20 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 md:px-6">
          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg md:hidden"
          >
            <Menu size={20} />
          </button>

          {/* Search */}
          <div className="hidden md:flex relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search..."
              className="bg-slate-100 dark:bg-slate-800 border-none rounded-full py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary w-64 transition-all placeholder-slate-400"
            />
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            <button className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors relative">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-white dark:border-slate-900"></span>
            </button>

            {/* User Menu Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-3 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-bold">{user.name}</p>
                  <p className="text-[10px] text-slate-500">Pro Plan</p>
                </div>
                <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white dark:border-slate-800 overflow-hidden">
                  {user.avatar ? (
                    <img src={user.avatar} alt="User" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white">{user.name.charAt(0)}</span>
                  )}
                </div>
                <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Box */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl py-2 animate-in fade-in slide-in-from-top-2 z-50">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 mb-1">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>

                  <Link
                    to="/settings?tab=profile"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-primary transition-colors"
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    <UserIcon size={16} />
                    Profile & Account
                  </Link>
                  <Link
                    to="/settings?tab=preferences"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-primary transition-colors"
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    <Settings size={16} />
                    Preferences
                  </Link>

                  <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;