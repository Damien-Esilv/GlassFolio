import './config/zodRuntime';
import React from 'react';
import ReactDOM from 'react-dom/client';
// Inter is self-hosted (no request to Google Fonts, hence no visitor IP sent to a third party).
import './fonts.css';
import './index.css';
import { consumeUrlBootstrapParams } from './config/urlBootstrap';
import { installTrustedTypesDefaultPolicy } from './services/security/trustedTypes';
import { bootstrapLocalPersistence } from './services/storage/localPersistenceBootstrap';

// Synchronous preference & URL handoff bootstrap before any render
consumeUrlBootstrapParams();

// Before any library code runs: Trusted Types `default` policy (same-origin script URLs only)
installTrustedTypesDefaultPolicy();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// @ts-expect-error import.meta.env is injected by Vite at compile time
const isShowcase = import.meta.env.VITE_APP_TARGET === 'showcase';

const RootComponent = isShowcase
  ? React.lazy(() => import('./ShowcaseApp'))
  : React.lazy(() => import('./App'));
const StartupFailure = React.lazy(() => import('./components/security/LocalVaultStartupFailure'));

const root = ReactDOM.createRoot(rootElement);
const fallback = <div className="min-h-screen bg-canvas" />;

const renderApp = (): void => {
  root.render(
    <React.StrictMode>
      <React.Suspense fallback={fallback}>
        <RootComponent />
      </React.Suspense>
    </React.StrictMode>
  );
};

const renderStartupFailure = (message: string): void => {
  root.render(
    <React.Suspense fallback={fallback}>
      <StartupFailure initialDetail={message} onRecovered={renderApp} />
    </React.Suspense>
  );
};

// Local mode: the server's vault snapshot must be in memory before any service reads storage.
// The showcase build has no app data, so it starts immediately.
const start = async (): Promise<void> => {
  if (isShowcase) {
    renderApp();
    return;
  }
  const result = await bootstrapLocalPersistence();
  if (result.status === 'ready') renderApp();
  else renderStartupFailure(result.message);
};

void start();
