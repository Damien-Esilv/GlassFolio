import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, PieChart, ArrowRightLeft, Settings, Bell, Hexagon,
  LogOut, User as UserIcon, ChevronDown, ChevronRight, Trophy, Briefcase, Menu, X, RefreshCw, BarChart3,
  TrendingUp, Receipt, Coins, Scale, FileText, BookOpen, Lightbulb, Sparkles, Lock,
  PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { appStorage } from '../services/storage/appStorage';
import { AIChatDrawer } from './ai/AIChatDrawer';
import { ConsentBanner } from './ConsentBanner';
import { NotificationBellDropdown } from './notifications/NotificationBellDropdown';
import { NotificationToastContainer } from './notifications/NotificationToastContainer';
import { UserAvatar } from './ui/UserAvatar';
import { LocalPersistenceNotice } from './security/LocalPersistenceNotice';
import { PullToRefresh } from './ui/PullToRefresh';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, lockVault } = useAuth();
  const { lastPriceRefresh, forceRefreshPrices } = useData();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isPortfolioExpanded, setIsPortfolioExpanded] = useState(true);
  const [isAnalyticsExpanded, setIsAnalyticsExpanded] = useState(true);
  const [isFiscaliteExpanded, setIsFiscaliteExpanded] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return appStorage.getItem('gf_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const userMenuRef = useRef<HTMLDivElement>(null);

  const toggleSidebarCollapsed = useCallback(() => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        appStorage.setItem('gf_sidebar_collapsed', String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);


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
    if (['/portfolio', '/portfolio/summary', '/positions', '/transactions'].includes(location.pathname)) {
      setIsPortfolioExpanded(true);
    }
    if (location.pathname.startsWith('/analytics')) {
      setIsAnalyticsExpanded(true);
    }
    if (location.pathname.startsWith('/tax')) {
      setIsFiscaliteExpanded(true);
    }
  }, [location.pathname]);

  // Check if current route is a public full-screen route (Landing, Legal Center, Login, Signup)
  const PUBLIC_FULL_SCREEN_ROUTES = [
    '/login',
    '/signup',
    '/welcome',
    '/legal',
    '/privacy',
    '/terms',
    '/cookies',
    '/accessibility',
    '/self-host',
    '/about',
    '/roadmap',
    '/changelog',
  ];
  const isFullScreenRoute =
    PUBLIC_FULL_SCREEN_ROUTES.includes(location.pathname) ||
    location.pathname.startsWith('/welcome');

  // If not authenticated or currently on a public full-screen route, render children in full screen
  if (!user || isFullScreenRoute) {
    return (
      <>
        {children}
        <ConsentBanner />
      </>
    );
  }

  const isActive = (path: string) => location.pathname === path;
  const isPortfolioActive = ['/portfolio', '/portfolio/summary', '/positions', '/transactions'].includes(location.pathname);
  const isAnalyticsActive = location.pathname.startsWith('/analytics');
  const isFiscaliteActive = location.pathname.startsWith('/tax');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleLockVault = async () => {
    setIsUserMenuOpen(false);
    await lockVault();
  };

  // Sidebar nav item component
  const NavItem: React.FC<{
    path: string;
    icon: React.ElementType;
    name: string;
    indent?: boolean;
    onClick?: () => void;
    collapsed?: boolean;
  }> = ({ path, icon: Icon, name, indent = false, onClick, collapsed = false }) => (
    <Link
      to={path}
      onClick={onClick}
      title={name}
      aria-label={name}
      className={`flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
        collapsed ? 'justify-center px-2' : `px-4 ${indent ? 'ml-6' : ''}`
      } ${
        isActive(path)
          ? 'bg-primary/10 text-primary font-semibold'
          : 'text-secondary hover:bg-subtle hover:text-primary'
      }`}
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="truncate">{name}</span>}
    </Link>
  );

  // Sidebar content (shared between desktop and mobile)
  const SidebarContent: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {/* 1. Dashboard */}
      <NavItem
        path="/"
        icon={LayoutDashboard}
        name={t('navigation:menu.dashboard')}
        onClick={() => setIsMobileMenuOpen(false)}
        collapsed={collapsed}
      />

      {/* 2. Portfolio Section */}
      {collapsed ? (
        <NavItem
          path="/portfolio"
          icon={Briefcase}
          name={t('navigation:menu.portfolio')}
          onClick={() => setIsMobileMenuOpen(false)}
          collapsed
        />
      ) : (
        <div>
          <div
            className={`flex items-center rounded-lg text-sm font-medium transition-all ${
              isPortfolioActive
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-secondary hover:bg-subtle hover:text-primary'
            }`}
          >
            <Link
              to="/portfolio"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 flex-1 px-4 py-2.5"
            >
              <Briefcase size={18} />
              {t('navigation:menu.portfolio')}
            </Link>
            <button
              onClick={() => setIsPortfolioExpanded(!isPortfolioExpanded)}
              className="px-3 py-2.5 hover:text-primary"
              aria-label="Toggle portfolio menu"
            >
              {isPortfolioExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>

          {isPortfolioExpanded && (
            <div className="mt-1 space-y-0.5 animate-in slide-in-from-top-2">
              <NavItem
                path="/portfolio/summary"
                icon={PieChart}
                name={t('navigation:menu.summary')}
                indent
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <NavItem
                path="/positions"
                icon={LayoutDashboard}
                name={t('navigation:menu.positions')}
                indent
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <NavItem
                path="/transactions"
                icon={ArrowRightLeft}
                name={t('navigation:menu.transactions')}
                indent
                onClick={() => setIsMobileMenuOpen(false)}
              />
            </div>
          )}
        </div>
      )}

      {/* 3. Analytics Section */}
      {collapsed ? (
        <NavItem
          path="/analytics"
          icon={BarChart3}
          name={t('navigation:menu.analytics')}
          onClick={() => setIsMobileMenuOpen(false)}
          collapsed
        />
      ) : (
        <div>
          <div
            className={`flex items-center rounded-lg text-sm font-medium transition-all ${
              isAnalyticsActive
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-secondary hover:bg-subtle hover:text-primary'
            }`}
          >
            <Link
              to="/analytics"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 flex-1 px-4 py-2.5"
            >
              <BarChart3 size={18} />
              {t('navigation:menu.analytics')}
            </Link>
            <button
              onClick={() => setIsAnalyticsExpanded(!isAnalyticsExpanded)}
              className="px-3 py-2.5 hover:text-primary"
              aria-label="Toggle analytics menu"
            >
              {isAnalyticsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>

          {isAnalyticsExpanded && (
            <div className="mt-1 space-y-0.5 animate-in slide-in-from-top-2">
              <NavItem
                path="/analytics/performance"
                icon={TrendingUp}
                name={t('navigation:menu.performance')}
                indent
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <NavItem
                path="/analytics/pl"
                icon={Receipt}
                name={t('navigation:menu.pl')}
                indent
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <NavItem
                path="/analytics/fees"
                icon={Coins}
                name={t('navigation:menu.fees')}
                indent
                onClick={() => setIsMobileMenuOpen(false)}
              />
            </div>
          )}
        </div>
      )}

      {/* 4. Fiscalité Section */}
      {collapsed ? (
        <NavItem
          path="/tax"
          icon={Scale}
          name={t('navigation:menu.fiscalite')}
          onClick={() => setIsMobileMenuOpen(false)}
          collapsed
        />
      ) : (
        <div>
          <div
            className={`flex items-center rounded-lg text-sm font-medium transition-all ${
              isFiscaliteActive
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-secondary hover:bg-subtle hover:text-primary'
            }`}
          >
            <Link
              to="/tax"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 flex-1 px-4 py-2.5"
            >
              <Scale size={18} />
              {t('navigation:menu.fiscalite')}
            </Link>
            <button
              onClick={() => setIsFiscaliteExpanded(!isFiscaliteExpanded)}
              className="px-3 py-2.5 hover:text-primary"
              aria-label="Toggle fiscalité menu"
            >
              {isFiscaliteExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>

          {isFiscaliteExpanded && (
            <div className="mt-1 space-y-0.5 animate-in slide-in-from-top-2">
              <NavItem
                path="/tax/declaration"
                icon={FileText}
                name={t('navigation:menu.declaration')}
                indent
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <NavItem
                path="/tax/optimization"
                icon={Lightbulb}
                name={t('navigation:menu.optimization')}
                indent
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <NavItem
                path="/tax/guide"
                icon={BookOpen}
                name={t('navigation:menu.taxGuide')}
                indent
                onClick={() => setIsMobileMenuOpen(false)}
              />
            </div>
          )}
        </div>
      )}

      {/* 5. Progress */}
      <NavItem
        path="/progress"
        icon={Trophy}
        name={t('navigation:menu.progress')}
        onClick={() => setIsMobileMenuOpen(false)}
        collapsed={collapsed}
      />
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
      <aside
        data-testid="desktop-sidebar"
        className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 ${
          isSidebarCollapsed ? 'md:w-20' : 'md:w-60'
        } transition-all duration-200 bg-card border-r border-subtle z-30`}
      >
        {/* Logo & Toggle */}
        <div
          className={`h-16 flex items-center border-b border-subtle transition-all ${
            isSidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          <Link
            to="/"
            className="flex items-center gap-3 hover:opacity-90 transition-opacity"
            title={t('navigation:brandName')}
          >
            <div className="w-8 h-8 bg-brand-static rounded-lg flex items-center justify-center transform rotate-45 shrink-0">
              <div className="transform -rotate-45 text-white font-bold text-lg">
                <Hexagon size={20} fill="currentColor" />
              </div>
            </div>
            {!isSidebarCollapsed && (
              <span className="text-xl font-bold tracking-tight truncate">
                {t('navigation:brandName')}
              </span>
            )}
          </Link>
          <button
            onClick={toggleSidebarCollapsed}
            className={`p-1.5 text-secondary hover:text-primary hover:bg-subtle rounded-lg transition-colors ${
              isSidebarCollapsed ? 'hidden' : 'block'
            }`}
            title={t('navigation:collapseSidebar')}
            aria-label={t('navigation:collapseSidebar')}
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        <SidebarContent collapsed={isSidebarCollapsed} />
      </aside>

      {/* Sidebar - Mobile (Slide in) */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 bg-card border-r border-subtle z-50 transform transition-transform duration-200 md:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
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

        <SidebarContent collapsed={false} />
      </aside>

      {/* Main Content Area */}
      <div className={`${isSidebarCollapsed ? 'md:pl-20' : 'md:pl-60'} transition-all duration-200`}>
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

            {/* Desktop Expand Button when collapsed */}
            {isSidebarCollapsed && (
              <button
                onClick={toggleSidebarCollapsed}
                className="hidden md:flex p-2 text-secondary hover:text-primary hover:bg-subtle rounded-lg transition-colors"
                title={t('navigation:expandSidebar')}
                aria-label={t('navigation:expandSidebar')}
              >
                <PanelLeftOpen size={18} />
              </button>
            )}


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

          {/* Right Actions (AI Assistant + Notifications + Profile) */}
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={() => setIsAIChatOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary hover:bg-primary/20 transition-colors text-xs font-semibold"
              aria-label={t('ai:drawer.openButton')}
              title={t('ai:drawer.title')}
            >
              <Sparkles size={14} className="text-primary" />
              <span className="hidden sm:inline">{t('ai:drawer.openButton')}</span>
            </button>

            <NotificationBellDropdown />

            {/* Lock Vault button */}
            <button
              onClick={handleLockVault}
              className="p-2 text-secondary hover:bg-subtle hover:text-primary rounded-full transition-colors relative"
              title={t('security:header.lockVaultTooltip')}
              aria-label={t('security:lockScreen.lockVault')}
            >
              <Lock size={18} />
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
                <UserAvatar name={user.name} email={user.email} avatar={user.avatar} size="sm" />
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
                    to="/notifications"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-secondary hover:bg-subtle hover:text-primary transition-colors"
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    <Bell size={16} />
                    {t('notifications:center.title', 'Notifications')}
                  </Link>
                  <Link
                    to="/settings"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-secondary hover:bg-subtle hover:text-primary transition-colors"
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    <Settings size={16} />
                    {t('navigation:header.preferences')}
                  </Link>

                  <div className="border-t border-subtle mt-1 pt-1">
                    <button
                      onClick={handleLockVault}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-secondary hover:bg-subtle hover:text-primary transition-colors text-left"
                    >
                      <Lock size={16} />
                      {t('security:lockScreen.lockVault')}
                    </button>
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
          <LocalPersistenceNotice />
          <PullToRefresh>
            {children}
          </PullToRefresh>
        </main>
      </div>

      {/* In-App AI Assistant Drawer */}
      <AIChatDrawer isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} />

      {/* Real-time Floating Notification Toasts */}
      <NotificationToastContainer />
    </div>
  );
};

export default Layout;