/**
 * Prices when the market source refuses (TGLA-242): Yahoo's 429 pauses every Yahoo call for a while; a
 * bank's own quote keeps the position's value; the market fetch time is only set by a real market price;
 * the refresh button never empties the fallbacks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Position } from '../../../../src/types';
import {
    clearPriceCache,
    expirePriceCache,
    getLastPriceFetchTime,
    getPriceSourceStatus,
    recordProviderQuotes,
    refreshPositionPrices,
} from '../../../../src/services/priceService';
import { fetchYahoo, resetYahooPause, yahooPausedUntil } from '../../../../src/services/market/yahooClient';
import { isEtfName, recordBankQuotes, toNormalizedHolding } from '../../../../src/services/connectors/sources/woob';

const etf = (overrides: Partial<Position> = {}): Position => ({
    id: 'pos-wpea', instrument: 'ISHARES MSCI WORLD SWAP PEA UCITS ETF', symbol: 'WPEA.PA', isin: 'IE0002XZSHO1',
    quantity: 234, avgCost: 5.8, lastPrice: 5.8, marketValue: 1357.2, unrealizedPL: 0, unrealizedPLPercent: 0,
    allocation: 100, currency: 'EUR', type: 'ETF', ...overrides,
} as Position);

const tooMany = () => vi.fn(async () => new Response('Too Many Requests', { status: 429 }));
const quote = (price: number) => vi.fn(async () =>
    new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: price, currency: 'EUR' } }] } }), { status: 200 }));

beforeEach(() => {
    resetYahooPause();
    clearPriceCache();
});
afterEach(() => vi.unstubAllGlobals());

describe('Yahoo rate limit', () => {
    it('pauses every Yahoo call for 10 minutes after a 429', async () => {
        const fetchMock = tooMany();
        vi.stubGlobal('fetch', fetchMock);
        expect((await fetchYahoo('/v8/finance/chart/WPEA.PA', 'range=1d', 1_000))?.status).toBe(429);
        expect(yahooPausedUntil() - Date.now()).toBeGreaterThan(9 * 60 * 1000);
        expect(await fetchYahoo('/v8/finance/chart/CW8.PA', 'range=1d', 1_000)).toBeNull();
        expect(fetchMock).toHaveBeenCalledOnce();
    });
});

describe('bank quotes as the price fallback', () => {
    it('values a position at the bank quote when Yahoo refuses, without faking a market refresh', async () => {
        vi.stubGlobal('fetch', tooMany());
        recordProviderQuotes([{ key: 'IE0002XZSHO1', price: 6.32, currency: 'EUR' }]);
        expect(getLastPriceFetchTime()).toBeNull();

        const [priced] = await refreshPositionPrices([etf()]);
        expect(priced.lastPrice).toBeCloseTo(6.32);
        expect(priced.unrealizedPL).toBeCloseTo(234 * (6.32 - 5.8));
        expect(getPriceSourceStatus().providerQuotesUsed).toBe(true);
        expect(getLastPriceFetchTime()).toBeNull();
    });

    it('a market price wins over the bank quote', async () => {
        vi.stubGlobal('fetch', quote(6.5));
        recordProviderQuotes([{ key: 'IE0002XZSHO1', price: 6.32, currency: 'EUR' }]);
        const [priced] = await refreshPositionPrices([etf()]);
        expect(priced.lastPrice).toBeCloseTo(6.5);
        expect(getPriceSourceStatus().providerQuotesUsed).toBe(false);
        expect(getLastPriceFetchTime()).not.toBeNull();
    });

    it('the Woob source records the quote of each bank line, by ISIN', () => {
        recordBankQuotes([
            { kind: 'security', isin: 'IE0002XZSHO1', code: 'IE0002XZSHO1', symbol: null, name: 'ETF', quantity: '234', avgCost: '5.8', unitValue: '6.32', currency: 'EUR', marketValue: '1478.88' },
            { kind: 'cash', name: 'Liquidités', currency: 'EUR', quantity: '5.1', marketValue: '5.1' },
        ]);
        const cache = JSON.parse(localStorage.getItem('gf_price_cache') as string);
        expect(cache.providerQuotes.IE0002XZSHO1).toMatchObject({ price: 6.32, currency: 'EUR' });
        expect(Object.keys(cache.providerQuotes)).toEqual(['IE0002XZSHO1']);
    });
});

describe('refresh button', () => {
    it('asks every market price again but keeps the bank quotes and last known prices', async () => {
        vi.stubGlobal('fetch', quote(6.5));
        recordProviderQuotes([{ key: 'IE0002XZSHO1', price: 6.32, currency: 'EUR' }]);
        await refreshPositionPrices([etf()]);

        expirePriceCache();
        expect(getLastPriceFetchTime()).toBeNull();
        const cache = JSON.parse(localStorage.getItem('gf_price_cache') as string);
        expect(cache.data).toEqual({});
        expect(cache.lastKnown['WPEA.PA']).toBeCloseTo(6.5);
        expect(cache.providerQuotes.IE0002XZSHO1.price).toBeCloseTo(6.32);

        // Yahoo refuses the refresh: a fallback price stays, never 0
        vi.stubGlobal('fetch', tooMany());
        const [priced] = await refreshPositionPrices([etf()]);
        expect(priced.lastPrice).toBeGreaterThan(6);
    });
});

describe('ETF detection from the bank label', () => {
    it('tags ETFs, leaves the rest to the classifier', () => {
        expect(isEtfName('ISHARES MSCI WORLD SWAP PEA UCITS ETF EUR (ACC)')).toBe(true);
        expect(isEtfName('AMUNDI PEA NASDAQ-100 UCITS ETF ACC')).toBe(true);
        expect(isEtfName('RENAULT')).toBe(false);
        expect(isEtfName('BETTER WORLD SA')).toBe(false);
        const holding = { kind: 'security', isin: 'FR0000131906', code: 'FR0000131906', symbol: null, name: 'RENAULT', quantity: '2', avgCost: '50', unitValue: '54', currency: 'EUR', marketValue: '108' } as const;
        expect(toNormalizedHolding(holding, 'pea')?.instrumentType).toBeUndefined();
        expect(toNormalizedHolding({ ...holding, name: 'AMUNDI CAC 40 UCITS ETF ACC' }, 'pea')?.instrumentType).toBe('etf');
    });
});
