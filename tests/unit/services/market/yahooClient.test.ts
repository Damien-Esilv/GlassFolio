/**
 * Yahoo from the hosted app (TGLA-235): Yahoo sends no CORS header, so the hosted app asks it through
 * the connector relay; local builds keep their same-origin proxy.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const proxy = vi.hoisted(() => ({ enabled: false }));
const relay = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('../../../../src/config/marketData', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../../src/config/marketData')>();
    return { ...actual, usesYahooProxy: () => proxy.enabled };
});
vi.mock('../../../../src/services/connectors/relayClient', () => ({ relayFetch: relay.fetch }));

import { fetchYahoo } from '../../../../src/services/market/yahooClient';
import { ConnectorError } from '../../../../src/services/connectors/types';

const CHART = '/v8/finance/chart/CW8.PA';

describe('fetchYahoo', () => {
    beforeEach(() => {
        relay.fetch.mockReset();
        proxy.enabled = false;
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('goes through the relay in the hosted app', async () => {
        relay.fetch.mockResolvedValue(new Response('{"ok":1}', { status: 200 }));
        const direct = vi.fn();
        vi.stubGlobal('fetch', direct);

        const response = await fetchYahoo(CHART, 'interval=1d&range=1d', 5000);

        expect(await response?.json()).toEqual({ ok: 1 });
        expect(relay.fetch).toHaveBeenCalledWith({ provider: 'yahoo', method: 'GET', path: CHART, query: 'interval=1d&range=1d' });
        expect(direct).not.toHaveBeenCalled();
    });

    it('tries the direct call only when the relay is unavailable (no session)', async () => {
        relay.fetch.mockRejectedValue(new ConnectorError('relay_unavailable'));
        const direct = vi.fn(async (_url: string) => new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', direct);

        expect((await fetchYahoo(CHART, 'range=1d', 5000))?.status).toBe(200);
        expect(String(direct.mock.calls[0][0])).toContain(`${CHART}?range=1d`);
    });

    it('a refusal from Yahoo (unknown ticker) is final', async () => {
        relay.fetch.mockRejectedValue(new ConnectorError('invalid_response'));
        const direct = vi.fn();
        vi.stubGlobal('fetch', direct);

        expect(await fetchYahoo(CHART, 'range=1d', 5000)).toBeNull();
        expect(direct).not.toHaveBeenCalled();
    });

    it('local builds keep the same-origin proxy and never call the relay', async () => {
        proxy.enabled = true;
        const direct = vi.fn(async (_url: string) => new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', direct);

        await fetchYahoo(CHART, 'range=1d', 5000);
        expect(String(direct.mock.calls[0][0])).toBe(`/yf${CHART}?range=1d`);
        expect(relay.fetch).not.toHaveBeenCalled();
    });
});
