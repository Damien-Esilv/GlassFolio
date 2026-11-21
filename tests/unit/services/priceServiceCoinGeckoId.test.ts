/**
 * Crypto prices by CoinGecko id (TGLA-221): a token whose instrument carries its CoinGecko id is
 * priced by that id first, so a Yahoo ticker shared by another coin cannot hijack its value.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Instrument, Position } from '../../../src/types';
import { refreshPositionPrices, clearPriceCache } from '../../../src/services/priceService';
import { db } from '../../../src/services/db';

const position = (overrides: Partial<Position>): Position => ({
  id: 'pos-arb',
  instrument: 'Arbitrum',
  symbol: 'ARB',
  quantity: 100,
  avgCost: 0.5,
  lastPrice: 0.5,
  marketValue: 50,
  unrealizedPL: 0,
  unrealizedPLPercent: 0,
  allocation: 100,
  currency: 'USD',
  type: 'Crypto',
  ...overrides,
} as Position);

describe('crypto prices by CoinGecko id', () => {
  beforeEach(() => {
    clearPriceCache();
    db.saveInstruments([{
      id: 'instr-arb', ownerId: 'u', name: 'Arbitrum', type: 'crypto', isMarketReady: true, denominationCurrency: 'USD',
      marketIdentifier: { symbol: 'ARB', network: 'arbitrum', coingeckoId: 'arbitrum' },
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    } as Instrument]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks CoinGecko by id before Yahoo', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('api.coingecko.com')
        ? new Response(JSON.stringify({ arbitrum: { usd: 0.8 } }), { status: 200 })
        : new Response('{}', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const [priced] = await refreshPositionPrices([position({ instrumentId: 'instr-arb' })]);

    expect(priced.lastPrice).toBeCloseTo(0.8);
    expect(String(fetchMock.mock.calls[0][0])).toContain('ids=arbitrum');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('finance'))).toBe(false);
  });

  it('falls back to Yahoo when CoinGecko has no price', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('api.coingecko.com')
        ? new Response('{}', { status: 429 })
        : new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 0.75, currency: 'USD' } }] } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const [priced] = await refreshPositionPrices([position({ instrumentId: 'instr-arb' })]);
    expect(priced.lastPrice).toBeCloseTo(0.75);
  });
});
