/**
 * Tests — currencyService.ts
 * ALL network calls are mocked — no real fetch.
 * Covers: getFallbackExchangeRate, getExchangeRate (cache hit, cache miss, API error),
 *         getExchangeRates (batch), convertAmount (with rates, with fallback)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock fetch before importing the service ───────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  getFallbackExchangeRate,
  currencyService,
} from '../../../src/services/currencyService';

const FX_CACHE_KEY = 'gf_fx_rates_cache';

function seedFreshCache(pairs: Record<string, number>) {
  localStorage.setItem(FX_CACHE_KEY, JSON.stringify({
    data: pairs,
    fetchedAt: new Date().toISOString(),
  }));
}

function seedStaleCache(pairs: Record<string, number>) {
  const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min ago
  localStorage.setItem(FX_CACHE_KEY, JSON.stringify({
    data: pairs,
    fetchedAt: stale,
  }));
}

function yahooFxResponse(price: number) {
  return {
    ok: true,
    json: async () => ({
      chart: {
        result: [{ meta: { regularMarketPrice: price } }],
      },
    }),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// getFallbackExchangeRate
// ══════════════════════════════════════════════════════════════════════════════
describe('getFallbackExchangeRate', () => {
  it('returns 1.0 for same currency', () => {
    expect(getFallbackExchangeRate('EUR', 'EUR')).toBe(1.0);
  });

  it('returns 1.0 for same currency with different case', () => {
    expect(getFallbackExchangeRate('eur', 'EUR')).toBe(1.0);
  });

  it('returns rate > 0 for EUR → USD', () => {
    const rate = getFallbackExchangeRate('EUR', 'USD');
    expect(rate).toBeGreaterThan(0);
  });

  it('returns rate > 0 for USD → EUR', () => {
    const rate = getFallbackExchangeRate('USD', 'EUR');
    expect(rate).toBeGreaterThan(0);
  });

  it('EUR → USD and USD → EUR are reciprocals (±1%)', () => {
    const eurToUsd = getFallbackExchangeRate('EUR', 'USD');
    const usdToEur = getFallbackExchangeRate('USD', 'EUR');
    expect(eurToUsd * usdToEur).toBeCloseTo(1.0, 1);
  });

  it('returns a positive rate for USD → JPY', () => {
    expect(getFallbackExchangeRate('USD', 'JPY')).toBeGreaterThan(1);
  });

  it('returns 1.0 for unknown currency (safe fallback)', () => {
    expect(getFallbackExchangeRate('XXX', 'USD')).toBe(1.0);
  });

  it('never returns 0 or negative', () => {
    const pairs = ['EUR_USD', 'USD_GBP', 'GBP_JPY', 'CHF_EUR'];
    for (const pair of pairs) {
      const [from, to] = pair.split('_');
      expect(getFallbackExchangeRate(from, to)).toBeGreaterThan(0);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// currencyService.getExchangeRate
// ══════════════════════════════════════════════════════════════════════════════
describe('currencyService.getExchangeRate', () => {
  beforeEach(() => {
    localStorage.removeItem(FX_CACHE_KEY);
    mockFetch.mockReset();
  });

  it('returns 1.0 when fromCurrency equals toCurrency', async () => {
    expect(await currencyService.getExchangeRate('EUR', 'EUR')).toBe(1.0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns cached rate when cache is fresh', async () => {
    seedFreshCache({ 'EUR_USD': 1.08 });
    const rate = await currencyService.getExchangeRate('EUR', 'USD');
    expect(rate).toBe(1.08);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches from Yahoo when cache is stale', async () => {
    seedStaleCache({ 'EUR_USD': 1.0 });
    mockFetch.mockResolvedValue(yahooFxResponse(1.12));
    const rate = await currencyService.getExchangeRate('EUR', 'USD');
    expect(mockFetch).toHaveBeenCalled();
    expect(rate).toBeCloseTo(1.12);
  });

  it('falls back to static rate when API fails (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const rate = await currencyService.getExchangeRate('EUR', 'USD');
    expect(rate).toBeGreaterThan(0);
    expect(rate).not.toBeNaN();
  });

  it('falls back to static rate when API returns non-ok status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const rate = await currencyService.getExchangeRate('EUR', 'USD');
    expect(rate).toBeGreaterThan(0);
  });

  it('falls back to static rate when API returns malformed response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ chart: null }),
    });
    const rate = await currencyService.getExchangeRate('EUR', 'USD');
    expect(rate).toBeGreaterThan(0);
  });

  it('caches the fetched rate for subsequent calls', async () => {
    mockFetch.mockResolvedValue(yahooFxResponse(1.09));
    await currencyService.getExchangeRate('EUR', 'USD');
    mockFetch.mockReset();
    // Second call should use cache
    const rate2 = await currencyService.getExchangeRate('EUR', 'USD');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(rate2).toBeCloseTo(1.09);
  });

  it('normalizes lowercase currency codes', async () => {
    seedFreshCache({ 'EUR_USD': 1.08 });
    const rate = await currencyService.getExchangeRate('eur', 'usd');
    expect(rate).toBe(1.08);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// currencyService.getExchangeRates (batch)
// ══════════════════════════════════════════════════════════════════════════════
describe('currencyService.getExchangeRates', () => {
  beforeEach(() => {
    localStorage.removeItem(FX_CACHE_KEY);
    mockFetch.mockReset().mockResolvedValue(yahooFxResponse(1.0));
  });

  it('returns a record with one entry per unique source currency', async () => {
    seedFreshCache({ 'EUR_USD': 1.08, 'GBP_USD': 1.27 });
    const rates = await currencyService.getExchangeRates(['EUR', 'GBP'], 'USD');
    expect(rates).toHaveProperty('EUR');
    expect(rates).toHaveProperty('GBP');
  });

  it('deduplicates source currencies', async () => {
    seedFreshCache({ 'EUR_USD': 1.08 });
    const rates = await currencyService.getExchangeRates(['EUR', 'EUR', 'EUR'], 'USD');
    expect(Object.keys(rates)).toHaveLength(1);
  });

  it('returns 1.0 for the target currency itself', async () => {
    const rates = await currencyService.getExchangeRates(['EUR', 'USD'], 'USD');
    expect(rates['USD']).toBe(1.0);
  });

  it('handles empty array gracefully', async () => {
    const rates = await currencyService.getExchangeRates([], 'USD');
    expect(rates).toEqual({});
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// currencyService.convertAmount
// ══════════════════════════════════════════════════════════════════════════════
describe('currencyService.convertAmount', () => {
  it('returns amount unchanged when fromCurrency equals toCurrency', () => {
    expect(currencyService.convertAmount(1000, 'EUR', 'EUR')).toBe(1000);
  });

  it('returns 0 unchanged regardless of currencies', () => {
    expect(currencyService.convertAmount(0, 'USD', 'EUR')).toBe(0);
  });

  it('converts using provided rates table', () => {
    const rates = { 'USD': 0.92 }; // 1 USD = 0.92 EUR
    const result = currencyService.convertAmount(100, 'USD', 'EUR', rates);
    expect(result).toBeCloseTo(92);
  });

  it('uses static fallback when rates not provided', () => {
    const result = currencyService.convertAmount(100, 'EUR', 'USD');
    expect(result).toBeGreaterThan(0);
    expect(result).not.toBeNaN();
  });

  it('uses static fallback when currency not in rates table', () => {
    const rates = { 'GBP': 1.27 };
    const result = currencyService.convertAmount(100, 'EUR', 'USD', rates);
    // EUR not in rates, should fall back to static
    expect(result).toBeGreaterThan(0);
  });

  it('handles very large amounts', () => {
    const rates = { 'USD': 0.92 };
    const result = currencyService.convertAmount(1_000_000_000, 'USD', 'EUR', rates);
    expect(result).toBeCloseTo(920_000_000);
  });

  it('handles negative amounts (outflows)', () => {
    const rates = { 'USD': 0.92 };
    const result = currencyService.convertAmount(-500, 'USD', 'EUR', rates);
    expect(result).toBeCloseTo(-460);
  });

  it('normalizes currency codes', () => {
    const rates = { 'USD': 0.92 };
    const lower = currencyService.convertAmount(100, 'usd', 'eur', rates);
    const upper = currencyService.convertAmount(100, 'USD', 'EUR', rates);
    expect(lower).toBeCloseTo(upper);
  });
});
