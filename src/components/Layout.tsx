import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { getPriceSourceStatus } from '../services/priceService';
import { yahooPausedUntil } from '../services/market/yahooClient';
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
import { AIChatPanel } from './ai/AIChatPanel';
import { useResizablePane } from '../hooks/useResizablePane';
import { McpBridgeHost } from './mcp/McpBridgeHost';
import { DesktopUpdatePrompt } from './desktop/DesktopUpdatePrompt';
import { ConnectionSyncHost } from './connections/ConnectionSyncHost';
import { ConsentBanner } from './ConsentBanner';
import { NotificationBellDropdown } from './notifications/NotificationBellDropdown';
import { NotificationToastContainer } from './notifications/NotificationToastContainer';
import { UserAvatar } from './ui/UserAvatar';
import { LocalPersistenceNotice } from './security/LocalPersistenceNotice';
import { CloudSyncNotice } from './security/CloudSyncNotice';
import { VaultIntegrityNotice } from './security/VaultIntegrityNotice';
import { PullToRefresh } from './ui/PullToRefresh';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { isLocalVaultUser } from '../services/security/accountIdentity';

interface LayoutProps {
  children: React.ReactNode;
}

/**
 * Sidebar nav item. Kept at module level: declared inside Layout it was a new component type on every
 * render, so every link was unmounted and rebuilt each time the layout re-rendered.
 */
const NavItem: React.FC<{
  path: string;
  icon: React.ElementType;
  name: string;
  indent?: boolean;
  onClick?: () => void;
  collapsed?: boolean;
}> = ({ path, icon: Icon, name, indent = false, onClick, collapsed = false }) => {
  const { pathname } = useLocation();
  return (
    <Link
      to={path}
      onClick={onClick}
      title={name}
      aria-label={name}
      className={`flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
        collapsed ? 'justify-center px-2' : `px-4 ${indent ? 'ml-6' : ''}`
      } ${
        pathname === path
          ? 'bg-primary/10 text-primary font-semibold'
          : 'text-secondary hover:bg-subtle hover:text-primary'
      }`}
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="truncate">{name}</span>}
    </Link>
  );
};

const SIDEBAR_WIDTH_KEY = 'gf_sidebar_width';
const AI_PANEL_OPEN_KEY = 'gf_ai_panel_open';
const AI_PANEL_WIDTH_KEY = 'gf_ai_panel_width';

const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 360;
const SIDEBAR_COLLAPSED_WIDTH = 80;
const SIDEBAR_COLLAPSE_THRESHOLD = 128;

const AI_PANEL_DEFAULT_WIDTH = 420;
const AI_PANEL_WIDE_WIDTH = 640;
const AI_PANEL_MIN_WIDTH = 320;
const AI_PANEL_MAX_WIDTH = 760;
const MIN_MAIN_CONTENT_WIDTH = 360;

const readStoredWidth = (key: string, fallback: number, min: number, max: number): number => {
  try {
    const raw = appStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  } catch {
    return fallback;
  }
};

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
  useEscapeKey(() => setIsMobileMenuOpen(false), isMobileMenuOpen);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState<boolean>(() => {
    try {
      return appStorage.getItem(AI_PANEL_OPEN_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return appStorage.getItem('gf_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() =>
    readStoredWidth(SIDEBAR_WIDTH_KEY, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH)
  );
  const [aiPanelWidth, setAiPanelWidth] = useState<number>(() =>
    readStoredWidth(AI_PANEL_WIDTH_KEY, AI_PANEL_DEFAULT_WIDTH, AI_PANEL_MIN_WIDTH, AI_PANEL_MAX_WIDTH)
  );
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1440
  );
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleViewportResize = () => {
      if (window.innerWidth > 0) {
        setViewportWidth(window.innerWidth);
      }
    };
    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, []);

  const setSidebarCollapsedPersisted = useCallback((next: boolean) => {
    setIsSidebarCollapsed(next);
    try {
      appStorage.setItem('gf_sidebar_collapsed', String(next));
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        appStorage.setItem('gf_sidebar_collapsed', String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const setAIChatOpenPersisted = useCallback((nextOrUpdater: boolean | ((prev: boolean) => boolean)) => {
    setIsAIChatOpen((prev) => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
      try {
        appStorage.setItem(AI_PANEL_OPEN_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  // Recharts measures container widths via window resize; trigger after panel slide transition
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('resize'));
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [isAIChatOpen, isSidebarCollapsed]);

  const effectiveLeftWidth = isSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth;
  const maxAllowedAiWidth = Math.min(
    AI_PANEL_MAX_WIDTH,
    Math.max(AI_PANEL_MIN_WIDTH, viewportWidth - effectiveLeftWidth - MIN_MAIN_CONTENT_WIDTH)
  );
  const effectiveAiWidth = Math.min(aiPanelWidth, maxAllowedAiWidth);

  const leftResize = useResizablePane({
    edge: 'left',
    width: sidebarWidth,
    minWidth: SIDEBAR_MIN_WIDTH,
    maxWidth: SIDEBAR_MAX_WIDTH,
    defaultWidth: SIDEBAR_DEFAULT_WIDTH,
    onWidthChange: setSidebarWidth,
    onResizeEnd: (finalWidth) => {
      try {
        appStorage.setItem(SIDEBAR_WIDTH_KEY, String(finalWidth));
      } catch {
        // ignore storage errors
      }
    },
    collapsed: isSidebarCollapsed,
    collapsedWidth: SIDEBAR_COLLAPSED_WIDTH,
    collapseThreshold: SIDEBAR_COLLAPSE_THRESHOLD,
    onCollapsedChange: setSidebarCollapsedPersisted,
  });

  const rightResize = useResizablePane({
    edge: 'right',
    width: effectiveAiWidth,
    minWidth: AI_PANEL_MIN_WIDTH,
    maxWidth: maxAllowedAiWidth,
    defaultWidth: AI_PANEL_DEFAULT_WIDTH,
    onWidthChange: setAiPanelWidth,
    onResizeEnd: (finalWidth) => {
      try {
        appStorage.setItem(AI_PANEL_WIDTH_KEY, String(finalWidth));
      } catch {
        // ignore storage errors
      }
    },
  });

  const isAnyResizing = leftResize.isResizing || rightResize.isResizing;
  const isAiExpandedPreset = effectiveAiWidth >= AI_PANEL_WIDE_WIDTH - 24;
  const toggleAiWidthPreset = useCallback(() => {
    const target = isAiExpandedPreset ? AI_PANEL_DEFAULT_WIDTH : Math.min(AI_PANEL_WIDE_WIDTH, maxAllowedAiWidth);
    setAiPanelWidth(target);
    try {
      appStorage.setItem(AI_PANEL_WIDTH_KEY, String(target));
    } catch {
      // ignore storage errors
    }
    setTimeout(() => {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('resize'));
    }, 220);
  }, [isAiExpandedPreset, maxAllowedAiWidth]);


  /** Human-readable freshness label */
  const freshnessLabel = useMemo(() => {
    if (!lastPriceRefresh) return null;
    const diffMs = Date.now() - new Date(lastPriceRefresh).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return t('dashboard:priceJustRefreshed');
    if (diffMin < 60) return t('dashboard:priceRefreshedMinutesAgo', { count: diffMin });
    return t('dashboard:priceRefreshedOverAnHourAgo');
  }, [lastPriceRefresh, t]);

  /** Why there is no fresh market price (TGLA-242): no network, a bank's quotes stand in, or Yahoo's rate limit. */
  const unavailableLabel = useMemo(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return t('dashboard:priceOffline');
    if (getPriceSourceStatus().providerQuotesUsed) return t('dashboard:priceBankQuotes');
    const pausedUntil = yahooPausedUntil();
    if (pausedUntil) return t('dashboard:priceRateLimited', { count: Math.max(1, Math.ceil((pausedUntil - Date.now()) / 60000)) });
    return t('dashboard:priceUnavailable');
    // Recomputed after each refresh attempt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPriceRefresh, isRefreshingPrices, t]);

  const handleForceRefresh = useCallback(async () => {
    setIsRefreshingPrices(true);
    try {
      await forceRefreshPrices();
    } catch (err) {
      console.error('Price refresh failed', err);
    } finally {
      setIsRefreshingPrices(false);
    }
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
    '/download',
    '/about',
    '/roadmap',
    '/changelog',
    // Auth flows can be opened from an email link while signed in: never inside the app shell
    '/forgot-password',
    '/reset-password',
    '/auth/confirm',
    '/auth/google-callback',
  ];
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
  const isFullScreenRoute =
    PUBLIC_FULL_SCREEN_ROUTES.includes(normalizedPath) ||
    normalizedPath.startsWith('/welcome');

  // If not authenticated or currently on a public full-screen route, render children in full screen
  if (!user || isFullScreenRoute) {
    return (
      <>
        {children}
        <ConsentBanner />
      </>
    );
  }

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

  // Sidebar content (shared between desktop and mobile)
  // A render function, not a component: a component declared here would be rebuilt on every render.
  const renderSidebarContent = (collapsed = false): React.ReactNode => (
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
              onClick={() => {
                setIsPortfolioExpanded(true);
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 flex-1 px-4 py-2.5"
            >
              <Briefcase size={18} />
              {t('navigation:menu.portfolio')}
            </Link>
            <button
              onClick={() => setIsPortfolioExpanded(!isPortfolioExpanded)}
              className="px-3 py-2.5 hover:text-primary"
              aria-label={t('navigation:toggleMenu', { menu: t('navigation:menu.portfolio') })}
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
              onClick={() => {
                setIsAnalyticsExpanded(true);
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 flex-1 px-4 py-2.5"
            >
              <BarChart3 size={18} />
              {t('navigation:menu.analytics')}
            </Link>
            <button
              onClick={() => setIsAnalyticsExpanded(!isAnalyticsExpanded)}
              className="px-3 py-2.5 hover:text-primary"
              aria-label={t('navigation:toggleMenu', { menu: t('navigation:menu.analytics') })}
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
              onClick={() => {
                setIsFiscaliteExpanded(true);
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 flex-1 px-4 py-2.5"
            >
              <Scale size={18} />
              {t('navigation:menu.fiscalite')}
            </Link>
            <button
              onClick={() => setIsFiscaliteExpanded(!isFiscaliteExpanded)}
              className="px-3 py-2.5 hover:text-primary"
              aria-label={t('navigation:toggleMenu', { menu: t('navigation:menu.fiscalite') })}
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
    <div
      className="min-h-screen bg-canvas text-primary font-display"
      style={
        {
          '--gf-sidebar-w': `${effectiveLeftWidth}px`,
          '--gf-ai-panel-w': `${isAIChatOpen ? effectiveAiWidth : 0}px`,
        } as React.CSSProperties
      }
    >
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Desktop (Fixed, continuously resizable with Spotify-style snap-to-collapse) */}
      <aside
        data-testid="desktop-sidebar"
        data-collapsed={String(isSidebarCollapsed)}
        className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-[var(--gf-sidebar-w)] ${
          leftResize.isResizing ? 'transition-none' : 'transition-[width] duration-200'
        } bg-card border-r border-subtle z-30`}
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

        {renderSidebarContent(isSidebarCollapsed)}

        {/* Right-edge continuous resize divider (Spotify macOS style) */}
        <div
          {...leftResize.separatorProps}
          data-testid="sidebar-resize-handle"
          aria-label={t('navigation:resizeSidebar')}
          title={t('navigation:resizeSidebar')}
          className="hidden md:flex items-center justify-center absolute inset-y-0 -right-1.5 w-3 cursor-col-resize z-40 group focus:outline-none"
        >
          <span
            className={`h-full w-0.5 transition-colors ${
              leftResize.isResizing
                ? 'bg-primary'
                : 'bg-transparent group-hover:bg-primary/60 group-focus:bg-primary'
            }`}
          />
        </div>
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
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-2 hover:bg-subtle rounded-lg"
            aria-label={t('common:buttons.close')}
          >
            <X size={20} />
          </button>
        </div>

        {renderSidebarContent(false)}
      </aside>

      {/* Main Content Area */}
      <div
        className={`md:pl-[var(--gf-sidebar-w)] ${
          leftResize.isResizing ? 'transition-none' : 'transition-[padding] duration-200'
        }`}
      >
        {/* Top Header */}
        <header className="sticky top-0 z-40 h-16 bg-card border-b border-subtle flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 hover:bg-subtle rounded-lg md:hidden"
              aria-label={t('navigation:expandSidebar')}
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
                  <span className="hidden sm:inline">{unavailableLabel}</span>
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
              onClick={() => setAIChatOpenPersisted((prev) => !prev)}
              aria-pressed={isAIChatOpen}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors text-xs font-semibold ${
                isAIChatOpen
                  ? 'bg-primary text-white border-primary'
                  : 'bg-primary/10 border-primary/25 text-primary hover:bg-primary/20'
              }`}
              aria-label={t('ai:drawer.openButton')}
              title={t('ai:drawer.title')}
            >
              <Sparkles size={14} className={isAIChatOpen ? 'text-white' : 'text-primary'} />
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
                    <p className="text-xs text-secondary truncate">
                      {isLocalVaultUser(user) ? t('navigation:header.localVaultBadge') : user.email}
                    </p>
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

        {/* Main Content (shifts smoothly left when the right AI side panel is open) */}
        <div
          data-testid="main-content-shell"
          className={`${isAIChatOpen ? 'lg:pr-[var(--gf-ai-panel-w)]' : ''} ${
            isAnyResizing ? 'transition-none' : 'transition-[padding] duration-200'
          }`}
        >
          <main className="p-4 md:p-6 lg:p-8">
            <LocalPersistenceNotice />
            <CloudSyncNotice />
            <VaultIntegrityNotice />
            {/* Reloads the data in place: a page reload would lock the vault and drop unsaved input */}
            <PullToRefresh onRefresh={handleForceRefresh}>
              {children}
            </PullToRefresh>
          </main>
        </div>
      </div>

      {/* Non-Modal Resizable Right AI Assistant Panel */}
      <AIChatPanel
        isOpen={isAIChatOpen}
        onClose={() => setAIChatOpenPersisted(false)}
        width={effectiveAiWidth}
        isResizing={rightResize.isResizing}
        isExpandedPreset={isAiExpandedPreset}
        onToggleWidthPreset={toggleAiWidthPreset}
        resizeHandleProps={rightResize.separatorProps}
      />

      {/* AI clients (Claude Code, Codex...) calling the tools of this tab, and the changes they ask for */}
      <McpBridgeHost />

      {/* Desktop app only: offers a new version when the shell finds one */}
      <DesktopUpdatePrompt />

      {/* Automatic syncs of the connected sources, while this tab holds the unlocked vault (TGLA-221) */}
      <ConnectionSyncHost />

      {/* Real-time Floating Notification Toasts */}
      <NotificationToastContainer />

      {/* Also mounted when signed in, so "Cookie preferences" in Settings opens it */}
      <ConsentBanner />
    </div>
  );
};

export default Layout;