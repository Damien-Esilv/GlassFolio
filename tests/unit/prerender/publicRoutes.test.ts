import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PUBLIC_ROUTES, canonicalUrl, findPublicRoute } from '../../../src/config/publicRoutes';
import { resolveVercelBuildTarget } from '../../../scripts/lib/vercelBuildTarget.mjs';

interface HostMatch { type: string; value: string }
interface Rewrite { source: string; destination: string; has?: HostMatch[] }
interface Redirect { source: string; destination: string; statusCode?: number; has?: HostMatch[] }
interface VercelConfig { buildCommand: string; rewrites: Rewrite[]; redirects: Redirect[] }

const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf-8');
const config = JSON.parse(read('vercel.json')) as VercelConfig;
const compile = (source: string): RegExp => new RegExp(`^${source.replace(/:page\(/, '(')}$`);
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

  it('builds canonicals on the apex, and treats /welcome paths as the same pages', () => {
    expect(canonicalUrl('/')).toBe('https://glassfolio.dev/');
    expect(canonicalUrl('/about')).toBe('https://glassfolio.dev/about');
    expect(findPublicRoute('/welcome')?.path).toBe('/');
    expect(findPublicRoute('/welcome/about')?.path).toBe('/about');
    expect(findPublicRoute('/nope')).toBeUndefined();
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

  it('serves every public route from its prerendered file', () => {
    expect(destinationFor('/')).toBe('/_p/index.html');
    PUBLIC_ROUTES.filter((route) => route.path !== '/').forEach((route) => {
      expect(destinationFor(route.path), route.path).toBe('/_p/:page.html');
      expect(route.file).toBe(route.path.slice(1));
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
    ['/nope', '/llms.txt', '/sw.js', '/ai-catalog.json', '/assets/old.js', '/.well-known/ai-plugin.json'].forEach((path) => {
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
});
