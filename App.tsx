import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import Progress from './pages/Progress';
import ImportWizard from './pages/ImportWizard';
import ImportHistory from './pages/ImportHistory';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { DataProvider } from './context/DataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useTranslation } from 'react-i18next';
import './src/i18n'; // Initialize i18n

// Helper component for protected routes
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-canvas text-brand">{t('common:labels.loading')}</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <DataProvider>
        <Router>
          <Layout>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />

              {/* Protected Routes */}
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
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

              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/progress" element={<ProtectedRoute><Progress /></ProtectedRoute>} />
              <Route path="/import" element={<ProtectedRoute><ImportWizard /></ProtectedRoute>} />
              <Route path="/import-history" element={<ProtectedRoute><ImportHistory /></ProtectedRoute>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </Router>
      </DataProvider>
    </AuthProvider>
  );
};

export default App;