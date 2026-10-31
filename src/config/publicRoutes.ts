/**
 * Public pages prerendered to static HTML (TGLA-193): single source for the build script, the
 * per-route <head>, vercel.json checks and the sitemap. Texts live in locales/{en,fr}/seo.json.
 */
export const SITE_ORIGIN = 'https://glassfolio.dev';

export type PublicSeoKey =
  | 'home' | 'selfHost' | 'about' | 'roadmap' | 'changelog'
  | 'legal' | 'privacy' | 'terms' | 'cookies' | 'accessibility';

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
  { path: '/about', file: 'about', seoKey: 'about', softwareSchema: false, datedByChangelog: false },
  { path: '/roadmap', file: 'roadmap', seoKey: 'roadmap', softwareSchema: false, datedByChangelog: true },
  { path: '/changelog', file: 'changelog', seoKey: 'changelog', softwareSchema: false, datedByChangelog: true },
  { path: '/legal', file: 'legal', seoKey: 'legal', softwareSchema: false, datedByChangelog: false },
  { path: '/privacy', file: 'privacy', seoKey: 'privacy', softwareSchema: false, datedByChangelog: false },
  { path: '/terms', file: 'terms', seoKey: 'terms', softwareSchema: false, datedByChangelog: false },
  { path: '/cookies', file: 'cookies', seoKey: 'cookies', softwareSchema: false, datedByChangelog: false },
  { path: '/accessibility', file: 'accessibility', seoKey: 'accessibility', softwareSchema: false, datedByChangelog: false },
];

export const canonicalUrl = (path: string): string => `${SITE_ORIGIN}${path}`;

/** `/welcome/about` and `/welcome` are the same pages as `/about` and `/` */
export const findPublicRoute = (pathname: string): PublicRoute | undefined => {
  const short = pathname.replace(/^\/welcome(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  return PUBLIC_ROUTES.find((route) => route.path === short);
};
