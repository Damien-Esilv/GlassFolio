import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { generateQrSvg } from '../../../../src/services/security/qrCode';
import { TRUSTED_TYPES_POLICIES, buildContentSecurityPolicy } from '../../../../server/securityHeaders.mjs';

type Rules = { createHTML?: (s: string) => string; createScriptURL?: (s: string) => string };

const installFactory = () => {
  const policies = new Map<string, Rules>();
  (window as unknown as { trustedTypes: unknown }).trustedTypes = {
    createPolicy: (name: string, rules: Rules) => {
      policies.set(name, rules);
      return { createHTML: (input: string) => ({ trusted: rules.createHTML?.(input) }) };
    },
  };
  return policies;
};

describe('Trusted Types (E31 — CSP hardening)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    delete (window as unknown as { trustedTypes?: unknown }).trustedTypes;
  });

  describe('QR SVG validation', () => {
    it('accepts exactly what the QR generator draws', async () => {
      const { validateQrSvg } = await import('../../../../src/services/security/trustedTypes');
      const svg = generateQrSvg('otpauth://totp/GlassFolio:me@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GlassFolio', { margin: 4, bg: 'white', color: 'black' });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(validateQrSvg(svg)).toBe(svg);
      const transparent = generateQrSvg('x', { bg: 'transparent' });
      expect(validateQrSvg(transparent)).toBe(transparent);
    });

    it.each([
      ['a script element', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5" shape-rendering="crispEdges" width="100%" height="100%"><script>alert(1)</script></svg>'],
      ['an event handler', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5" shape-rendering="crispEdges" width="100%" height="100%" onload="alert(1)"><path d="M1,1h1v1h-1z" fill="black"/></svg>'],
      ['a foreign element', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5" shape-rendering="crispEdges" width="100%" height="100%"><foreignObject><div/></foreignObject></svg>'],
      ['a quote breaking out of an attribute', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5" shape-rendering="crispEdges" width="100%" height="100%"><path d="M1,1" onclick="x" fill="black"/></svg>'],
      ['plain html', '<img src=x onerror=alert(1)>'],
      ['an empty string', ''],
    ])('rejects %s', async (_label, markup) => {
      const { validateQrSvg } = await import('../../../../src/services/security/trustedTypes');
      expect(validateQrSvg(markup)).toBe('');
    });
  });

  describe('toTrustedQrHtml', () => {
    it('returns a validated string where Trusted Types do not exist', async () => {
      const { toTrustedQrHtml } = await import('../../../../src/services/security/trustedTypes');
      const svg = generateQrSvg('hello', { margin: 2, bg: 'white', color: 'black' });
      expect(toTrustedQrHtml(svg)).toBe(svg);
      expect(toTrustedQrHtml('<img src=x onerror=alert(1)>')).toBe('');
    });

    it('goes through the named policy where Trusted Types exist', async () => {
      const policies = installFactory();
      const { toTrustedQrHtml, QR_POLICY_NAME } = await import('../../../../src/services/security/trustedTypes');
      const svg = generateQrSvg('hello', { margin: 2, bg: 'white', color: 'black' });

      expect(toTrustedQrHtml(svg)).toEqual({ trusted: svg });
      expect(toTrustedQrHtml('<script>1</script>')).toEqual({ trusted: '' });
      expect([...policies.keys()]).toEqual([QR_POLICY_NAME]); // created once
    });
  });

  describe('default policy', () => {
    it('lets same-origin script URLs through and blocks the rest', async () => {
      const policies = installFactory();
      const { installTrustedTypesDefaultPolicy } = await import('../../../../src/services/security/trustedTypes');
      installTrustedTypesDefaultPolicy();

      const rules = policies.get('default') as Rules;
      expect(rules.createHTML).toBeUndefined(); // no HTML or eval escape hatch
      expect(rules.createScriptURL?.('/_vercel/insights/script.js')).toBe('/_vercel/insights/script.js');
      expect(rules.createScriptURL?.(`${window.location.origin}/assets/x.js`)).toBe(`${window.location.origin}/assets/x.js`);
      expect(rules.createScriptURL?.('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit')).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
      expect(() => rules.createScriptURL?.('https://challenges.cloudflare.com/malicious.js')).toThrow(/cross-origin/);
      expect(() => rules.createScriptURL?.('https://evil.example/x.js')).toThrow(/cross-origin/);
    });

    it('does nothing without Trusted Types', async () => {
      const { installTrustedTypesDefaultPolicy } = await import('../../../../src/services/security/trustedTypes');
      expect(() => installTrustedTypesDefaultPolicy()).not.toThrow();
    });
  });

  describe('CSP contract', () => {
    it('requires Trusted Types for scripts and allows only the registered policy names', () => {
      const csp = buildContentSecurityPolicy('cloud');
      expect(csp).toContain("require-trusted-types-for 'script'");
      expect(csp).toContain(`trusted-types ${TRUSTED_TYPES_POLICIES.join(' ')}`);
    });

    it('keeps the CSP policy list and the createPolicy calls in src/ identical', () => {
      const files: string[] = [];
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) walk(full);
          else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
        }
      };
      walk(join(process.cwd(), 'src'));
      const source = files.map((file) => readFileSync(file, 'utf-8')).join('\n');
      const created = [...source.matchAll(/createPolicy\(\s*(?:'([^']+)'|(QR_POLICY_NAME))/g)].map((m) => (m[2] ? 'glassfolio-qr' : m[1]));
      expect([...new Set(created)].sort()).toEqual([...TRUSTED_TYPES_POLICIES].sort());
    });
  });
});
