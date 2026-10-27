import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    extractProjectRef,
    buildTurnstileConfigPayload,
    runDeployTurnstile,
} from '../../../scripts/deploy-turnstile-config.mjs';

describe('deploy-turnstile-config script (Epic E22)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('extracts project reference correctly from Supabase URLs', () => {
        expect(extractProjectRef('https://xyzcompany.supabase.co')).toBe('xyzcompany');
        expect(extractProjectRef('https://abcdefghijklmno.supabase.in')).toBe('abcdefghijklmno');
        expect(extractProjectRef('invalid-url')).toBe(null);
        expect(extractProjectRef('')).toBe(null);
    });

    it('builds valid Turnstile auth config payload', () => {
        const payload = buildTurnstileConfigPayload('0x4AAAAAASecretKey');
        expect(payload).toEqual({
            security_captcha_enabled: true,
            security_captcha_provider: 'turnstile',
            security_captcha_secret: '0x4AAAAAASecretKey',
        });
    });

    it('returns missing_supabase_credentials error when token or url are missing', async () => {
        const res = await runDeployTurnstile({
            env: {
                SUPABASE_ACCESS_TOKEN: '',
                VITE_SUPABASE_URL: '',
            },
        });
        expect(res.success).toBe(false);
        expect(res.reason).toBe('missing_supabase_credentials');
    });

    it('performs dry-run diff against live configuration without PATCHing', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                security_captcha_enabled: false,
                security_captcha_provider: null,
            }),
        });
        global.fetch = fetchMock;

        const res = await runDeployTurnstile({
            apply: false,
            env: {
                SUPABASE_ACCESS_TOKEN: 'sbp_mock_token',
                VITE_SUPABASE_URL: 'https://testproj.supabase.co',
                TURNSTILE_SECRET_KEY: '0x4AAAAAASecretKey',
            },
        });

        expect(res.success).toBe(true);
        expect(res.changed).toBe(true);
        expect(res.applied).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1); // Only GET, no PATCH
    });

    it('PATCHes live configuration when --apply is specified', async () => {
        const fetchMock = vi.fn()
            // 1. GET current config
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    security_captcha_enabled: false,
                    security_captcha_provider: null,
                }),
            })
            // 2. PATCH updated config
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    security_captcha_enabled: true,
                    security_captcha_provider: 'turnstile',
                }),
            });
        global.fetch = fetchMock;

        const res = await runDeployTurnstile({
            apply: true,
            env: {
                SUPABASE_ACCESS_TOKEN: 'sbp_mock_token',
                VITE_SUPABASE_URL: 'https://testproj.supabase.co',
                TURNSTILE_SECRET_KEY: '0x4AAAAAASecretKey',
            },
        });

        expect(res.success).toBe(true);
        expect(res.applied).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][1].method).toBe('PATCH');
    });
});
