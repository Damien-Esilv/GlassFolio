import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Positions from './pages/Positions';
import Transactions from './pages/Transactions';
import Portfolio from './pages/Portfolio';
import PortfolioHub from './pages/PortfolioHub';
import Analytics from './pages/Analytics';
import PortfolioPerformance from './pages/PortfolioPerformance';
import RealizedUnrealizedPL from './pages/RealizedUnrealizedPL';
import FeeAnalysis from './pages/FeeAnalysis';
import TaxHub from './pages/TaxHub';
import DeclarationAssistant from './pages/DeclarationAssistant';
import TaxOptimization from './pages/TaxOptimization';
import TaxGuide from './pages/TaxGuide';
import Settings from './pages/Settings';
import Notifications from './pages/Notifications';
import Progress from './pages/Progress';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { PasswordResetFlow } from './pages/PasswordResetFlow';
import AuthConfirm from './pages/AuthConfirm';
import { DataProvider } from './context/DataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useTranslation } from 'react-i18next';
import './i18n'; // Initialize i18n

import { VaultGate } from './components/security/VaultGate';
import { CloudMisconfiguredScreen } from './components/security/CloudMisconfiguredScreen';
import { getAuthCapabilities } from './services/security/authCapabilities';
import { getAppTarget } from './config/deployment';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { ScrollToTop } from './components/ui/ScrollToTop';
import { LegacyHashRedirect } from './components/ui/LegacyHashRedirect';
import { ConsentGatedAnalytics } from './components/ConsentGatedAnalytics';

// Lazy-loaded showcase & legal pages to preserve core bundle budget
// @ts-expect-error import.meta.env is injected by Vite at compile time
const isShowcaseExcluded = import.meta.env.VITE_APP_TARGET === 'app';
// Import tooling is only needed on /import: keep it out of the main bundle
const ImportWizard = React.lazy(() => import('./pages/ImportWizard'));
const ImportHistory = React.lazy(() => import('./pages/ImportHistory'));

const Landing = isShowcaseExcluded ? () => null : React.lazy(() => import('./pages/Landing'));
const LegalCenter = isShowcaseExcluded ? () => null : React.lazy(() => import('./pages/LegalCenter'));

// Helper component for protected routes
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <VaultGate>{children}</VaultGate>;
};

// Dual-mode Root Route: Authenticated -> Dashboard, Cloud/Unified -> Landing, App-only -> /login
const RootRoute: React.FC = () => {
  const { user, isLoading } = useAuth();
  const target = getAppTarget();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (user) {
    return (
      <VaultGate>
        <Dashboard />
      </VaultGate>
    );
  }

  // App-only target (Docker container or cloud app subdomain) greets with /login
  if (isShowcaseExcluded || target === 'app') {
    return <Navigate to="/login" replace />;
  }

  // Unified or showcase target defaults unauthenticated visitors to /welcome
  return <Navigate to="/welcome" replace />;
};

const LazyLanding: React.FC = () => {
  if (isShowcaseExcluded || !Landing) {
    return <Navigate to="/login" replace />;
  }
  return (
    <React.Suspense fallback={<LoadingScreen />}>
      <Landing />
    </React.Suspense>
  );
};

const LazyLegalCenter: React.FC = () => {
  if (isShowcaseExcluded || !LegalCenter) {
    return <Navigate to="/login" replace />;
  }
  return (
    <React.Suspense fallback={<LoadingScreen />}>
      <LegalCenter />
    </React.Suspense>
  );
};

const App: React.FC = () => {
  if (getAuthCapabilities().misconfigured) {
    return <CloudMisconfiguredScreen />;
  }

  return (
    <AuthProvider>
      <DataProvider>
        <Router>
          <ScrollToTop />
          <LegacyHashRedirect />
          <Layout>
            <Routes>
              {/* Public Showcase & Legal Routes */}
              <Route path="/" element={<RootRoute />} />
              <Route path="/welcome" element={<LazyLanding />} />
              <Route path="/legal" element={<LazyLegalCenter />} />
              <Route path="/privacy" element={<LazyLegalCenter />} />
              <Route path="/terms" element={<LazyLegalCenter />} />
              <Route path="/cookies" element={<LazyLegalCenter />} />
              <Route path="/accessibility" element={<LazyLegalCenter />} />
              <Route path="/welcome/legal" element={<LazyLegalCenter />} />
              <Route path="/welcome/privacy" element={<LazyLegalCenter />} />
              <Route path="/welcome/terms" element={<LazyLegalCenter />} />
              <Route path="/welcome/cookies" element={<LazyLegalCenter />} />
              <Route path="/welcome/accessibility" element={<LazyLegalCenter />} />

              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/auth/confirm" element={<AuthConfirm />} />
              <Route path="/forgot-password" element={<PasswordResetFlow initialMode="request" />} />
              <Route path="/reset-password" element={<PasswordResetFlow initialMode="recover" />} />
              <Route path="/portfolio" element={<ProtectedRoute><PortfolioHub /></ProtectedRoute>} />
              <Route path="/portfolio/summary" element={<ProtectedRoute><Portfolio /></ProtectedRoute>} />
              <Route path="/positions" element={<ProtectedRoute><Positions /></ProtectedRoute>} />
              <Route path="/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
              <Route path="/analytics/performance" element={<ProtectedRoute><PortfolioPerformance /></ProtectedRoute>} />
              <Route path="/analytics/pl" element={<ProtectedRoute><RealizedUnrealizedPL /></ProtectedRoute>} />
              <Route path="/analytics/fees" element={<ProtectedRoute><FeeAnalysis /></ProtectedRoute>} />
              {/* /analytics/tax → redirect to the new fiscal module */}
              <Route path="/analytics/tax" element={<Navigate to="/tax" replace />} />

              {/* Fiscalité Module */}
              <Route path="/tax" element={<ProtectedRoute><TaxHub /></ProtectedRoute>} />
              <Route path="/tax/declaration" element={<ProtectedRoute><DeclarationAssistant /></ProtectedRoute>} />
              <Route path="/tax/optimization" element={<ProtectedRoute><TaxOptimization /></ProtectedRoute>} />
              <Route path="/tax/guide" element={<ProtectedRoute><TaxGuide /></ProtectedRoute>} />
              
              {/* Legacy route redirects */}
              <Route path="/reports" element={<Navigate to="/analytics" replace />} />
              <Route path="/reports/*" element={<Navigate to="/analytics" replace />} />
              <Route path="/goals" element={<Navigate to="/progress" replace />} />
              <Route path="/alerts" element={<Navigate to="/notifications" replace />} />

              <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/progress" element={<ProtectedRoute><Progress /></ProtectedRoute>} />
              <Route path="/import" element={<ProtectedRoute><React.Suspense fallback={<LoadingScreen />}><ImportWizard /></React.Suspense></ProtectedRoute>} />
              <Route path="/import-history" element={<ProtectedRoute><React.Suspense fallback={<LoadingScreen />}><ImportHistory /></React.Suspense></ProtectedRoute>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
          <ConsentGatedAnalytics />
        </Router>
      </DataProvider>
    </AuthProvider>
  );
};

export default App;