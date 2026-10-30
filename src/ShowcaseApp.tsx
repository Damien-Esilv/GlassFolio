import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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

const Landing = React.lazy(() => import('./pages/Landing'));
const LegalCenter = React.lazy(() => import('./pages/LegalCenter'));
const SelfHost = React.lazy(() => import('./pages/SelfHost'));
const About = React.lazy(() => import('./pages/About'));
const Roadmap = React.lazy(() => import('./pages/Roadmap'));
const Changelog = React.lazy(() => import('./pages/Changelog'));

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

export const ShowcaseApp: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        <LegacyHashRedirect />
        <PullToRefresh>
          <React.Suspense fallback={<LoadingScreen />}>
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

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </React.Suspense>
        </PullToRefresh>
        <ConsentBanner />
        <ConsentGatedAnalytics />
      </Router>
    </AuthProvider>
  );
};

export default ShowcaseApp;
