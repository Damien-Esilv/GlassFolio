import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf-8');

describe('showcase hygiene (E15)', () => {
  it('sitemap and robots point to the real domain with crawlable (non-hash) URLs', () => {
    const sitemap = read('public/sitemap.xml');
    expect(sitemap).toContain('https://glassfolio.dev/privacy');
    expect(sitemap).not.toContain('glassfolio.com');
    expect(sitemap).not.toContain('/#/');
    expect(read('public/robots.txt')).toContain('Sitemap: https://glassfolio.dev/sitemap.xml');
  });

  it('serves security headers on Vercel', () => {
    const config = JSON.parse(read('vercel.json')) as { headers: { headers: { key: string }[] }[] };
    const keys = config.headers.flatMap(entry => entry.headers.map(header => header.key));
    expect(keys).toEqual(expect.arrayContaining([
      'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy', 'Strict-Transport-Security',
    ]));
  });

  it('loads no font or stylesheet from Google (visitor IP stays first-party)', () => {
    expect(read('index.html')).not.toContain('fonts.googleapis.com');
    expect(read('index.html')).not.toContain('fonts.gstatic.com');
  });

  it('declares the non-commercial source-available licence consistently', () => {
    expect(read('LICENSE')).toContain('PolyForm Noncommercial License 1.0.0');
    expect((JSON.parse(read('package.json')) as { license: string }).license).toBe('PolyForm-Noncommercial-1.0.0');
  });
});
