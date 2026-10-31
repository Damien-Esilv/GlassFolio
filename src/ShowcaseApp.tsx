import React, { useEffect, useLayoutEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'motion/react';
import { AuthProvider } from './context/AuthContext';
import { ConsentBanner } from './components/ConsentBanner';
import { buildAppDestinationUrl, getAppUrl } from './config/deployment';
import { getInitialPublicPreferences } from './hooks/usePublicThemeLang';
import './i18n';

import { LoadingScreen } from './components/ui/LoadingScreen';
import { ScrollToTop } from './components/ui/ScrollToTop';
import { LegacyHashRedirect } from './components/ui/LegacyHashRedirect';
import { ConsentGatedAnalytics } from './components/ConsentGatedAnalytics';
import { PullToRefresh } from './components/ui/PullToRefresh';
import { PublicPageHead } from './components/landing/PublicPageHead';
import { findPublicRoute, languageBasename, languageFromPath, type PublicSeoKey } from './config/publicRoutes';

type PageModule = { default: React.ComponentType };

/**
 * A lazy page that can load ahead of the first render. Hydration must finish in one pass: if a page
 * is still loading when AuthProvider updates, React drops the static HTML and shows the fallback.
 */
const lazyPage = (load: () => Promise<PageModule>): React.FC & { preload: () => Promise<void> } => {
  let Loaded: React.ComponentType | null = null;
  const Lazy = React.lazy(load);
  const Page = (): React.ReactElement => (Loaded ? <Loaded /> : <Lazy />);
  Page.preload = async (): Promise<void> => {
    Loaded = (await load()).default;
  };
  return Page;
};

const Landing = lazyPage(() => import('./pages/Landing'));
const LegalCenter = lazyPage(() => import('./pages/LegalCenter'));
const SelfHost = lazyPage(() => import('./pages/SelfHost'));
const About = lazyPage(() => import('./pages/About'));
const Roadmap = lazyPage(() => import('./pages/Roadmap'));
const Changelog = lazyPage(() => import('./pages/Changelog'));
const Docs = lazyPage(() => import('./pages/Docs'));
const Contact = lazyPage(() => import('./pages/Contact'));
const NotFound = lazyPage(() => import('./pages/NotFound'));

const PAGES_BY_SEO_KEY: Record<PublicSeoKey, { preload: () => Promise<void> }> = {
  home: Landing,
  selfHost: SelfHost,
  about: About,
  roadmap: Roadmap,
  changelog: Changelog,
  legal: LegalCenter,
  privacy: LegalCenter,
  terms: LegalCenter,
  cookies: LegalCenter,
  accessibility: LegalCenter,
  docs: Docs,
  contact: Contact,
};

export const preloadPublicPage = (pathname: string): Promise<void> => {
  const route = findPublicRoute(pathname);
  return (route ? PAGES_BY_SEO_KEY[route.seoKey] : NotFound).preload();
};

const AppRedirectHandler: React.FC = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const appUrl = getAppUrl();

  useEffect(() => {
    const isAppRoute =
      location.pathname === '/login' ||
      location.pathname === '/signup' ||
      location.pathname === '/forgot-password' ||
      location.pathname === '/reset-password' ||
      location.pathname.startsWith('/auth/');
    const targetPath = isAppRoute
      ? `${location.pathname}${location.search}${location.hash}`
      : '/';

    if (!appUrl) {
      // In local development or standalone mode without an app domain configured,
      // prevent infinite reload loop by remaining in place.
      return;
    }

    const { theme, language } = getInitialPublicPreferences();
    const destination = buildAppDestinationUrl(targetPath, { theme, lang: language });
    if (typeof window !== 'undefined' && destination && destination !== window.location.href) {
      window.location.assign(destination);
    }
  }, [location.pathname, location.search, location.hash, appUrl]);

  // No app address for this build: say so, instead of a spinner that never ends
  if (!appUrl) {
    return (
      <div role="alert" className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-card border border-subtle rounded-2xl p-6 text-center space-y-3">
          <p className="text-sm text-secondary">{t('landing:appUnavailable')}</p>
          <Link to="/" className="inline-block text-sm font-semibold text-brand hover:underline">{t('landing:appUnavailableBack')}</Link>
        </div>
      </div>
    );
  }

  return <LoadingScreen />;
};

/** Runs once the page's lazy chunk has hydrated, so a later remount never shows the fallback. */
const PageReady: React.FC<{ onReady: () => void }> = ({ onReady }) => {
  useEffect(onReady, [onReady]);
  return null;
};

interface ShowcaseRoutesProps {
  onPageReady?: () => void;
}

/** The public pages, without a router so the prerender can wrap them in a StaticRouter. */
export const ShowcaseRoutes: React.FC<ShowcaseRoutesProps> = ({ onPageReady }) => {
  return (
    <>
        <PublicPageHead />
        <ScrollToTop />
        <LegacyHashRedirect />
        <PullToRefresh>
          <React.Suspense fallback={<LoadingScreen />}>
            {onPageReady && <PageReady onReady={onPageReady} />}
            <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/welcome" element={<Landing />} />
            <Route path="/self-host" element={<SelfHost />} />
            <Route path="/welcome/self-host" element={<SelfHost />} />
            <Route path="/about" element={<About />} />
            <Route path="/welcome/about" element={<About />} />
            <Route path="/roadmap" element={<Roadmap />} />
            <Route path="/welcome/roadmap" element={<Roadmap />} />
            <Route path="/changelog" element={<Changelog />} />
            <Route path="/welcome/changelog" element={<Changelog />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/welcome/docs" element={<Docs />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/welcome/contact" element={<Contact />} />
            <Route path="/legal" element={<LegalCenter />} />
            <Route path="/privacy" element={<LegalCenter />} />
            <Route path="/terms" element={<LegalCenter />} />
            <Route path="/cookies" element={<LegalCenter />} />
            <Route path="/accessibility" element={<LegalCenter />} />
            <Route path="/welcome/legal" element={<LegalCenter />} />
            <Route path="/welcome/privacy" element={<LegalCenter />} />
            <Route path="/welcome/terms" element={<LegalCenter />} />
            <Route path="/welcome/cookies" element={<LegalCenter />} />
            <Route path="/welcome/accessibility" element={<LegalCenter />} />

            {/* If redirected or deep-linked to app routes on showcase domain, redirect to app */}
            <Route path="/login" element={<AppRedirectHandler />} />
            <Route path="/signup" element={<AppRedirectHandler />} />
            <Route path="/auth/confirm" element={<AppRedirectHandler />} />
            <Route path="/forgot-password" element={<AppRedirectHandler />} />
            <Route path="/reset-password" element={<AppRedirectHandler />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </React.Suspense>
        </PullToRefresh>
        <ConsentBanner />
        <ConsentGatedAnalytics />
    </>
  );
};

/**
 * Keeps the prerendered HTML and its hydration free of entry styles: without this, `initial` styles
 * would ship every animated block at opacity 0, invisible to anything that doesn't run JavaScript.
 */
export const PrerenderedMotion: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AnimatePresence initial={false}>
    <React.Fragment key="prerendered">{children}</React.Fragment>
  </AnimatePresence>
);

interface ShowcaseAppProps {
  /** The page was served as prerendered HTML (dist/_p) */
  prerendered?: boolean;
  /** The page is on screen, so the loader can go */
  onVisible?: () => void;
}

export const ShowcaseApp: React.FC<ShowcaseAppProps> = ({ prerendered = false, onVisible }) => {
  // Router basename: every internal link and route of a public page stays under its language prefix
  const pathLanguage = languageFromPath(window.location.pathname);
  const basename = pathLanguage ? languageBasename(pathLanguage) : undefined;
  const [pageReady, setPageReady] = useState(false);
  const markReady = React.useCallback(() => setPageReady(true), []);

  // Before paint, once the remounted page has its `initial` styles: its entry animations start hidden
  useLayoutEffect(() => {
    if (!pageReady) return;
    document.documentElement.classList.remove('prerender-pending');
    onVisible?.();
  }, [pageReady, onVisible]);

  if (!prerendered) {
    return (
      <AuthProvider>
        <Router basename={basename}>
          <ShowcaseRoutes />
        </Router>
      </AuthProvider>
    );
  }

  // Remounted once hydrated: React keeps the server's attributes on hydration, and links, theme and
  // app URLs depend on the visitor (preferences, host), which the static HTML can't know. The
  // remount is also what plays the entry and scroll animations.
  if (pageReady) {
    return (
      <AuthProvider>
        <Router basename={basename}>
          <ShowcaseRoutes />
        </Router>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <PrerenderedMotion>
        <Router basename={basename}>
          <ShowcaseRoutes onPageReady={markReady} />
        </Router>
      </PrerenderedMotion>
    </AuthProvider>
  );
};

export default ShowcaseApp;
