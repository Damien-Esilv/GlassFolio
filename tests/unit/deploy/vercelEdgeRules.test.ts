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
  it('redirects www to the apex with a 301, keeping the path', () => {
    const rule = config.redirects.find((entry) => entry.has?.[0]?.value === 'www.glassfolio.dev');
    expect(rule?.statusCode).toBe(301);
    expect(rule?.destination).toBe('https://glassfolio.dev/:path*');
  });

  it('sends noindex on the app host only', () => {
    const noindex = config.headers.filter((rule) => rule.headers.some((header) => header.key === 'X-Robots-Tag'));
    expect(noindex).toHaveLength(1);
    expect(noindex[0].has).toEqual([{ type: 'host', value: 'app.glassfolio.dev' }]);
    expect(noindex[0].headers[0].value).toBe('noindex');
  });

  it('caches hashed assets for a year and nothing else', () => {
    const cached = config.headers.filter((rule) => rule.headers.some((header) => header.key === 'Cache-Control'));
    expect(cached.map((rule) => rule.source)).toEqual(['/assets/(.*)']);
    expect(cached[0].headers[0].value).toBe('public, max-age=31536000, immutable');
  });

  it('never rewrites a missing asset to the HTML shell, which would be cached for a year', () => {
    const catchAll = sourceToRegExp(config.rewrites[0].source);
    expect(catchAll.test('/assets/old-chunk.js')).toBe(false);
    expect(catchAll.test('/self-host')).toBe(true);
    expect(catchAll.test('/')).toBe(true);
    expect(catchAll.test('/.well-known/security.txt')).toBe(true);
  });
});
