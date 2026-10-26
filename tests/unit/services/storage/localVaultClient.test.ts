import { describe, it, expect, vi } from 'vitest';
import {
    commitBatch,
    fetchSnapshot,
    splitBatchForKeepalive,
} from '../../../../src/services/storage/localVaultClient';

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
    new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
        ...init,
    });

describe('localVaultClient (E33 — TGLA-139)', () => {
    describe('fetchSnapshot', () => {
        it('returns the snapshot of a healthy server', async () => {
            const fetchImpl = vi.fn(async () => jsonResponse({ revision: 4, records: { glassfolio_user: 'c' } }));
            const outcome = await fetchSnapshot(fetchImpl as unknown as typeof fetch);
            expect(outcome).toEqual({ status: 'ok', snapshot: { revision: 4, records: { glassfolio_user: 'c' } } });
            expect(fetchImpl).toHaveBeenCalledWith('/api/local-vault', expect.objectContaining({ cache: 'no-store' }));
        });

        it('treats a missing route and an SPA HTML fallback as "unavailable"', async () => {
            const notFound = vi.fn(async () => new Response('nope', { status: 404 }));
            expect(await fetchSnapshot(notFound as unknown as typeof fetch)).toEqual({ status: 'unavailable' });

            const spaFallback = vi.fn(async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
            expect(await fetchSnapshot(spaFallback as unknown as typeof fetch)).toEqual({ status: 'unavailable' });
        });

        it('reports server and network failures as errors, never as "unavailable"', async () => {
            const serverError = vi.fn(async () => new Response('boom', { status: 500 }));
            expect(await fetchSnapshot(serverError as unknown as typeof fetch)).toEqual({ status: 'error', message: 'HTTP 500' });

            const forbidden = vi.fn(async () => new Response('no', { status: 403 }));
            expect(await fetchSnapshot(forbidden as unknown as typeof fetch)).toEqual({ status: 'error', message: 'HTTP 403' });

            const offline = vi.fn(async () => {
                throw new TypeError('Failed to fetch');
            });
            expect(await fetchSnapshot(offline as unknown as typeof fetch)).toEqual({ status: 'error', message: 'Failed to fetch' });
        });

        it('rejects malformed snapshots', async () => {
            for (const body of [{ records: 'x' }, { records: { a: 1 } }, { records: [] }]) {
                const fetchImpl = vi.fn(async () => jsonResponse(body));
                expect(await fetchSnapshot(fetchImpl as unknown as typeof fetch)).toMatchObject({ status: 'error' });
            }
            const notJson = vi.fn(async () => new Response('{bad', { status: 200, headers: { 'content-type': 'application/json' } }));
            expect(await fetchSnapshot(notJson as unknown as typeof fetch)).toMatchObject({ status: 'error' });
        });
    });

    describe('commitBatch', () => {
        it('posts the batch as JSON and reports success', async () => {
            const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, revision: 2 }));
            const ok = await commitBatch({ set: { glassfolio_a: 'x' }, remove: ['glassfolio_b'] }, { fetchImpl: fetchImpl as unknown as typeof fetch, keepalive: true });
            expect(ok).toBe(true);
            const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
            expect(url).toBe('/api/local-vault/batch');
            expect(init.method).toBe('POST');
            expect(init.keepalive).toBe(true);
            expect(JSON.parse(init.body as string)).toEqual({ set: { glassfolio_a: 'x' }, remove: ['glassfolio_b'] });
        });

        it('resolves false on HTTP errors and network failures', async () => {
            const rejected = vi.fn(async () => new Response('x', { status: 400 }));
            expect(await commitBatch({ clear: true }, { fetchImpl: rejected as unknown as typeof fetch })).toBe(false);
            const offline = vi.fn(async () => {
                throw new TypeError('offline');
            });
            expect(await commitBatch({ clear: true }, { fetchImpl: offline as unknown as typeof fetch })).toBe(false);
        });
    });

    describe('splitBatchForKeepalive', () => {
        it('keeps a small batch in one part', () => {
            expect(splitBatchForKeepalive({ clear: true, remove: ['glassfolio_x'], set: { glassfolio_a: '1' } })).toEqual([
                { clear: true, remove: ['glassfolio_x'], set: { glassfolio_a: '1' } },
            ]);
        });

        it('splits by size and applies clear only to the first part', () => {
            const big = 'x'.repeat(40);
            const parts = splitBatchForKeepalive({ clear: true, set: { glassfolio_a: big, glassfolio_b: big, glassfolio_c: big } }, 100);
            expect(parts.length).toBeGreaterThan(1);
            expect(parts[0].clear).toBe(true);
            expect(parts.slice(1).every((part) => part.clear === undefined)).toBe(true);
            const merged = Object.assign({}, ...parts.map((part) => part.set ?? {}));
            expect(Object.keys(merged).sort()).toEqual(['glassfolio_a', 'glassfolio_b', 'glassfolio_c']);
        });

        it('returns no parts for an empty batch', () => {
            expect(splitBatchForKeepalive({})).toEqual([]);
        });
    });
});
