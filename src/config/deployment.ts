/**
 * Deployment mode and application target resolution (TGLA-058).
 *
 *  - DeploymentMode:
 *    - `local` (default): 100% local / self-hosted, browser storage.
 *    - `cloud`: hosted build (Azure SWA / Vercel).
 *
 *  - AppTarget:
 *    - `unified`: Dual-mode single origin (used in dev/test, serves /welcome and /).
 *    - `showcase`: Apex domain public showcase build (Landing, Legal, Consent only).
 *    - `app`: Financial app subdomain build & Docker container (zero showcase bloat).
 */

export type DeploymentMode = 'local' | 'cloud';
export type AppTarget = 'unified' | 'showcase' | 'app';

export const DEFAULT_DEPLOYMENT_MODE: DeploymentMode = 'local';
export const DEFAULT_APP_TARGET: AppTarget = 'unified';

// Test domains of the `develop` branch, one per Vercel project
const DEV_SHOWCASE_HOST = 'dev-showcase.glassfolio.dev';
const DEV_APP_HOST = 'dev-app.glassfolio.dev';

const VALID_MODES: readonly DeploymentMode[] = ['local', 'cloud'];
const VALID_TARGETS: readonly AppTarget[] = ['unified', 'showcase', 'app'];

const getEnvVar = (key: string): string | undefined => {
  const metaEnv = typeof import.meta !== 'undefined'
    ? (import.meta as { env?: Record<string, string | undefined> }).env
    : undefined;
  const procEnv = typeof process !== 'undefined' ? process.env : undefined;
  return procEnv?.[key] ?? metaEnv?.[key];
};

export const resolveDeploymentMode = (raw: string | undefined): DeploymentMode => {
  const normalized = raw?.trim().toLowerCase() ?? '';
  if (normalized === '') return DEFAULT_DEPLOYMENT_MODE;
  if ((VALID_MODES as readonly string[]).includes(normalized)) {
    return normalized as DeploymentMode;
  }
  console.warn(`[deployment] Unknown VITE_DEPLOYMENT_MODE "${raw}" — falling back to "${DEFAULT_DEPLOYMENT_MODE}".`);
  return DEFAULT_DEPLOYMENT_MODE;
};

export const getDeploymentMode = (): DeploymentMode => {
  const mode = getEnvVar('VITE_DEPLOYMENT_MODE')?.trim() || getEnvVar('VITE_STORAGE_MODE')?.trim();
  return resolveDeploymentMode(mode);
};

export const resolveAppTarget = (
  rawTarget: string | undefined,
  mode: DeploymentMode = getDeploymentMode()
): AppTarget => {
  const normalized = rawTarget?.trim().toLowerCase() ?? '';
  if ((VALID_TARGETS as readonly string[]).includes(normalized)) {
    return normalized as AppTarget;
  }
  // If no explicit target, local mode defaults to 'app'
  if (mode === 'local') {
    return 'app';
  }
  return DEFAULT_APP_TARGET;
};

export const getAppTarget = (): AppTarget => {
  const envTarget = getEnvVar('VITE_APP_TARGET');
  if (envTarget && (VALID_TARGETS as readonly string[]).includes(envTarget.toLowerCase())) {
    return envTarget.toLowerCase() as AppTarget;
  }
  // Dynamic hostname detection in browser environment
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname.toLowerCase();
    if (host.startsWith('app.') || host === DEV_APP_HOST) {
      return 'app';
    }
    if (host === 'glassfolio.dev' || host === 'www.glassfolio.dev' || host === DEV_SHOWCASE_HOST) {
      return 'showcase';
    }
  }
  return resolveAppTarget(envTarget, getDeploymentMode());
};

export const getAppUrl = (): string => {
  const raw = getEnvVar('VITE_APP_URL')?.trim() ?? '';
  if (raw) return raw.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname.toLowerCase();
    if (host === 'glassfolio.dev' || host === 'www.glassfolio.dev') {
      return `${window.location.protocol}//app.glassfolio.dev`;
    }
    if (host === DEV_SHOWCASE_HOST) {
      return `${window.location.protocol}//${DEV_APP_HOST}`;
    }
  }
  return '';
};

export const getShowcaseUrl = (): string => {
  const raw = getEnvVar('VITE_SHOWCASE_URL')?.trim() ?? '';
  if (raw) return raw.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname.toLowerCase();
    if (host.startsWith('app.')) {
      return `${window.location.protocol}//glassfolio.dev`;
    }
    if (host === DEV_APP_HOST) {
      return `${window.location.protocol}//${DEV_SHOWCASE_HOST}`;
    }
  }
  return '';
};

/**
 * Checks whether the public showcase is available in the current environment.
 * In a pure self-hosted local Docker container (mode='local', target='app', no showcase URL),
 * the showcase is not available.
 */
export const isShowcaseAvailable = (): boolean => {
  if (getShowcaseUrl() !== '') return true;
  if (getAppTarget() === 'showcase' || getAppTarget() === 'unified') return true;
  return false;
};

export interface AppTransitionOptions {
  demo?: boolean;
  theme?: string;
  lang?: string;
}

/**
 * Builds the URL to transition from the showcase to the financial application.
 * Handles both cross-subdomain production (apex -> app subdomain) and same-origin unified dev.
 */
export const buildAppDestinationUrl = (
  path: '/' | '/login' | '/signup' | string = '/',
  options: AppTransitionOptions = {}
): string => {
  const appBase = getAppUrl();
  const queryParams = new URLSearchParams();
  if (options.theme) queryParams.set('theme', options.theme);
  if (options.lang) queryParams.set('lang', options.lang);
  if (options.demo) queryParams.set('demo', '1');

  const queryString = queryParams.toString();
  const queryPart = queryString ? `?${queryString}` : '';
  const normalizedPath = path === '/' ? '/' : path;

  if (appBase) {
    if (normalizedPath === '/') {
      return queryPart ? `${appBase}/${queryPart}` : `${appBase}/`;
    }
    return `${appBase}${normalizedPath}${queryPart}`;
  }

  // Single-origin unified routing
  if (queryPart) {
    return `${normalizedPath}${queryPart}`;
  }
  return path;
};

/**
 * Builds the URL to return to the showcase from the financial app.
 */
export const buildShowcaseDestinationUrl = (
  path: '/' | '/legal' | '/privacy' | '/terms' | '/cookies' | '/accessibility' = '/',
  options: AppTransitionOptions = {}
): string => {
  const showcaseBase = getShowcaseUrl();
  const queryParams = new URLSearchParams();
  if (options.theme) queryParams.set('theme', options.theme);
  if (options.lang) queryParams.set('lang', options.lang);
  const queryString = queryParams.toString();
  const queryPart = queryString ? `?${queryString}` : '';

  if (showcaseBase) {
    const normalizedPath = path === '/' ? '/' : path;
    return `${showcaseBase}${normalizedPath}${queryPart}`;
  }

  // In single-origin unified mode, root showcase is on /welcome
  if (path === '/') {
    return `/welcome${queryPart}`;
  }
  return `${path}${queryPart}`;
};
