/**
 * Tests — priceService.ts
 * ALL network calls are mocked — no real fetch.
 * Covers: refreshPositionPrices (cache miss, cache hit, network error),
 *         clearPriceCache, getLastPriceFetchTime
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Position } from '../../../src/types';

// ── Mock fetch before importing the service ───────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  refreshPositionPrices,
  clearPriceCache,
  getLastPriceFetchTime,
  getManualPriceHistory,
  saveManualPrice,
} from '../../../src/services/priceService';
import {
  MANUAL_PRICE_HISTORY_KEY,
  LEGACY_MANUAL_PRICE_HISTORY_KEY,
} from '../../../src/services/storage/storageKeys';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const makePosition = (overrides: Partial<Position> = {}): Position => ({
  id: 'pos-1',
  instrument: 'Apple Inc',
  symbol: 'AAPL',
  quantity: 10,
  avgCost: 150,
  lastPrice: 150,
  marketValue: 1500,
  unrealizedPL: 0,
  unrealizedPLPercent: 0,
  currency: 'USD',
  type: 'Equity',
  source: 'TestBroker',
  ...overrides,
});

const makeYahooResponse = (symbol: string, price: number) => ({
  [symbol]: {
    close: [price],
    timestamp: [Math.floor(Date.now() / 1000)],
  },
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('priceService.clearPriceCache', () => {
  it('removes the gf_price_cache key from localStorage', () => {
    localStorage.setItem('gf_price_cache', JSON.stringify({ test: true }));
    clearPriceCache();
    expect(localStorage.getItem('gf_price_cache')).toBeNull();
  });

  it('does not throw when cache is already empty', () => {
    expect(() => clearPriceCache()).not.toThrow();
  });
});

describe('priceService.getLastPriceFetchTime', () => {
  it('returns null when no cache exists', () => {
    expect(getLastPriceFetchTime()).toBeNull();
  });

  it('returns ISO timestamp string when cache exists', () => {
    const now = new Date().toISOString();
    localStorage.setItem('gf_price_cache', JSON.stringify({
      fetchedAt: now,
      prices: {},
    }));
    expect(getLastPriceFetchTime()).toBe(now);
  });

  it('returns null when cache is malformed JSON', () => {
    localStorage.setItem('gf_price_cache', 'not-valid-json');
    expect(getLastPriceFetchTime()).toBeNull();
  });
});

const clearCacheOnly = () => localStorage.removeItem('gf_price_cache');

describe('priceService.refreshPositionPrices', () => {
  beforeEach(() => {
    clearPriceCache();
    mockFetch.mockReset();
  });

  it('returns original positions unchanged when fetch fails (graceful fallback)', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const positions = [makePosition({ symbol: 'AAPL' })];
    const result = await refreshPositionPrices(positions);
    // Must return positions without throwing
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('AAPL');
  });

  it('returns original positions unchanged on HTTP error (graceful fallback)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const positions = [makePosition()];
    const result = await refreshPositionPrices(positions);
    expect(result).toHaveLength(1);
  });

  it('returns original positions unchanged on malformed API response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ spark: null }),
    });
    const positions = [makePosition()];
    const result = await refreshPositionPrices(positions);
    expect(result).toHaveLength(1);
  });

  it('skips Cash positions (does not try to fetch price)', async () => {
    // Cash positions should be returned as-is without hitting the network
    const positions = [makePosition({ type: 'Cash', symbol: 'EUR' })];
    const result = await refreshPositionPrices(positions);
    // fetch should not have been called for cash
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('never queries a price tracker for "Other" assets: the price is the latest one entered by hand', async () => {
    saveManualPrice('ARTWORK', 11000);
    saveManualPrice('ARTWORK', 12500);
    // even once the 15-minute price cache is gone, the hand-entered price stays
    clearCacheOnly();
    const positions = [makePosition({ type: 'Other', symbol: 'ARTWORK', quantity: 2, avgCost: 10000, lastPrice: 10000, marketValue: 20000 })];

    const result = await refreshPositionPrices(positions);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result[0].lastPrice).toBe(12500);
    expect(result[0].marketValue).toBe(25000);
    expect(result[0].unrealizedPL).toBe(5000);
  });

  it('leaves an "Other" asset without a manual price untouched and offline', async () => {
    const positions = [makePosition({ type: 'Other', symbol: 'WINE', lastPrice: 0, marketValue: 0 })];
    const result = await refreshPositionPrices(positions);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result[0].lastPrice).toBe(0);
  });

  it('uses cached prices when cache is valid (< 15 min old)', async () => {
    // Seed a fresh cache using the real PriceCache structure
    const cachedPrice = 200;
    const cache = {
      data: { AAPL: cachedPrice },
      fetchedAt: new Date().toISOString(), // fresh
    };
    localStorage.setItem('gf_price_cache', JSON.stringify(cache));

    // Mock fetch to return a dummy value — it should NOT be called
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ chart: { result: [] } }) });

    const positions = [makePosition({ symbol: 'AAPL', lastPrice: 150 })];
    const result = await refreshPositionPrices(positions);

    // Should not call fetch (cache is valid)
    expect(mockFetch).not.toHaveBeenCalled();
    // Position should reflect cached price
    expect(result[0].lastPrice).toBe(cachedPrice);
  });

  it('updates lastPrice, marketValue from API when cache is stale (> 15 min)', async () => {
    // No cache (clearPriceCache was called in beforeEach)
    const newPrice = 175;
    // Service calls /yf/v8/finance/chart/{ticker}?interval=1d&range=1d
    // Response shape: { chart: { result: [{ meta: { regularMarketPrice: price } }] } }
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{ meta: { regularMarketPrice: newPrice, chartPreviousClose: newPrice } }]
        }
      }),
    });

    const positions = [makePosition({ symbol: 'AAPL', quantity: 10 })];
    const result = await refreshPositionPrices(positions);

    // fetch was called
    expect(mockFetch).toHaveBeenCalled();
    // Price should be updated
    expect(result[0].lastPrice).toBe(newPrice);
    expect(result[0].marketValue).toBeCloseTo(newPrice * 10);
  });

  it('handles empty positions array without fetching', async () => {
    const result = await refreshPositionPrices([]);
    expect(result).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not mutate the original positions array', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const original = [makePosition({ lastPrice: 150 })];
    const originalRef = original[0];
    await refreshPositionPrices(original);
    // Original object reference should not have been mutated
    expect(original[0]).toBe(originalRef);
  });
});

describe('priceService manual price encryption & migration (Finding #8)', () => {
  beforeEach(() => {
    localStorage.removeItem(MANUAL_PRICE_HISTORY_KEY);
    localStorage.removeItem(LEGACY_MANUAL_PRICE_HISTORY_KEY);
  });

  it('stores manual prices under the encrypted glassfolio_manual_price_history key', () => {
    saveManualPrice('TEST.PA', 123.45);
    const history = getManualPriceHistory('TEST.PA');
    expect(history).toHaveLength(1);
    expect(history[0].price).toBe(123.45);
    expect(localStorage.getItem(MANUAL_PRICE_HISTORY_KEY)).toBeTruthy();
  });

  it('transparently migrates legacy gf_manual_price_history into glassfolio_manual_price_history and deletes plaintext', () => {
    const legacyData = { 'AIR.PA': [{ date: '2026-01-01T00:00:00.000Z', price: 140 }] };
    localStorage.setItem(LEGACY_MANUAL_PRICE_HISTORY_KEY, JSON.stringify(legacyData));

    const history = getManualPriceHistory('AIR.PA');
    expect(history).toHaveLength(1);
    expect(history[0].price).toBe(140);

    // Legacy plaintext key was purged from storage
    expect(localStorage.getItem(LEGACY_MANUAL_PRICE_HISTORY_KEY)).toBeNull();
    // New key holds the data
    expect(localStorage.getItem(MANUAL_PRICE_HISTORY_KEY)).toBeTruthy();
  });

  it('clearPriceCache purges both modern and legacy manual price keys', () => {
    localStorage.setItem(MANUAL_PRICE_HISTORY_KEY, '{"X":[]}');
    localStorage.setItem(LEGACY_MANUAL_PRICE_HISTORY_KEY, '{"Y":[]}');
    clearPriceCache();
    expect(localStorage.getItem(MANUAL_PRICE_HISTORY_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_MANUAL_PRICE_HISTORY_KEY)).toBeNull();
  });
});
