import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  CSP_PROFILES,
} from '../../../server/securityHeaders.mjs';
import { expectedHeadersFromVercelConfig } from '../../../scripts/lib/smokeChecks.mjs';
import { evaluateSpaShell } from '../../../scripts/lib/dockerSmoke.mjs';

const root = process.cwd();
const profiles = ['local', 'cloud'] as const;

const directive = (csp: string, name: string): string[] => {
  const found = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
  return found ? found.slice(name.length).trim().split(/\s+/) : [];
};

const matchesSource = (origin: string, sources: string[]): boolean =>
  sources.some((source) => {
    if (source === origin) return true;
    if (!source.includes('*')) return false;
    const pattern = new RegExp(`^${source.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
    return pattern.test(origin);
  });

describe('Content-Security-Policy (E31 — TGLA-127)', () => {
  describe.each(profiles)('%s profile', (profile) => {
    const csp = buildContentSecurityPolicy(profile);

    it('restricts script execution to authorized origins and forbids unsafe-eval', () => {
      if (profile === 'local') {
        expect(directive(csp, 'script-src')).toEqual(["'self'"]);
      } else {
        expect(directive(csp, 'script-src')).toEqual(["'self'", 'https://challenges.cloudflare.com']);
      }
      expect(csp).not.toMatch(/unsafe-eval/);
      expect(directive(csp, 'default-src')).toEqual(["'self'"]);
    });

    it('forbids plugins, framing, base-tag and form hijacking', () => {
      expect(directive(csp, 'object-src')).toEqual(["'none'"]);
      if (profile === 'local') {
        expect(directive(csp, 'frame-src')).toEqual(["'none'"]);
      } else {
        expect(directive(csp, 'frame-src')).toEqual(['https://challenges.cloudflare.com']);
      }
      expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"]);
      expect(directive(csp, 'base-uri')).toEqual(["'self'"]);
      expect(directive(csp, 'form-action')).toEqual(["'self'"]);
    });

    it('never opens connections or images to arbitrary hosts', () => {
      for (const name of ['connect-src', 'img-src', 'script-src', 'style-src']) {
        const sources = directive(csp, name);
        expect(sources, name).not.toContain('*');
        expect(sources, name).not.toContain('https:');
        expect(sources, name).not.toContain('http:');
      }
    });

    it('requires Trusted Types for script sinks', () => {
      expect(csp).toContain("require-trusted-types-for 'script'");
    });

    it('allows inline styles only (React style attributes), never inline scripts', () => {
      expect(directive(csp, 'style-src')).toEqual(["'self'", "'unsafe-inline'"]);
    });
  });

  it('appends extra connect origins for self-hosters', () => {
    const csp = buildContentSecurityPolicy('local', { extraConnectSrc: ['https://ollama.example.com'] });
    expect(directive(csp, 'connect-src')).toContain('https://ollama.example.com');
  });

  it('gives only the cloud profile Supabase, direct Yahoo quotes, Turnstile and Google avatars', () => {
    const local = buildContentSecurityPolicy('local');
    const cloud = buildContentSecurityPolicy('cloud');
    expect(directive(cloud, 'connect-src')).toEqual(expect.arrayContaining(['https://*.supabase.co', 'https://query1.finance.yahoo.com', 'https://challenges.cloudflare.com']));
    expect(directive(local, 'connect-src')).not.toContain('https://*.supabase.co');
    expect(directive(local, 'connect-src')).not.toContain('https://challenges.cloudflare.com');
    expect(directive(cloud, 'img-src')).toContain('https://*.googleusercontent.com');
    expect(directive(local, 'img-src')).not.toContain('https://*.googleusercontent.com');
  });

  it('covers every external API origin the app calls (add new hosts to server/securityHeaders.mjs)', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
      }
    };
    walk(join(root, 'src/services/ai'));
    files.push(join(root, 'src/services/priceService.ts'), join(root, 'src/services/assetSearchService.ts'), join(root, 'src/config/marketData.ts'));

    const origins = new Set<string>();
    for (const file of files) {
      for (const match of readFileSync(file, 'utf-8').matchAll(/https:\/\/[a-z0-9.-]+\.[a-z]{2,}/g)) origins.add(match[0]);
    }
    expect(origins.size).toBeGreaterThanOrEqual(7);
    const cloudSources = CSP_PROFILES.cloud.connectSrc as string[];
    for (const origin of origins) {
      expect(matchesSource(origin, cloudSources), `${origin} is called by the app but not allowed by the CSP`).toBe(true);
    }
  });

  it('keeps vercel.json in sync with the cloud profile (run `npm run security:headers`)', () => {
    const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf-8'));
    const expected = Object.fromEntries(Object.entries(buildSecurityHeaders('cloud')).map(([key, value]) => [key.toLowerCase(), value]));
    expect(expectedHeadersFromVercelConfig(vercel)).toEqual(expected);
  });

  it('sets the complete hardening header set', () => {
    const headers = buildSecurityHeaders('local');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(headers['Strict-Transport-Security']).toBeUndefined(); // plain http on localhost
    expect(buildSecurityHeaders('cloud')['Strict-Transport-Security']).toBeDefined();
  });

  it('is enforced by the Docker smoke test helper', () => {
    const base = { path: '/', status: 200, contentType: 'text/html', body: '<div id="root"></div>' };
    const good = { ...buildSecurityHeaders('local') } as Record<string, string>;
    const lower = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
    expect(evaluateSpaShell({ ...base, headers: lower(good) })).toEqual([]);
    const weak = lower({ ...good, 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'" });
    expect(evaluateSpaShell({ ...base, headers: weak }).length).toBeGreaterThan(0);
  });
});
