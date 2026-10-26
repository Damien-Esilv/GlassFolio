import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ConsentBanner } from './components/ConsentBanner';
import { buildAppDestinationUrl, getAppUrl } from './config/deployment';
import './i18n';

import { LoadingScreen } from './components/ui/LoadingScreen';
import { ScrollToTop } from './components/ui/ScrollToTop';
import { LegacyHashRedirect } from './components/ui/LegacyHashRedirect';
import { ConsentGatedAnalytics } from './components/ConsentGatedAnalytics';

const Landing = React.lazy(() => import('./pages/Landing'));
const LegalCenter = React.lazy(() => import('./pages/LegalCenter'));
const SelfHost = React.lazy(() => import('./pages/SelfHost'));
const About = React.lazy(() => import('./pages/About'));
const Roadmap = React.lazy(() => import('./pages/Roadmap'));
const Changelog = React.lazy(() => import('./pages/Changelog'));

const AppRedirectHandler: React.FC = () => {
  const location = useLocation();

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

    const appUrl = getAppUrl();
    if (!appUrl) {
      // In local development or standalone mode without an app domain configured,
      // prevent infinite reload loop by remaining in place.
      return;
    }

    const destination = buildAppDestinationUrl(targetPath);
    if (typeof window !== 'undefined' && destination && destination !== window.location.href) {
      window.location.assign(destination);
    }
  }, [location.pathname, location.search, location.hash]);

  return <LoadingScreen />;
};

export const ShowcaseApp: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        <LegacyHashRedirect />
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
        <ConsentBanner />
        <ConsentGatedAnalytics />
      </Router>
    </AuthProvider>
  );
};

export default ShowcaseApp;
