import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, PieChart, ArrowRightLeft, FileText, Settings, Bell, Hexagon,
  LogOut, User as UserIcon, ChevronDown, ChevronRight, Trophy, Briefcase, Menu, X, RefreshCw
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { lastPriceRefresh, forceRefreshPrices } = useData();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isPortfolioExpanded, setIsPortfolioExpanded] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  /** Human-readable freshness label */
  const freshnessLabel = useMemo(() => {
    if (!lastPriceRefresh) return null;
    const diffMs = Date.now() - new Date(lastPriceRefresh).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return t('dashboard:priceJustRefreshed');
    if (diffMin < 60) return t('dashboard:priceRefreshedMinutesAgo', { count: diffMin });
    return t('dashboard:priceRefreshedOverAnHourAgo');
  }, [lastPriceRefresh, t]);

  const handleForceRefresh = useCallback(async () => {
    setIsRefreshingPrices(true);
    await forceRefreshPrices();
    setIsRefreshingPrices(false);
  }, [forceRefreshPrices]);

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
          : 'text-secondary hover:bg-subtle hover:text-primary'
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
      <NavItem path="/" icon={LayoutDashboard} name={t('navigation:menu.dashboard')} onClick={() => setIsMobileMenuOpen(false)} />

      {/* Portfolio Section (Collapsible) */}
      <div>
        <button
          onClick={() => setIsPortfolioExpanded(!isPortfolioExpanded)}
          className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${isPortfolioActive
            ? 'bg-primary/10 text-primary'
            : 'text-secondary hover:bg-subtle hover:text-primary'
            }`}
        >
          <div className="flex items-center gap-3">
            <Briefcase size={18} />
            {t('navigation:menu.portfolio')}
          </div>
          {isPortfolioExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {/* Portfolio Sub-items */}
        {isPortfolioExpanded && (
          <div className="mt-1 space-y-0.5 animate-in slide-in-from-top-2">
            <NavItem path="/portfolio" icon={PieChart} name={t('navigation:menu.summary')} indent onClick={() => setIsMobileMenuOpen(false)} />
            <NavItem path="/positions" icon={LayoutDashboard} name={t('navigation:menu.positions')} indent onClick={() => setIsMobileMenuOpen(false)} />
            <NavItem path="/transactions" icon={ArrowRightLeft} name={t('navigation:menu.transactions')} indent onClick={() => setIsMobileMenuOpen(false)} />
          </div>
        )}
      </div>

      {/* Progress */}
      <NavItem path="/progress" icon={Trophy} name={t('navigation:menu.progress')} onClick={() => setIsMobileMenuOpen(false)} />

      {/* Reports */}
      <NavItem path="/reports" icon={FileText} name={t('navigation:menu.reports')} onClick={() => setIsMobileMenuOpen(false)} />
    </nav>
  );

  return (
    <div className="min-h-screen bg-canvas text-primary font-display">
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Desktop (Fixed) */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-60 bg-card border-r border-subtle z-30">
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-subtle">
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="w-8 h-8 bg-brand-static rounded-lg flex items-center justify-center transform rotate-45">
              <div className="transform -rotate-45 text-white font-bold text-lg">
                <Hexagon size={20} fill="currentColor" />
              </div>
            </div>
            <span className="text-xl font-bold tracking-tight">{t('navigation:brandName')}</span>
          </Link>
        </div>

        <SidebarContent />

        {/* Settings at bottom */}
        <div className="p-3 border-t border-subtle">
          <NavItem path="/settings" icon={Settings} name="Settings" />
        </div>
      </aside>

      {/* Sidebar - Mobile (Slide in) */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-card border-r border-subtle z-50 transform transition-transform duration-200 md:hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
        {/* Mobile Logo & Close */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-subtle">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-static rounded-lg flex items-center justify-center transform rotate-45">
              <div className="transform -rotate-45 text-white font-bold text-lg">
                <Hexagon size={20} fill="currentColor" />
              </div>
            </div>
            <span className="text-xl font-bold tracking-tight">{t('navigation:brandName')}</span>
          </Link>
          <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 hover:bg-subtle rounded-lg">
            <X size={20} />
          </button>
        </div>

        <SidebarContent />
      </aside>

      {/* Main Content Area */}
      <div className="md:pl-60">
        {/* Top Header */}
        <header className="sticky top-0 z-40 h-16 bg-card border-b border-subtle flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 hover:bg-subtle rounded-lg md:hidden"
            >
              <Menu size={20} />
            </button>

            {/* Live Price Freshness Badge & Refresh Button (Left Side) */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-subtle/60 border border-subtle text-xs">
              {freshnessLabel ? (
                <span className="flex items-center gap-1.5 text-tertiary text-[11px] font-medium">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <span className="hidden sm:inline">{freshnessLabel}</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-tertiary text-[11px] font-medium">
                  <span className="w-2 h-2 rounded-full bg-warning" />
                  <span className="hidden sm:inline">{t('dashboard:priceOffline')}</span>
                </span>
              )}
              <button
                onClick={handleForceRefresh}
                disabled={isRefreshingPrices}
                className="p-1 text-secondary hover:text-brand transition-colors disabled:opacity-50"
                title={t('dashboard:forceRefreshPrices')}
                aria-label={t('dashboard:forceRefreshPrices')}
              >
                <RefreshCw size={13} className={isRefreshingPrices ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Right Actions (Notifications + Profile) */}
          <div className="flex items-center gap-3 ml-auto">
            <button className="p-2 text-secondary hover:bg-subtle rounded-full transition-colors relative" aria-label="Notifications">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-card"></span>
            </button>

            {/* User Menu Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-3 p-1.5 hover:bg-subtle rounded-lg transition-colors"
              >
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-bold">{user.name}</p>
                </div>
                <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-xs font-bold border-2 border-card overflow-hidden">
                  {user.avatar ? (
                    <img src={user.avatar} alt="User" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white">{user.name.charAt(0)}</span>
                  )}
                </div>
                <ChevronDown size={14} className={`text-tertiary transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Box */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-card rounded-xl border border-subtle shadow-xl py-2 animate-in fade-in slide-in-from-top-2 z-50">
                  <div className="px-4 py-3 border-b border-subtle mb-1">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-secondary truncate">{user.email}</p>
                  </div>

                  <Link
                    to="/settings?tab=profile"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-secondary hover:bg-subtle hover:text-primary transition-colors"
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    <UserIcon size={16} />
                    {t('navigation:header.profileAndAccount')}
                  </Link>
                  <Link
                    to="/settings?tab=preferences"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-secondary hover:bg-subtle hover:text-primary transition-colors"
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    <Settings size={16} />
                    {t('navigation:header.preferences')}
                  </Link>

                  <div className="border-t border-subtle mt-1 pt-1">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-error hover:bg-subtle transition-colors text-left"
                    >
                      <LogOut size={16} />
                      {t('common:buttons.signOut')}
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