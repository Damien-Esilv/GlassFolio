import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Hexagon, ArrowRight, Menu, X, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePublicThemeLang } from '../../hooks/usePublicThemeLang';
import { ThemeLangDropdowns } from './ThemeLangDropdowns';
import { getAppUrl, buildAppDestinationUrl, getAppTarget } from '../../config/deployment';
import { buildPublicPagePath } from '../../config/project';
import { isDemoAccount } from '../../services/security/demoAccount';

/** Scroll anchors, in the exact order the sections appear on the landing page. */
export const LANDING_SECTION_ANCHORS = ['features', 'security', 'ai', 'more', 'local-cloud', 'faq'] as const;

const NAV_LABEL_KEYS: Record<(typeof LANDING_SECTION_ANCHORS)[number], string> = {
  features: 'landing:header.navFeatures',
  security: 'landing:header.navSecurity',
  ai: 'landing:header.navAi',
  more: 'landing:header.navMore',
  'local-cloud': 'landing:header.navLocalCloud',
  faq: 'landing:header.navFaq',
};

/** Pages of the public site (not scroll anchors), listed in the mobile menu and the footer. */
const PUBLIC_PAGES = [
  { path: '/about', labelKey: 'landing:header.pageAbout' },
  { path: '/roadmap', labelKey: 'landing:header.pageRoadmap' },
  { path: '/changelog', labelKey: 'landing:header.pageChangelog' },
] as const;

interface AppLinkProps {
  path: '/' | '/login' | '/signup';
  className: string;
  onClick?: () => void;
  children: React.ReactNode;
}

/** Same-origin route in the unified build, cross-origin link to the app domain otherwise. */
export const AppLink: React.FC<AppLinkProps> = ({ path, className, onClick, children }) => {
  const { theme, language } = usePublicThemeLang();
  return getAppUrl() ? (
    <a href={buildAppDestinationUrl(path, { theme, lang: language })} onClick={onClick} className={className}>
      {children}
    </a>
  ) : (
    <Link to={path} onClick={onClick} className={className}>
      {children}
    </Link>
  );
};

export const LandingHeader: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const showcaseHome = getAppTarget() === 'showcase' ? '/' : '/welcome';
  // The demo session is a sample, not an account: it never replaces "Log in" / "Create account".
  const hasRealAccount = Boolean(user) && !isDemoAccount(user);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate(showcaseHome);
      setTimeout(() => {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  };

  const closeMenu = (): void => setIsMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-40 w-full landing-header-glass border-b border-subtle transition-colors shadow-sm">
      <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left Group: Brand + Anchor Links glued to the logo */}
        <div className="flex items-center gap-5 xl:gap-8 shrink-0">
          {/* Brand */}
          <Link
            to={showcaseHome}
            className="flex items-center gap-2.5 shrink-0 group focus:outline-none focus:ring-2 focus:ring-primary rounded-lg p-1"
          >
            <div className="w-8 h-8 bg-brand-static rounded-lg flex items-center justify-center transform rotate-45 shadow-md shadow-brand/20 group-hover:scale-105 transition-transform">
              <div className="transform -rotate-45 text-white font-bold text-lg">
                <Hexagon size={18} fill="currentColor" />
              </div>
            </div>
            <span className="sr-only sm:not-sr-only text-xl font-bold tracking-tight text-primary">
              {t('landing:header.brandName')}
            </span>
          </Link>

          {/* Scroll anchors (Desktop), in page order */}
          <nav aria-label={t('landing:header.sectionsNavAria')} className="hidden xl:flex items-center gap-2.5 2xl:gap-5 text-xs font-semibold text-secondary whitespace-nowrap">
            {LANDING_SECTION_ANCHORS.map((id) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={(e) => handleNavClick(e, id)}
                className="hover:text-primary transition-colors whitespace-nowrap cursor-pointer"
              >
                {t(NAV_LABEL_KEYS[id])}
              </a>
            ))}
          </nav>
        </div>

        {/* Right Actions: Install guide (a page, not an anchor) + Lang/Theme + GitHub + account */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <Link
            to={buildPublicPagePath('/self-host')}
            className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-brand/30 bg-brand/10 text-brand text-xs font-bold hover:bg-brand/15 transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <Download size={13} />
            <span>{t('landing:header.installButton')}</span>
          </Link>

          <ThemeLangDropdowns align="right" />

          {hasRealAccount && (
            <AppLink
              path="/"
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-brand hover:bg-brand/10 transition-colors whitespace-nowrap"
            >
              <span>{t('landing:common.goToDashboard')}</span>
              <ArrowRight size={13} />
            </AppLink>
          )}

          <AppLink
            path="/login"
            className="inline-flex items-center px-2.5 py-2 rounded-lg text-xs font-semibold text-secondary hover:text-primary hover:bg-subtle transition-colors whitespace-nowrap"
          >
            {t('landing:common.logIn')}
          </AppLink>

          <AppLink
            path="/signup"
            className="hidden sm:inline-flex items-center bg-primary hover:bg-primary-hover text-white text-xs font-bold px-3 py-2 rounded-lg shadow-md shadow-brand/20 transition-colors whitespace-nowrap"
          >
            {t('landing:common.createAccount')}
          </AppLink>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label={t('landing:header.mobileMenuAria')}
            aria-expanded={isMobileMenuOpen}
            className="xl:hidden p-3 rounded-lg bg-subtle hover:bg-card-hover border border-subtle text-secondary hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="xl:hidden border-t border-subtle bg-card px-4 py-4 space-y-3 animate-row-in shadow-xl max-h-[calc(100vh-4rem)] overflow-y-auto">
          <nav className="flex flex-col space-y-1" aria-label={t('landing:header.sectionsNavAria')}>
            {LANDING_SECTION_ANCHORS.map((id) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={(e) => {
                  closeMenu();
                  handleNavClick(e, id);
                }}
                className="px-3 py-2 rounded-lg text-sm font-semibold text-secondary hover:text-primary hover:bg-subtle transition-colors cursor-pointer"
              >
                {t(NAV_LABEL_KEYS[id])}
              </a>
            ))}
          </nav>
          <nav className="pt-3 border-t border-subtle flex flex-col space-y-1" aria-label={t('landing:header.pagesNavAria')}>
            <Link
              to={buildPublicPagePath('/self-host')}
              onClick={closeMenu}
              className="px-3 py-2 rounded-lg text-sm font-semibold text-brand hover:bg-subtle transition-colors inline-flex items-center gap-2"
            >
              <Download size={15} />
              <span>{t('landing:header.installButton')}</span>
            </Link>
            {PUBLIC_PAGES.map((page) => (
              <Link
                key={page.path}
                to={buildPublicPagePath(page.path)}
                onClick={closeMenu}
                className="px-3 py-2 rounded-lg text-sm font-semibold text-secondary hover:text-primary hover:bg-subtle transition-colors"
              >
                {t(page.labelKey)}
              </Link>
            ))}
          </nav>
          <div className="pt-3 border-t border-subtle flex flex-col gap-2">
            {hasRealAccount && (
              <AppLink
                path="/"
                onClick={closeMenu}
                className="w-full text-center px-4 py-2.5 rounded-lg bg-subtle border border-subtle text-xs font-bold text-brand"
              >
                {t('landing:common.goToDashboard')}
              </AppLink>
            )}
            <div className="flex items-center gap-2">
              <AppLink
                path="/login"
                onClick={closeMenu}
                className="flex-1 text-center px-4 py-2 rounded-lg bg-subtle border border-subtle text-xs font-bold text-primary hover:bg-card-hover transition-colors"
              >
                {t('landing:common.logIn')}
              </AppLink>
              <AppLink
                path="/signup"
                onClick={closeMenu}
                className="flex-1 text-center px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold shadow-sm"
              >
                {t('landing:common.createAccount')}
              </AppLink>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
