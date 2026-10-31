/**
 * Public pages prerendered to static HTML (TGLA-193): single source for the build script, the
 * per-route <head>, vercel.json checks and the sitemap. Texts live in locales/{en,fr}/seo.json.
 */
export const SITE_ORIGIN = 'https://glassfolio.dev';

export type PublicSeoKey =
  | 'home' | 'selfHost' | 'about' | 'roadmap' | 'changelog'
  | 'docs' | 'legal' | 'privacy' | 'terms' | 'cookies' | 'accessibility' | 'contact';

export interface PublicRoute {
  path: string;
  /** Output name under dist/_p/ */
  file: string;
  seoKey: PublicSeoKey;
  /** Keeps the SoftwareApplication JSON-LD of index.html (only pages about the product itself) */
  softwareSchema: boolean;
  /** Dated from the newest changelog entry in the sitemap */
  datedByChangelog: boolean;
}

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { path: '/', file: 'index', seoKey: 'home', softwareSchema: true, datedByChangelog: true },
  { path: '/self-host', file: 'self-host', seoKey: 'selfHost', softwareSchema: true, datedByChangelog: false },
  { path: '/docs', file: 'docs', seoKey: 'docs', softwareSchema: false, datedByChangelog: false },
  { path: '/about', file: 'about', seoKey: 'about', softwareSchema: false, datedByChangelog: false },
  { path: '/roadmap', file: 'roadmap', seoKey: 'roadmap', softwareSchema: false, datedByChangelog: true },
  { path: '/changelog', file: 'changelog', seoKey: 'changelog', softwareSchema: false, datedByChangelog: true },
  { path: '/legal', file: 'legal', seoKey: 'legal', softwareSchema: false, datedByChangelog: false },
  { path: '/privacy', file: 'privacy', seoKey: 'privacy', softwareSchema: false, datedByChangelog: false },
  { path: '/terms', file: 'terms', seoKey: 'terms', softwareSchema: false, datedByChangelog: false },
  { path: '/cookies', file: 'cookies', seoKey: 'cookies', softwareSchema: false, datedByChangelog: false },
  { path: '/accessibility', file: 'accessibility', seoKey: 'accessibility', softwareSchema: false, datedByChangelog: false },
  { path: '/contact', file: 'contact', seoKey: 'contact', softwareSchema: false, datedByChangelog: false },
];

/** Every public language lives under its own prefix. Adding one starts here, then locales and vercel.json. */
export const PUBLIC_LANGUAGES = ['en', 'fr'] as const;
export type PublicLanguage = (typeof PUBLIC_LANGUAGES)[number];

/** Language of x-default and of every visitor who states no preference */
export const DEFAULT_PUBLIC_LANGUAGE: PublicLanguage = 'en';

export const languageBasename = (language: PublicLanguage): string => `/${language}`;

/** A public path in a given language: /en/about, /fr/about, and /en or /fr for the home page. */
export const localizedPath = (path: string, language: PublicLanguage): string =>
  path === '/' ? languageBasename(language) : `${languageBasename(language)}${path}`;

/** The language of an address, or undefined on one without a prefix (/, /welcome, an unknown path) */
export const languageFromPath = (pathname: string): PublicLanguage | undefined =>
  PUBLIC_LANGUAGES.find((language) => pathname === languageBasename(language) || pathname.startsWith(`${languageBasename(language)}/`));

export const canonicalUrl = (path: string, language: PublicLanguage = DEFAULT_PUBLIC_LANGUAGE): string =>
  `${SITE_ORIGIN}${localizedPath(path, language)}`;

/** The hreflang alternates of a page: every language, plus x-default */
export const alternateUrls = (path: string): Array<{ lang: string; href: string }> => [
  ...PUBLIC_LANGUAGES.map((lang) => ({ lang, href: canonicalUrl(path, lang) })),
  { lang: 'x-default', href: canonicalUrl(path, DEFAULT_PUBLIC_LANGUAGE) },
];

/** `/welcome/about`, `/en/about` and `/about` are the same page */
export const findPublicRoute = (pathname: string): PublicRoute | undefined => {
  const short = pathname.replace(new RegExp(`^/(welcome|${PUBLIC_LANGUAGES.join('|')})(?=/|$)`), '').replace(/\/+$/, '') || '/';
  return PUBLIC_ROUTES.find((route) => route.path === short);
};
