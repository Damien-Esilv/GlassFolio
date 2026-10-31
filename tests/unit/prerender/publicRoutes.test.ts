import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PUBLIC_LANGUAGE,
  PUBLIC_LANGUAGES,
  PUBLIC_ROUTES,
  alternateUrls,
  canonicalUrl,
  findPublicRoute,
  languageFromPath,
  localizedPath,
} from '../../../src/config/publicRoutes';
import { resolveVercelBuildTarget } from '../../../scripts/lib/vercelBuildTarget.mjs';

interface HostMatch { type: string; key?: string; value: string }
interface Rewrite { source: string; destination: string; has?: HostMatch[] }
interface Redirect { source: string; destination: string; statusCode?: number; has?: HostMatch[] }
interface VercelConfig { buildCommand: string; rewrites: Rewrite[]; redirects: Redirect[] }

const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf-8');
const config = JSON.parse(read('vercel.json')) as VercelConfig;
const compile = (source: string): RegExp => new RegExp(`^${source.replace(/:(page|lang)\(/g, '(')}$`);
const SHOWCASE_HOSTS = ['glassfolio.dev', 'dev-showcase.glassfolio.dev'];
const APP_HOSTS = ['app.glassfolio.dev', 'dev-app.glassfolio.dev'];

/** What a visitor's request carries that the redirects look at */
interface RequestHints { cookie?: string; acceptLanguage?: string }

/** The first redirect that applies, in file order, like the Vercel router: `to` and `status`. */
const redirectFor = (host: string, url: string, hints: RequestHints = {}): { to: string; status: number } | undefined => {
  const { pathname, searchParams } = new URL(url, 'https://x');
  for (const rule of config.redirects) {
    const match = compile(rule.source).exec(pathname);
    if (!match) continue;
    const applies = (rule.has ?? []).every((has) => {
      const actual =
        has.type === 'host' ? host
        : has.type === 'query' ? searchParams.get(has.key ?? '')
        : has.type === 'cookie' ? hints.cookie
        : has.type === 'header' ? hints.acceptLanguage
        : undefined;
      return actual !== undefined && actual !== null && new RegExp(`^(?:${has.value})$`).test(actual);
    });
    if (!applies) continue;
    const names = [...rule.source.matchAll(/:(\w+)\(/g)].map((name) => name[1]);
    const to = names.reduce((destination, name, index) => destination.replace(`:${name}`, match[index + 1]), rule.destination);
    return { to, status: rule.statusCode ?? 308 };
  }
  return undefined;
};
const publicHostRewrites = config.rewrites.filter((rule) => !rule.has);
const destinationFor = (path: string): string | undefined =>
  publicHostRewrites.find((rule) => compile(rule.source).test(path))?.destination;
const seo = (lang: string): Record<string, { title: string; description: string }> =>
  JSON.parse(read(`locales/${lang}/seo.json`));

describe('public routes manifest', () => {
  it.each(['en', 'fr'])('gives every route its own title and description in %s', (lang) => {
    const texts = seo(lang);
    const titles = PUBLIC_ROUTES.map((route) => texts[route.seoKey].title);
    const descriptions = PUBLIC_ROUTES.map((route) => texts[route.seoKey].description);
    expect(new Set(titles).size).toBe(PUBLIC_ROUTES.length);
    expect(new Set(descriptions).size).toBe(PUBLIC_ROUTES.length);
    descriptions.forEach((description) => expect(description.length).toBeLessThanOrEqual(170));
  });

  it('gives every language its own URL, and treats /welcome paths as the same pages', () => {
    expect(PUBLIC_LANGUAGES).toContain(DEFAULT_PUBLIC_LANGUAGE);
    expect(canonicalUrl('/')).toBe('https://glassfolio.dev/en');
    expect(canonicalUrl('/about')).toBe('https://glassfolio.dev/en/about');
    expect(canonicalUrl('/', 'fr')).toBe('https://glassfolio.dev/fr');
    expect(canonicalUrl('/about', 'fr')).toBe('https://glassfolio.dev/fr/about');
    expect(localizedPath('/about', 'en')).toBe('/en/about');
    expect(findPublicRoute('/welcome')?.path).toBe('/');
    expect(findPublicRoute('/welcome/about')?.path).toBe('/about');
    PUBLIC_LANGUAGES.forEach((language) => {
      expect(findPublicRoute(`/${language}`)?.path).toBe('/');
      expect(findPublicRoute(`/${language}/about`)?.path).toBe('/about');
      expect(languageFromPath(`/${language}/about`)).toBe(language);
    });
    expect(findPublicRoute('/about')?.path).toBe('/about');
    expect(findPublicRoute('/nope')).toBeUndefined();
    expect(languageFromPath('/france')).toBeUndefined();
    expect(languageFromPath('/about')).toBeUndefined();
    expect(languageFromPath('/')).toBeUndefined();
  });

  it('declares every language and x-default on each page', () => {
    expect(alternateUrls('/about')).toEqual([
      { lang: 'en', href: 'https://glassfolio.dev/en/about' },
      { lang: 'fr', href: 'https://glassfolio.dev/fr/about' },
      { lang: 'x-default', href: 'https://glassfolio.dev/en/about' },
    ]);
    PUBLIC_LANGUAGES.forEach((language) => {
      expect(JSON.parse(read(`locales/${language}/seo.json`))).toHaveProperty('home.title');
    });
  });

  it('keeps the product schema off the legal pages', () => {
    const withSchema = PUBLIC_ROUTES.filter((route) => route.softwareSchema).map((route) => route.path);
    expect(withSchema).toEqual(['/', '/self-host']);
  });
});

describe('vercel.json serves both Vercel projects', () => {
  it('builds through the script that picks the target from the project', () => {
    expect(config.buildCommand).toBe('npm run build:vercel');
    expect(JSON.parse(read('package.json')).scripts['build:vercel']).toBe('node scripts/vercel-build.mjs');
  });

  it('resolves each project to its target and refuses an unknown one', () => {
    expect(resolveVercelBuildTarget({ VERCEL_PROJECT_ID: 'prj_zenxmm6RkErum42sENa2uQEzVTGw' })).toBe('showcase');
    expect(resolveVercelBuildTarget({ VERCEL_PROJECT_ID: 'prj_iTAiILjVqmtUCOLIpasFB8szrZfN' })).toBe('app');
    expect(resolveVercelBuildTarget({ GLASSFOLIO_BUILD_TARGET: 'showcase' })).toBe('showcase');
    expect(() => resolveVercelBuildTarget({ VERCEL_PROJECT_ID: 'prj_other' })).toThrow(/Unknown Vercel project/);
  });

  it('keeps the app hosts on the SPA shell, ahead of every other rewrite', () => {
    const [app, devApp] = config.rewrites;
    expect(app.has).toEqual([{ type: 'host', value: 'app.glassfolio.dev' }]);
    expect(devApp.has).toEqual([{ type: 'host', value: 'dev-app.glassfolio.dev' }]);
    [app, devApp].forEach((rule) => {
      expect(rule.destination).toBe('/app-shell.html');
      expect(compile(rule.source).test('/')).toBe(true);
      expect(compile(rule.source).test('/login')).toBe(true);
      expect(compile(rule.source).test('/assets/old.js')).toBe(false);
    });
  });

  it.each(PUBLIC_LANGUAGES)('serves the %s pages from their own URLs', (language) => {
    expect(destinationFor(`/${language}`)).toBe('/_p/:lang/index.html');
    PUBLIC_ROUTES.filter((route) => route.path !== '/').forEach((route) => {
      expect(destinationFor(`/${language}${route.path}`), route.path).toBe('/_p/:lang/:page.html');
      expect(route.file).toBe(route.path.slice(1));
    });
  });

  it('serves the default language on hosts that do not redirect, such as a preview URL', () => {
    expect(destinationFor('/')).toBe(`/_p/${DEFAULT_PUBLIC_LANGUAGE}/index.html`);
    PUBLIC_ROUTES.filter((route) => route.path !== '/').forEach((route) => {
      expect(destinationFor(route.path), route.path).toBe(`/_p/${DEFAULT_PUBLIC_LANGUAGE}/:page.html`);
    });
  });

  it('routes every app page to the shell on the other hosts', () => {
    const appPaths = [...read('src/App.tsx').matchAll(/path="(\/[^"*]*)/g)]
      .map((match) => match[1])
      .filter((path) => path !== '/' && !path.startsWith('/welcome') && !findPublicRoute(path));
    expect(appPaths.length).toBeGreaterThan(15);
    appPaths.forEach((path) => expect(destinationFor(path), path).toBe('/app-shell.html'));
  });

  it('leaves unknown paths and fake discovery files to the 404 page', () => {
    ['/nope', '/llms.txt', '/sw.js', '/ai-catalog.json', '/assets/old.js', '/.well-known/ai-plugin.json', '/en/nope', '/fr/nope', '/de', '/de/about'].forEach((path) => {
      expect(destinationFor(path), path).toBeUndefined();
    });
  });

  it('redirects the /welcome tree to the short URLs with a 301', () => {
    const welcome = config.redirects.filter((rule) => rule.source.startsWith('/welcome'));
    expect(welcome).toHaveLength(2);
    welcome.forEach((rule) => expect(rule.statusCode).toBe(301));
    PUBLIC_ROUTES.filter((route) => route.path !== '/').forEach((route) => {
      expect(welcome.some((rule) => compile(rule.source).test(`/welcome${route.path}`)), route.path).toBe(true);
    });
  });

  it.each(SHOWCASE_HOSTS)('sends visitors of %s to the page of their language', (host) => {
    // The home page picks by what the visitor said, most explicit first: address, saved choice, browser
    expect(redirectFor(host, '/')).toEqual({ to: `/${DEFAULT_PUBLIC_LANGUAGE}`, status: 307 });
    expect(redirectFor(host, '/', { acceptLanguage: 'fr-FR,fr;q=0.9,en;q=0.8' })?.to).toBe('/fr');
    expect(redirectFor(host, '/', { acceptLanguage: 'en-US,en;q=0.9,fr;q=0.8' })?.to).toBe('/en');
    expect(redirectFor(host, '/', { acceptLanguage: 'de-DE,de;q=0.9' })?.to).toBe('/en');
    expect(redirectFor(host, '/', { cookie: 'fr', acceptLanguage: 'en-US' })?.to).toBe('/fr');
    expect(redirectFor(host, '/', { cookie: 'en', acceptLanguage: 'fr-FR' })?.to).toBe('/en');
    expect(redirectFor(host, '/?lang=fr', { cookie: 'en' })?.to).toBe('/fr');
    expect(redirectFor(host, '/?lang=en', { cookie: 'fr' })?.to).toBe('/en');
    PUBLIC_LANGUAGES.forEach((language) => {
      expect(redirectFor(host, '/', { cookie: language })?.to, `cookie ${language}`).toBe(`/${language}`);
      expect(redirectFor(host, `/?lang=${language}`)?.to, `query ${language}`).toBe(`/${language}`);
      expect(redirectFor(host, '/', { acceptLanguage: `${language}-XX,${language};q=0.9` })?.to, `browser ${language}`).toBe(`/${language}`);
    });
  });

  it.each(SHOWCASE_HOSTS)('moves the old English URLs of %s to their language page, permanently by default', (host) => {
    PUBLIC_ROUTES.filter((route) => route.path !== '/').forEach((route) => {
      expect(redirectFor(host, route.path), route.path).toEqual({ to: `/${DEFAULT_PUBLIC_LANGUAGE}${route.path}`, status: 301 });
      expect(redirectFor(host, `${route.path}?lang=fr`)?.to, route.path).toBe(`/fr${route.path}`);
      expect(redirectFor(host, route.path, { cookie: 'fr' })?.to, route.path).toBe(`/fr${route.path}`);
      PUBLIC_LANGUAGES.forEach((language) => {
        expect(redirectFor(host, `${route.path}?lang=${language}`)?.to, `${route.path} ${language}`).toBe(`/${language}${route.path}`);
      });
    });
  });

  it.each(APP_HOSTS)('never redirects the app host %s', (host) => {
    ['/', '/about', '/privacy', '/login', '/dashboard', '/?lang=fr'].forEach((path) => {
      expect(redirectFor(host, path, { cookie: 'fr', acceptLanguage: 'fr' }), path).toBeUndefined();
    });
  });

  it('leaves the addresses that already carry a language alone', () => {
    PUBLIC_LANGUAGES.forEach((language) => {
      SHOWCASE_HOSTS.forEach((host) => {
        expect(redirectFor(host, `/${language}`, { cookie: 'fr' })).toBeUndefined();
        expect(redirectFor(host, `/${language}/about`, { cookie: 'fr' })).toBeUndefined();
      });
    });
  });
});
