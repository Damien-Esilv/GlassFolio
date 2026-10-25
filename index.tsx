import React from 'react';
import ReactDOM from 'react-dom/client';
// Inter is self-hosted (no request to Google Fonts, hence no visitor IP sent to a third party).
import './src/fonts.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// @ts-expect-error import.meta.env is injected by Vite at compile time
const isShowcase = import.meta.env.VITE_APP_TARGET === 'showcase';

const RootComponent = isShowcase
  ? React.lazy(() => import('./ShowcaseApp'))
  : React.lazy(() => import('./App'));

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <React.Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <RootComponent />
    </React.Suspense>
  </React.StrictMode>
);