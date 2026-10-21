import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveAppTarget,
  getAppTarget,
  getDeploymentMode,
  getAppUrl,
  getShowcaseUrl,
  isShowcaseAvailable,
  buildAppDestinationUrl,
  buildShowcaseDestinationUrl,
} from '../../../src/config/deployment';
import { consumeUrlBootstrapParams, _resetUrlBootstrapCache } from '../../../src/config/urlBootstrap';
import { appStorage } from '../../../src/services/storage/appStorage';
import { PUBLIC_THEME_STORAGE_KEY, PUBLIC_LANG_STORAGE_KEY } from '../../../src/services/storage/storageKeys';

describe('Dual-Entry Deployment & URL Handoff (TGLA-058)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    _resetUrlBootstrapCache();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    _resetUrlBootstrapCache();
  });

  describe('getDeploymentMode', () => {
    it('defaults to local when neither variable is set', () => {
      vi.stubEnv('VITE_DEPLOYMENT_MODE', '');
      vi.stubEnv('VITE_STORAGE_MODE', '');
      expect(getDeploymentMode()).toBe('local');
    });

    it('resolves cloud from VITE_DEPLOYMENT_MODE', () => {
      vi.stubEnv('VITE_DEPLOYMENT_MODE', 'cloud');
      vi.stubEnv('VITE_STORAGE_MODE', '');
      expect(getDeploymentMode()).toBe('cloud');
    });

    it('falls back to VITE_STORAGE_MODE as a resilient alias', () => {
      vi.stubEnv('VITE_DEPLOYMENT_MODE', '');
      vi.stubEnv('VITE_STORAGE_MODE', 'cloud');
      expect(getDeploymentMode()).toBe('cloud');
    });
  });

  describe('resolveAppTarget', () => {
    it('defaults to app when mode is local', () => {
      expect(resolveAppTarget(undefined, 'local')).toBe('app');
    });

    it('defaults to unified when mode is cloud', () => {
      expect(resolveAppTarget(undefined, 'cloud')).toBe('unified');
    });

    it('respects explicit target override', () => {
      expect(resolveAppTarget('unified', 'cloud')).toBe('unified');
      expect(resolveAppTarget('app', 'cloud')).toBe('app');
      expect(resolveAppTarget('showcase', 'local')).toBe('showcase');
    });

    it('normalizes case and invalid inputs to cloud default', () => {
      expect(resolveAppTarget('APP', 'cloud')).toBe('app');
      expect(resolveAppTarget('unknown-value', 'cloud')).toBe('unified');
    });
  });

  describe('buildAppDestinationUrl', () => {
    it('builds relative path in single-origin unified mode', () => {
      const url = buildAppDestinationUrl('/login');
      expect(url).toBe('/login');
    });

    it('attaches query params in single-origin unified mode', () => {
      const url = buildAppDestinationUrl('/login', { demo: true, theme: 'dark', lang: 'fr' });
      expect(url).toBe('/login?theme=dark&lang=fr&demo=1');
    });

    it('builds cross-subdomain URL when app base is defined', () => {
      vi.stubEnv('VITE_APP_URL', 'https://app.glassfolio.dev');
      const url = buildAppDestinationUrl('/', { demo: true, theme: 'night', lang: 'en' });
      expect(url).toBe('https://app.glassfolio.dev/?theme=night&lang=en&demo=1');
      vi.unstubAllEnvs();
    });

    it('trims trailing slashes from app base URL', () => {
      vi.stubEnv('VITE_APP_URL', 'https://app.glassfolio.dev///');
      const url = buildAppDestinationUrl('/signup');
      expect(url).toBe('https://app.glassfolio.dev/signup');
      vi.unstubAllEnvs();
    });
  });

  describe('buildShowcaseDestinationUrl', () => {
    it('returns /welcome for root in unified mode', () => {
      expect(buildShowcaseDestinationUrl('/')).toBe('/welcome');
    });

    it('returns subpath as-is in unified mode', () => {
      expect(buildShowcaseDestinationUrl('/legal')).toBe('/legal');
    });

    it('builds external showcase URL when showcase base is configured', () => {
      vi.stubEnv('VITE_SHOWCASE_URL', 'https://glassfolio.dev');
      expect(buildShowcaseDestinationUrl('/')).toBe('https://glassfolio.dev/');
      expect(buildShowcaseDestinationUrl('/terms')).toBe('https://glassfolio.dev/terms');
      vi.unstubAllEnvs();
    });
  });

  describe('isShowcaseAvailable', () => {
    it('returns true if showcase URL is explicitly defined', () => {
      vi.stubEnv('VITE_SHOWCASE_URL', 'https://glassfolio.dev');
      expect(isShowcaseAvailable()).toBe(true);
      vi.unstubAllEnvs();
    });

    it('returns true if target is unified', () => {
      vi.stubEnv('VITE_APP_TARGET', 'unified');
      expect(isShowcaseAvailable()).toBe(true);
      vi.unstubAllEnvs();
    });

    it('returns false in local docker app-only container without showcase URL', () => {
      vi.stubEnv('VITE_DEPLOYMENT_MODE', 'local');
      vi.stubEnv('VITE_APP_TARGET', 'app');
      vi.stubEnv('VITE_SHOWCASE_URL', '');
      expect(isShowcaseAvailable()).toBe(false);
      vi.unstubAllEnvs();
    });
  });

  describe('consumeUrlBootstrapParams', () => {
    it('extracts demo, theme, and lang and cleans window URL in place', () => {
      const mockReplaceState = vi.fn();
      window.history.replaceState = mockReplaceState;

      // Simulate URL with bootstrap query params before the hash: https://app.glassfolio.dev/?demo=1&theme=light&lang=fr#/
      const fakeUrl = 'https://app.glassfolio.dev/?demo=1&theme=light&lang=fr#/';
      delete (window as any).location;
      window.location = new URL(fakeUrl) as any;

      const result = consumeUrlBootstrapParams();

      expect(result.demoRequested).toBe(true);
      expect(result.theme).toBe('light');
      expect(result.lang).toBe('fr');

      // Verifies storage synchronization
      expect(appStorage.getItem(PUBLIC_THEME_STORAGE_KEY)).toBe('light');
      expect(appStorage.getItem(PUBLIC_LANG_STORAGE_KEY)).toBe('fr');

      // Verifies DOM attribute
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');

      // Verifies URL was cleaned in-place with history.replaceState
      expect(mockReplaceState).toHaveBeenCalledWith(
        null,
        '',
        '/#/'
      );
    });

    it('extracts demo, theme, and lang from clean URL and cleans window URL in place', () => {
      const mockReplaceState = vi.fn();
      window.history.replaceState = mockReplaceState;

      const fakeUrl = 'https://app.glassfolio.dev/login?demo=1&theme=dark&lang=en';
      delete (window as any).location;
      window.location = new URL(fakeUrl) as any;

      const result = consumeUrlBootstrapParams();

      expect(result.demoRequested).toBe(true);
      expect(result.theme).toBe('dark');
      expect(result.lang).toBe('en');

      expect(appStorage.getItem(PUBLIC_THEME_STORAGE_KEY)).toBe('dark');
      expect(appStorage.getItem(PUBLIC_LANG_STORAGE_KEY)).toBe('en');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      expect(mockReplaceState).toHaveBeenCalledWith(
        null,
        '',
        '/login'
      );
    });

    it('returns default state when no bootstrap params are present', () => {
      const fakeUrl = 'https://app.glassfolio.dev/#/portfolio';
      delete (window as any).location;
      window.location = new URL(fakeUrl) as any;

      const result = consumeUrlBootstrapParams();

      expect(result.demoRequested).toBe(false);
      expect(result.theme).toBeUndefined();
      expect(result.lang).toBeUndefined();
    });
  });

  describe('Dynamic Hostname Resolution', () => {
    const originalLocation = window.location;

    afterEach(() => {
      delete (window as any).location;
      (window as any).location = originalLocation;
    });

    it('resolves showcase target and app URL when on glassfolio.dev', () => {
      delete (window as any).location;
      window.location = new URL('https://glassfolio.dev/') as any;

      expect(getAppTarget()).toBe('showcase');
      expect(getAppUrl()).toBe('https://app.glassfolio.dev');
    });

    it('resolves showcase target when on www.glassfolio.dev', () => {
      delete (window as any).location;
      window.location = new URL('https://www.glassfolio.dev/') as any;

      expect(getAppTarget()).toBe('showcase');
      expect(getAppUrl()).toBe('https://app.glassfolio.dev');
    });

    it('resolves app target and showcase URL when on app.glassfolio.dev', () => {
      delete (window as any).location;
      window.location = new URL('https://app.glassfolio.dev/') as any;

      expect(getAppTarget()).toBe('app');
      expect(getShowcaseUrl()).toBe('https://glassfolio.dev');
    });

    it('allows explicit environment variable override over hostname', () => {
      delete (window as any).location;
      window.location = new URL('https://glassfolio.dev/') as any;
      vi.stubEnv('VITE_APP_TARGET', 'app');

      expect(getAppTarget()).toBe('app');
      vi.unstubAllEnvs();
    });
  });
});

