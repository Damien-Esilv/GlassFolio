#!/usr/bin/env node
/**
 * Turns the showcase build into its Vercel layout (TGLA-193). Static files win over rewrites, and "/"
 * must be the prerendered home, so nothing may sit at dist/index.html:
 *   dist/_p/<page>.html   prerendered public pages (rewritten from their URLs by vercel.json)
 *   dist/404.html         real 404 of the public site
 *   dist/app-shell.html   empty shell for app URLs, which the showcase redirects to the app host
 *   dist/sitemap.xml      generated from src/config/publicRoutes.ts
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Same links as the production public host: the browser build resolves it from the hostname
process.env.VITE_APP_TARGET = 'showcase';
process.env.VITE_DEPLOYMENT_MODE = 'cloud';

// Node has no web storage: the app reads preferences from it while rendering, and finds them empty
const emptyStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  length: 0,
};
for (const name of ['localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, name, { value: emptyStorage, configurable: true });
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const serverDir = join(root, '.prerender');

const { PUBLIC_ROUTES, canonicalUrl, latestReleaseDate, renderPublicPage, seoTexts } = await import(
  pathToFileURL(join(serverDir, 'entry-prerender.js')).href
);

const escapeAttribute = (value) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const replaceOnce = (html, pattern, replacement) => {
  if (!pattern.test(html)) throw new Error(`prerender: ${pattern} not found in index.html`);
  return html.replace(pattern, () => replacement);
};

const setMeta = (html, attribute, name, value) =>
  replaceOnce(
    html,
    new RegExp(`<meta ${attribute}="${name}" content="[^"]*"\\s*/?>`),
    `<meta ${attribute}="${name}" content="${escapeAttribute(value)}" />`,
  );

const buildPage = ({ shell, body, title, description, canonical, softwareSchema, path }) => {
  let html = replaceOnce(shell, /<title>[^<]*<\/title>/, `<title>${escapeAttribute(title)}</title>`);
  html = setMeta(html, 'name', 'description', description);
  html = setMeta(html, 'property', 'og:title', title);
  html = setMeta(html, 'property', 'og:description', description);
  html = setMeta(html, 'name', 'twitter:title', title);
  html = setMeta(html, 'name', 'twitter:description', description);
  if (canonical) {
    html = setMeta(html, 'property', 'og:url', canonical);
    html = replaceOnce(html, /<\/title>/, `</title>\n  <link rel="canonical" href="${canonical}" />`);
  } else {
    html = replaceOnce(html, /\s*<meta property="og:url" content="[^"]*"\s*\/?>/, '');
  }
  if (!softwareSchema) {
    html = replaceOnce(html, /\s*<!-- Schema\.org[^>]*-->\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
  }
  // Blocking on purpose and same-origin (script-src 'self'): applies theme and language before paint
  html = replaceOnce(html, /<script type="module"/, '<script src="/prerender-gate.js"></script>\n  <script type="module"');
  return replaceOnce(html, /<div id="root"><\/div>/, `<div id="root" data-prerendered="${path}">${body}</div>`);
};

const assertRendered = (path, body) => {
  if (!/<h1[\s>]/.test(body)) throw new Error(`prerender: ${path} has no <h1>`);
  // script-src 'self' would block it, leaving the content hidden in a Suspense boundary
  if (/<script\b|<template\b|id="S:/.test(body)) throw new Error(`prerender: ${path} needs inline scripts`);
  if (/opacity:\s*0/.test(body.replace(/aria-hidden="true"[^>]*>/g, ''))) {
    throw new Error(`prerender: ${path} ships content at opacity 0`);
  }
};

const shell = readFileSync(join(dist, 'index.html'), 'utf-8');
mkdirSync(join(dist, '_p'), { recursive: true });

for (const route of PUBLIC_ROUTES) {
  const body = await renderPublicPage(route.path);
  assertRendered(route.path, body);
  const page = buildPage({
    shell,
    body,
    path: route.path,
    canonical: canonicalUrl(route.path),
    softwareSchema: route.softwareSchema,
    ...seoTexts(route.seoKey),
  });
  writeFileSync(join(dist, '_p', `${route.file}.html`), page);
}

const notFoundPath = '/404';
const notFoundBody = await renderPublicPage(notFoundPath);
assertRendered(notFoundPath, notFoundBody);
writeFileSync(
  join(dist, '404.html'),
  buildPage({ shell, body: notFoundBody, path: notFoundPath, canonical: null, softwareSchema: false, ...seoTexts('notFound') }),
);

const releaseDate = latestReleaseDate();
const urls = PUBLIC_ROUTES.map((route) => {
  const lastmod = route.datedByChangelog ? `\n    <lastmod>${releaseDate}</lastmod>` : '';
  return `  <url>\n    <loc>${canonicalUrl(route.path)}</loc>${lastmod}\n  </url>`;
});
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
);

renameSync(join(dist, 'index.html'), join(dist, 'app-shell.html'));
rmSync(serverDir, { recursive: true, force: true });
console.log(`Prerendered ${PUBLIC_ROUTES.length} public pages and the 404 page into dist/`);
