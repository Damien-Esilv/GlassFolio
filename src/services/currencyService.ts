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

/** Daily closes of one currency in EUR, oldest first: [YYYY-MM-DD, rate] */
type DailyRates = Array<[string, number]>;

/** Session cache: history does not change; a failed fetch is retried next time */
const historyCache = new Map<string, Promise<DailyRates>>();

/** A rate older than this before the requested day is reported as estimated */
const HISTORY_MAX_GAP_DAYS = 7;

async function fetchYahooFxHistory(ticker: string): Promise<DailyRates> {
  const base = yahooFinanceUrl(`/v8/finance/chart/${encodeURIComponent(ticker)}`);
  try {
    const response = await fetch(`${base}?interval=1d&range=max`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const json = await response.json();
    const result = json.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close ?? [];
    const rates: DailyRates = [];
    timestamps.forEach((ts, i) => {
      const close = closes[i];
      if (typeof close === 'number' && close > 0) rates.push([new Date(ts * 1000).toISOString().slice(0, 10), close]);
    });
    return rates;
  } catch {
    return [];
  }
}

function dailyHistoryToEur(currency: string): Promise<DailyRates> {
  let pending = historyCache.get(currency);
  if (!pending) {
    pending = fetchYahooFxHistory(`${currency}EUR=X`).then(rates => {
      if (rates.length === 0) historyCache.delete(currency);
      return rates;
    });
    historyCache.set(currency, pending);
  }
  return pending;
}

/** Latest rate on or before `date` (binary search) */
function rateOnOrBefore(rates: DailyRates, date: string): [string, number] | undefined {
  let lo = 0;
  let hi = rates.length - 1;
  let found: [string, number] | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rates[mid][0] <= date) { found = rates[mid]; lo = mid + 1; }
    else hi = mid - 1;
  }
  return found;
}

const daysBetween = (from: string, to: string): number =>
  (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000;

export const currencyService = {
  /**
   * Builds a lookup of the EUR value of each currency at past dates (Yahoo daily closes).
   * Without history for that day, the closest earlier close is used, else today's rate; both are
   * reported as `estimated`.
   */
  getHistoricalRatesToEur: async (
    currencies: string[]
  ): Promise<(currency: string, date: string) => { rate: number; estimated: boolean } | undefined> => {
    const codes = Array.from(new Set(currencies.map(c => c.trim().toUpperCase()).filter(c => c && c !== 'EUR')));
    const histories = new Map<string, DailyRates>();
    const current = new Map<string, number>();
    await Promise.all(codes.map(async code => {
      histories.set(code, await dailyHistoryToEur(code));
      current.set(code, await currencyService.getExchangeRate(code, 'EUR'));
    }));

    return (currency, date) => {
      const code = currency.trim().toUpperCase();
      if (code === 'EUR') return { rate: 1, estimated: false };
      const point = rateOnOrBefore(histories.get(code) ?? [], date);
      if (point) return { rate: point[1], estimated: daysBetween(point[0], date) > HISTORY_MAX_GAP_DAYS };
      const today = current.get(code);
      return today && today > 0 ? { rate: today, estimated: true } : undefined;
    };
  },

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
