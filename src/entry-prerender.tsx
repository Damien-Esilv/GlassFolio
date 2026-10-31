/**
 * Server entry of the prerender (TGLA-193), bundled by `vite build --ssr` and only used by
 * scripts/prerender.mjs at build time: it never reaches the browser.
 */
import React from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { StaticRouter } from 'react-router-dom';
import i18n from './i18n';
import { AuthProvider } from './context/AuthContext';
import { PrerenderedMotion, ShowcaseRoutes } from './ShowcaseApp';
import { FR_BASENAME, PUBLIC_ROUTES, canonicalUrl, localizedPath, type PublicLanguage, type PublicSeoKey } from './config/publicRoutes';
import { CHANGELOG } from './constants/changelog';

export { PUBLIC_ROUTES, canonicalUrl, localizedPath };

export const latestReleaseDate = (): string => CHANGELOG[0].date;

export const seoTexts = (key: PublicSeoKey | 'notFound', language: PublicLanguage = 'en'): { title: string; description: string } => ({
  title: i18n.t(`seo:${key}.title`, { lng: language }),
  description: i18n.t(`seo:${key}.description`, { lng: language }),
});

export const renderPublicPage = async (path: string, language: PublicLanguage = 'en'): Promise<string> => {
  await i18n.changeLanguage(language);
  const { prelude } = await prerenderToNodeStream(
    // Same boundaries as main.tsx and ShowcaseApp, or hydration fails and the page renders twice
    <React.StrictMode>
      <React.Suspense fallback={null}>
        <AuthProvider>
          <PrerenderedMotion>
            <React.Fragment key="hydration">
              <StaticRouter location={localizedPath(path, language)} basename={language === 'fr' ? FR_BASENAME : undefined}>
                <ShowcaseRoutes />
              </StaticRouter>
            </React.Fragment>
          </PrerenderedMotion>
        </AuthProvider>
      </React.Suspense>
    </React.StrictMode>,
    // React outlines big boundaries behind an inline script, which script-src 'self' blocks
    { progressiveChunkSize: Number.POSITIVE_INFINITY },
  );
  const chunks: Buffer[] = [];
  for await (const chunk of prelude) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString('utf-8');
};
