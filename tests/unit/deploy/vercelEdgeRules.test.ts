import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

interface HostMatch { type: string; value: string }
interface HeaderRule { source: string; has?: HostMatch[]; headers: { key: string; value: string }[] }
interface VercelConfig {
  rewrites: { source: string; destination: string }[];
  redirects: { source: string; has?: HostMatch[]; destination: string; statusCode?: number }[];
  headers: HeaderRule[];
}

const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf-8')) as VercelConfig;
const sourceToRegExp = (source: string): RegExp => new RegExp(`^${source}$`);

describe('vercel.json edge rules', () => {
  it('leaves the www and apex redirect to the Vercel domain settings, where a second rule would loop', () => {
    // A redirect to an absolute address would fight the domain settings; the language redirects stay on the same host
    expect(config.redirects.some((entry) => /^https?:/.test(entry.destination))).toBe(false);
    expect(config.redirects.some((entry) => entry.source === '/:path*')).toBe(false);
  });

  it('sends noindex on the app and test hosts and the internal files, never on public URLs', () => {
    const noindex = config.headers.filter((rule) => rule.headers.some((header) => header.key === 'X-Robots-Tag'));
    const hosts = noindex.filter((rule) => rule.has).map((rule) => rule.has?.[0].value);
    expect(hosts).toEqual(['app.glassfolio.dev', 'dev-app.glassfolio.dev', 'dev-showcase.glassfolio.dev']);
    expect(noindex.filter((rule) => !rule.has).map((rule) => rule.source)).toEqual(['/_p/(.*)', '/app-shell.html']);
  });

  it('caches hashed assets for a year and nothing else', () => {
    const cached = config.headers.filter((rule) => rule.headers.some((header) => header.key === 'Cache-Control'));
    expect(cached.map((rule) => rule.source)).toEqual(['/assets/(.*)']);
    expect(cached[0].headers[0].value).toBe('public, max-age=31536000, immutable');
  });

  it('never rewrites a missing asset to HTML, which would be cached for a year', () => {
    config.rewrites.forEach((rule) => {
      expect(sourceToRegExp(rule.source.replace(':page(', '(')).test('/assets/old-chunk.js'), rule.source).toBe(false);
    });
  });
});
