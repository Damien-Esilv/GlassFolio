import './config/zodRuntime';
import React from 'react';
import ReactDOM from 'react-dom/client';
// Inter is self-hosted (no request to Google Fonts, hence no visitor IP sent to a third party).
import './fonts.css';
import './index.css';
import { consumeUrlBootstrapParams } from './config/urlBootstrap';
import { installTrustedTypesDefaultPolicy } from './services/security/trustedTypes';
import { bootstrapLocalPersistence } from './services/storage/localPersistenceBootstrap';
import { installChunkReloadHandler } from './services/storage/chunkReload';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import { getSyncedPublicLanguage } from './services/storage/publicPreferencesSync';

// Synchronous preference & URL handoff bootstrap before any render
consumeUrlBootstrapParams();

// Before any library code runs: Trusted Types `default` policy (same-origin script URLs only)
installTrustedTypesDefaultPolicy();

// A chunk of the previous build is gone after a deployment: reload once instead of a blank page
installChunkReloadHandler();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// @ts-expect-error import.meta.env is injected by Vite at compile time
const isShowcaseBuild = import.meta.env.VITE_APP_TARGET === 'showcase';
// @ts-expect-error import.meta.env is injected by Vite at compile time
const isAppBuild = import.meta.env.VITE_APP_TARGET === 'app';

// Static HTML from dist/_p (showcase project only)
const isPrerendered = !isAppBuild && rootElement.hasAttribute('data-prerendered');
const isShowcase = isShowcaseBuild || isPrerendered;

// Resolved at build time so each target's bundle leaves the other one out (Docker has no showcase)
const ShowcaseApp = isAppBuild ? null : React.lazy(() => import('./ShowcaseApp'));
const FullApp = isShowcaseBuild ? null : React.lazy(() => import('./App'));
const StartupFailure = React.lazy(() => import('./components/security/LocalVaultStartupFailure'));

const fallback = <div className="min-h-screen bg-canvas" />;

const wrapTree = (content: React.ReactNode): React.ReactElement => (
  <React.StrictMode>
    <AppErrorBoundary>
      <React.Suspense fallback={fallback}>{content}</React.Suspense>
    </AppErrorBoundary>
  </React.StrictMode>
);

let root: ReactDOM.Root | null = null;

const renderApp = (): void => {
  root ??= ReactDOM.createRoot(rootElement);
  root.render(wrapTree(isShowcase && ShowcaseApp ? <ShowcaseApp /> : FullApp && <FullApp />));
};

/** The static HTML is in English: another language replaces it instead of hydrating it. */
const renderPrerendered = async (): Promise<void> => {
  if (isAppBuild) return;
  const { ShowcaseApp: LoadedShowcaseApp, preloadPublicPage } = await import('./ShowcaseApp');
  await preloadPublicPage(window.location.pathname);
  const tree = wrapTree(<LoadedShowcaseApp prerendered />);
  if (getSyncedPublicLanguage() === 'en') {
    root = ReactDOM.hydrateRoot(rootElement, tree);
  } else {
    root = ReactDOM.createRoot(rootElement);
    root.render(tree);
  }
};

const renderStartupFailure = (message: string): void => {
  root ??= ReactDOM.createRoot(rootElement);
  root.render(
    <React.Suspense fallback={fallback}>
      <StartupFailure initialDetail={message} onRecovered={renderApp} />
    </React.Suspense>
  );
};

// Local mode: the server's vault snapshot must be in memory before any service reads storage.
// The showcase build has no app data, so it starts immediately.
const start = async (): Promise<void> => {
  if (!isAppBuild && isPrerendered) {
    await renderPrerendered();
    return;
  }
  if (isShowcase) {
    renderApp();
    return;
  }
  const result = await bootstrapLocalPersistence();
  if (result.status === 'ready') renderApp();
  else renderStartupFailure(result.message);
};

start().catch((err: unknown) => {
  // Never a blank page: an unexpected startup error gets the same recovery screen
  renderStartupFailure(err instanceof Error ? err.message : String(err));
});
