/**
 * Market data endpoints.
 *
 * Yahoo Finance sends no CORS headers, so the browser reaches it through a same-origin `/yf` proxy:
 * the Vite dev server (vite.config.ts) in development and the self-hosted Node server
 * (server/yahooProxy.mjs) in local mode. Hosted cloud builds keep calling Yahoo directly.
 */

import { getDeploymentMode } from './deployment';

export const YAHOO_PROXY_PREFIX = '/yf';
export const YAHOO_ORIGIN = 'https://query1.finance.yahoo.com';

const isDevBuild = (): boolean =>
  typeof import.meta !== 'undefined'
  && (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

/** True when a same-origin `/yf` proxy is available (dev server or local/Docker deployment). */
export const usesYahooProxy = (): boolean => isDevBuild() || getDeploymentMode() === 'local';

/** Builds a Yahoo Finance URL for `path` (e.g. `/v8/finance/chart/AAPL`). */
export const yahooFinanceUrl = (path: string): string =>
  `${usesYahooProxy() ? YAHOO_PROXY_PREFIX : YAHOO_ORIGIN}${path}`;
