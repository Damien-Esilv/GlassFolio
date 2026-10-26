import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Hexagon, ArrowRight, Sparkles, Menu, X } from 'lucide-react';
import { useDemoAccess } from '../../hooks/useDemoAccess';
import { useAuth } from '../../context/AuthContext';
import { ThemeLangDropdowns } from './ThemeLangDropdowns';
import { getAppUrl, buildAppDestinationUrl, getAppTarget } from '../../config/deployment';

export const LandingHeader: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { launchDemo, isLaunchingDemo } = useDemoAccess();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isExternalApp = Boolean(getAppUrl());
  const showcaseHome = getAppTarget() === 'showcase' ? '/' : '/welcome';

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const targetId = href.replace(/^#/, '');
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

  const navLinks = [
    { href: '#features', label: t('landing:header.navFeatures') },
    { href: '#tax-simulator', label: t('landing:header.navTax') },
    { href: '#etf-fees', label: t('landing:header.navFees') },
    { href: '#csv-import', label: t('landing:header.navCsv') },
    { href: '#security-ai', label: t('landing:header.navSecurityAi') },
    { href: '#faq', label: t('landing:header.navFaq') },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-card border-b border-subtle transition-colors shadow-sm">
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
            <span className="text-xl font-bold tracking-tight text-primary">
              {t('landing:header.brandName')}
            </span>
          </Link>

          {/* Anchor Links (Desktop) */}
          <nav className="hidden lg:flex items-center gap-3.5 xl:gap-6 text-xs font-semibold text-secondary whitespace-nowrap">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="hover:text-primary transition-colors whitespace-nowrap cursor-pointer"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        {/* Right Actions: Lang + Theme Dropdowns + Login/Dashboard + Demo CTA + Mobile Toggle */}
        <div className="flex items-center gap-2 xl:gap-2.5 shrink-0 ml-auto">
          {/* Extensible Theme & Language Dropdowns */}
          <ThemeLangDropdowns align="right" />

          {/* Log in / Dashboard Link (Desktop) */}
          {user ? (
            isExternalApp ? (
              <a
                href={buildAppDestinationUrl('/')}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-semibold text-brand hover:bg-brand/10 transition-colors whitespace-nowrap"
              >
                <span>{t('landing:common.goToDashboard')}</span>
                <ArrowRight size={13} />
              </a>
            ) : (
              <Link
                to="/"
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-semibold text-brand hover:bg-brand/10 transition-colors whitespace-nowrap"
              >
                <span>{t('landing:common.goToDashboard')}</span>
                <ArrowRight size={13} />
              </Link>
            )
          ) : (
            isExternalApp ? (
              <a
                href={buildAppDestinationUrl('/login')}
                className="hidden sm:inline-flex items-center px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-semibold text-secondary hover:text-primary transition-colors whitespace-nowrap"
              >
                {t('landing:common.logIn')}
              </a>
            ) : (
              <Link
                to="/login"
                className="hidden sm:inline-flex items-center px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-semibold text-secondary hover:text-primary transition-colors whitespace-nowrap"
              >
                {t('landing:common.logIn')}
              </Link>
            )
          )}

          {/* Primary Demo CTA */}
          <button
            type="button"
            onClick={() => launchDemo('/')}
            disabled={isLaunchingDemo}
            className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold px-3 xl:px-3.5 py-2 rounded-lg shadow-md shadow-brand/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 whitespace-nowrap"
          >
            <Sparkles size={14} />
            <span>{t('landing:common.tryLiveDemo')}</span>
          </button>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label={t('landing:header.mobileMenuAria')}
            className="lg:hidden p-2 rounded-lg bg-subtle hover:bg-card-hover border border-subtle text-secondary hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-t border-subtle bg-card px-4 py-4 space-y-3 animate-row-in shadow-xl">
          <nav className="flex flex-col space-y-2">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  setIsMobileMenuOpen(false);
                  handleNavClick(e, link.href);
                }}
                className="px-3 py-2 rounded-lg text-sm font-semibold text-secondary hover:text-primary hover:bg-subtle transition-colors cursor-pointer"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="pt-3 border-t border-subtle flex flex-col gap-2">
            {user ? (
              isExternalApp ? (
                <a
                  href={buildAppDestinationUrl('/')}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-full text-center px-4 py-2.5 rounded-lg bg-subtle border border-subtle text-xs font-bold text-brand"
                >
                  {t('landing:common.goToDashboard')}
                </a>
              ) : (
                <Link
                  to="/"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-full text-center px-4 py-2.5 rounded-lg bg-subtle border border-subtle text-xs font-bold text-brand"
                >
                  {t('landing:common.goToDashboard')}
                </Link>
              )
            ) : (
              <div className="flex items-center gap-2">
                {isExternalApp ? (
                  <>
                    <a
                      href={buildAppDestinationUrl('/login')}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex-1 text-center px-4 py-2 rounded-lg bg-subtle border border-subtle text-xs font-bold text-primary hover:bg-card-hover transition-colors"
                    >
                      {t('landing:common.logIn')}
                    </a>
                    <a
                      href={buildAppDestinationUrl('/signup')}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex-1 text-center px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold shadow-sm"
                    >
                      {t('auth:login.signUpLink')}
                    </a>
                  </>
                ) : (
                  <>
                    <Link
                      to="/login"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex-1 text-center px-4 py-2 rounded-lg bg-subtle border border-subtle text-xs font-bold text-primary hover:bg-card-hover transition-colors"
                    >
                      {t('landing:common.logIn')}
                    </Link>
                    <Link
                      to="/signup"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex-1 text-center px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold shadow-sm"
                    >
                      {t('auth:login.signUpLink')}
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
