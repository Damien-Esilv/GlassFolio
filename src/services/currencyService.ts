/**
 * currencyService.ts
 * 
 * Robust currency exchange rate service fetching live FX rates from Yahoo Finance.
 * 
 * Features:
 * - Direct pair fetch (e.g. USDEUR=X, EURUSD=X, GBPUSD=X) via Yahoo Finance v8 Chart API
 * - Automatic inverse pair resolution if direct ticker fails
 * - Central fallback via SUPPORTED_CURRENCIES static rates
 * - 15-minute localStorage cache (key: 'gf_fx_rates_cache')
 * - Strictly typed & zero hardcoding
 */

import { yahooFinanceUrl } from '../config/marketData';
import { SUPPORTED_CURRENCIES } from '../utils/currency';
import { appStorage } from './storage/appStorage';

interface FxCache {
  data: Record<string, number>; // e.g. { 'USD_EUR': 0.92, 'EUR_USD': 1.08 }
  fetchedAt: string;            // ISO 8601 timestamp
}

const FX_CACHE_KEY = 'gf_fx_rates_cache';
const FX_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function readFxCache(): FxCache | null {
  try {
    const raw = appStorage.getItem(FX_CACHE_KEY);
    if (!raw) return null;
    const parsed: FxCache = JSON.parse(raw);
    const age = Date.now() - new Date(parsed.fetchedAt).getTime();
    if (age > FX_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeFxCache(data: Record<string, number>): void {
  try {
    const existing = readFxCache()?.data ?? {};
    const merged = { ...existing, ...data };
    const cache: FxCache = {
      data: merged,
      fetchedAt: new Date().toISOString()
    };
    appStorage.setItem(FX_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage limit or disabled
  }
}

/**
 * Fetch a single exchange rate ticker from Yahoo Finance v8 chart API.
 */
async function fetchYahooFxRate(ticker: string): Promise<number | null> {
  const base = yahooFinanceUrl(`/v8/finance/chart/${encodeURIComponent(ticker)}`);

  const url = `${base}?interval=1d&range=1d`;

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000) // 5s timeout
    });

    if (!response.ok) return null;

    const json = await response.json();
    const meta = json.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice ?? meta.chartPreviousClose;
    if (price !== undefined && price > 0) {
      return price;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get fallback exchange rate using USD bridge from SUPPORTED_CURRENCIES.
 */
export function getFallbackExchangeRate(fromCurr: string, toCurr: string): number {
  const fromClean = fromCurr.trim().toUpperCase();
  const toClean = toCurr.trim().toUpperCase();

  if (fromClean === toClean) return 1.0;

  const fromConfig = SUPPORTED_CURRENCIES.find(c => c.code === fromClean);
  const toConfig = SUPPORTED_CURRENCIES.find(c => c.code === toClean);

  const fromUsdRate = fromConfig ? fromConfig.defaultUsdRate : 1.0;
  const toUsdRate = toConfig ? toConfig.defaultUsdRate : 1.0;

  if (fromUsdRate === 0) return 1.0;
  return toUsdRate / fromUsdRate;
}

export const currencyService = {
  /**
   * Get rate to convert 1 unit of `fromCurrency` into `toCurrency`.
   */
  getExchangeRate: async (fromCurrency: string, toCurrency: string): Promise<number> => {
    const fromClean = fromCurrency.trim().toUpperCase();
    const toClean = toCurrency.trim().toUpperCase();

    if (fromClean === toClean) return 1.0;

    const pairKey = `${fromClean}_${toClean}`;
    const cache = readFxCache();

    if (cache?.data?.[pairKey]) {
      return cache.data[pairKey];
    }

    // Try direct Yahoo FX pair ticker (e.g. USDEUR=X)
    const directTicker = `${fromClean}${toClean}=X`;
    let rate = await fetchYahooFxRate(directTicker);

    // If direct ticker failed, try inverse pair (e.g. EURUSD=X)
    if (rate === null) {
      const inverseTicker = `${toClean}${fromClean}=X`;
      const inverseRate = await fetchYahooFxRate(inverseTicker);
      if (inverseRate !== null && inverseRate > 0) {
        rate = 1 / inverseRate;
      }
    }

    // Fallback if Yahoo fetch failed
    if (rate === null) {
      rate = getFallbackExchangeRate(fromClean, toClean);
    }

    // Cache resolved rate
    writeFxCache({ [pairKey]: rate });
    return rate;
  },

  /**
   * Batch fetch exchange rates for multiple source currencies to a target currency.
   */
  getExchangeRates: async (fromCurrencies: string[], targetCurrency: string): Promise<Record<string, number>> => {
    const targetClean = targetCurrency.trim().toUpperCase();
    const uniqueCurrencies = Array.from(new Set(fromCurrencies.map(c => c.trim().toUpperCase())));
    const rates: Record<string, number> = {};

    await Promise.all(
      uniqueCurrencies.map(async (fromCurr) => {
        if (fromCurr === targetClean) {
          rates[fromCurr] = 1.0;
        } else {
          rates[fromCurr] = await currencyService.getExchangeRate(fromCurr, targetClean);
        }
      })
    );

    return rates;
  },

  /**
   * Convert an amount from `fromCurrency` to `toCurrency` using provided rates table or fallback.
   */
  convertAmount: (
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    rates?: Record<string, number>
  ): number => {
    const fromClean = fromCurrency.trim().toUpperCase();
    const toClean = toCurrency.trim().toUpperCase();

    if (fromClean === toClean || amount === 0) return amount;

    // Check provided rates table (where key is `fromCurrency`)
    if (rates && rates[fromClean] !== undefined) {
      return amount * rates[fromClean];
    }

    // Otherwise use static fallback rate
    const fallbackRate = getFallbackExchangeRate(fromClean, toClean);
    return amount * fallbackRate;
  }
};
