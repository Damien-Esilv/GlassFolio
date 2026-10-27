import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    expectedHeadersFromVercelConfig,
    evaluateSmokeResponse,
    DEFAULT_SMOKE_HOSTS,
} from '../../../scripts/lib/smokeChecks.mjs';

const vercelConfig = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));

describe('Production smoke checks (Epic E19 — TGLA-132)', () => {
    const expected = expectedHeadersFromVercelConfig(vercelConfig) as Record<string, string>;

    it('derives the security headers from vercel.json, keyed by lower-cased name', () => {
        expect(expected['strict-transport-security']).toBe('max-age=63072000; includeSubDomains');
        expect(expected['x-content-type-options']).toBe('nosniff');
        expect(expected['x-frame-options']).toBe('DENY');
        expect(expected['content-security-policy']).toContain("script-src 'self'");
        expect(Object.keys(expected).length).toBeGreaterThanOrEqual(5);
    });

    it('ignores rules that are not the catch-all source', () => {
        const result = expectedHeadersFromVercelConfig({
            headers: [{ source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'x' }] }],
        });
        expect(result).toEqual({});
    });

    it('targets both production domains by default', () => {
        expect(DEFAULT_SMOKE_HOSTS).toEqual(['https://glassfolio.dev', 'https://app.glassfolio.dev']);
    });

    it('passes a healthy HTML response that carries every expected header', () => {
        const failures = evaluateSmokeResponse(
            { path: '/', status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...expected } },
            expected,
        ) as string[];
        expect(failures).toEqual([]);
    });

    it('reports a non-200 status, a non-HTML body and a missing or altered header', () => {
        const headers = { ...expected, 'content-type': 'application/json' } as Record<string, string>;
        delete headers['x-frame-options'];
        headers['strict-transport-security'] = 'max-age=0';
        const failures = evaluateSmokeResponse({ path: '/x', status: 502, headers }, expected) as string[];
        expect(failures).toHaveLength(4);
        expect(failures.join('\n')).toContain('expected HTTP 200, got 502');
        expect(failures.join('\n')).toContain('expected an HTML document');
        expect(failures.join('\n')).toContain('"x-frame-options" expected "DENY", got "missing"');
        expect(failures.join('\n')).toContain('"strict-transport-security" expected "max-age=63072000; includeSubDomains", got "max-age=0"');
    });
});
