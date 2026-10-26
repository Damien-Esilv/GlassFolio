import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const jsonResponse = (body: unknown): Response =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('bootstrapLocalPersistence (E33 — TGLA-139)', () => {
    beforeEach(() => {
        vi.resetModules();
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    const load = async () => import('../../../../src/services/storage/localPersistenceBootstrap');

    it('is a no-op in cloud mode', async () => {
        vi.stubEnv('VITE_DEPLOYMENT_MODE', 'cloud');
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const { bootstrapLocalPersistence } = await load();
        await expect(bootstrapLocalPersistence()).resolves.toEqual({ status: 'ready', mode: 'cloud' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('loads the server snapshot into the app storage before the app starts', async () => {
        vi.stubEnv('VITE_DEPLOYMENT_MODE', 'local');
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ revision: 3, records: { gf_vault_header: '{"version":1}', glassfolio_user: 'cipher' } })));
        const { bootstrapLocalPersistence } = await load();
        await expect(bootstrapLocalPersistence()).resolves.toEqual({ status: 'ready', mode: 'server' });

        const { appStorage } = await import('../../../../src/services/storage/appStorage');
        expect(appStorage.isVaultInitialized()).toBe(true);
        expect(appStorage.getBacking().getItem('glassfolio_user')).toBe('cipher');
    });

    it('falls back to browser storage when there is no vault API', async () => {
        vi.stubEnv('VITE_DEPLOYMENT_MODE', 'local');
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
        const { bootstrapLocalPersistence } = await load();
        await expect(bootstrapLocalPersistence()).resolves.toEqual({ status: 'ready', mode: 'browser' });
    });

    it('fails (instead of guessing) when the server errors', async () => {
        vi.stubEnv('VITE_DEPLOYMENT_MODE', 'local');
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
        const { bootstrapLocalPersistence } = await load();
        await expect(bootstrapLocalPersistence()).resolves.toEqual({ status: 'failed', message: 'HTTP 500' });
    });
});
