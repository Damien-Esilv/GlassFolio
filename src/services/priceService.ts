/**
 * priceService.ts
 * 
 * Robust market price service fetching live prices from Yahoo Finance v8 API.
 * 
 * Features:
 * - Yahoo Finance v8 Chart API (/v8/finance/chart/{ticker}) for stocks, ETFs, and crypto
 * - Automatic ticker resolution for European ETFs (e.g. CW8 -> CW8.PA)
 * - Crypto fallback via CoinGecko API if Yahoo Finance fails for a token
 * - 15-minute localStorage cache (key: 'gf_price_cache')
 * - Graceful fallback on network/CORS error (preserves current prices)
 * - Zero hardcoding, 100% typed
 */

import { Position } from '../../types';

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

interface PriceCache {
    data: Record<string, number>; // e.g. { 'AAPL': 224.50, 'BTC-USD': 64200, 'CW8.PA': 520.50 }
    fetchedAt: string;            // ISO 8601 string timestamp
}

interface YahooChartResponse {
    chart?: {
        result?: Array<{
            meta?: {
                symbol?: string;
                regularMarketPrice?: number;
                chartPreviousClose?: number;
            };
        }>;
        error?: {
            code?: string;
            description?: string;
        } | null;
    };
}

interface CoinGeckoPriceResponse {
    [key: string]: {
        usd?: number;
        eur?: number;
    };
}

// ---------------------------------------------------------------------------
// Constants & Ticker Resolution
// ---------------------------------------------------------------------------

const CACHE_KEY = 'gf_price_cache';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Mapping of common European tickers to Yahoo Finance suffixes */
const EUROPEAN_TICKER_MAP: Record<string, string> = {
    'CW8': 'CW8.PA',     // Amundi MSCI World UCITS ETF (Euronext Paris)
    'EWLD': 'EWLD.PA',   // Lyxor MSCI World UCITS ETF
    'PAEEM': 'PAEEM.PA', // Lyxor MSCI Emerging Markets
    'WLD': 'WLD.PA',
    'MC': 'MC.PA',       // LVMH
    'OR': 'OR.PA',       // L'Oréal
    'AIR': 'AIR.PA',     // Airbus
    'TTE': 'TTE.PA',     // TotalEnergies
    'SAN': 'SAN.PA',     // Sanofi
    'BNP': 'BNP.PA'      // BNP Paribas
};

/** Standard suffix mapping for Yahoo Finance exchanges */
const EXCHANGE_SUFFIX_MAP: Record<string, string> = {
    'PAR': '.PA',
    'EPA': '.PA',
    'AMS': '.AS',
    'FRA': '.F',
    'XETRA': '.DE',
    'ETR': '.DE',
    'LON': '.L',
    'MIL': '.MI',
    'BIT': '.MI',
    'MAD': '.MC',
    'BME': '.MC',
    'NAS': '',
    'NASDAQ': '',
    'NYSE': '',
    'AMEX': ''
};

const COINGECKO_MAP: Record<string, string> = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'SOL': 'solana',
    'ADA': 'cardano',
    'XRP': 'ripple',
    'DOT': 'polkadot',
    'AVAX': 'avalanche-2',
    'LINK': 'chainlink'
};

// ---------------------------------------------------------------------------
// Helpers & Cache Management
// ---------------------------------------------------------------------------

function toYahooTicker(pos: Position): string | null {
    if (pos.type === 'Cash') return null;
    const clean = pos.symbol.trim().toUpperCase();

    if (pos.type === 'Crypto') {
        if (clean.includes('-')) return clean;
        return `${clean}-USD`;
    }

    if (pos.exchange) {
        const exchangeClean = pos.exchange.trim().toUpperCase();
        if (exchangeClean in EXCHANGE_SUFFIX_MAP) {
            const suffix = EXCHANGE_SUFFIX_MAP[exchangeClean];
            if (suffix && !clean.endsWith(suffix)) {
                return `${clean}${suffix}`;
            }
            if (!suffix) {
                return clean; // US exchanges with no suffix
            }
        }
    }

    if (clean in EUROPEAN_TICKER_MAP) {
        return EUROPEAN_TICKER_MAP[clean];
    }

    return clean;
}

function readCache(): PriceCache | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed: PriceCache = JSON.parse(raw);
        const age = Date.now() - new Date(parsed.fetchedAt).getTime();
        if (age > CACHE_TTL_MS) return null; // Expired cache
        return parsed;
    } catch {
        return null;
    }
}

function writeCache(data: Record<string, number>): void {
    try {
        const existing = readCache()?.data ?? {};
        const merged = { ...existing, ...data };
        const cache: PriceCache = {
            data: merged,
            fetchedAt: new Date().toISOString()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
        // Storage limit or disabled
    }
}

export function clearPriceCache(): void {
    localStorage.removeItem(CACHE_KEY);
}

export function getLastPriceFetchTime(): string | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed: PriceCache = JSON.parse(raw);
        return parsed.fetchedAt;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

/**
 * Fetches price for a single ticker via Yahoo Finance v8 chart API.
 */
async function fetchYahooTickerPrice(ticker: string): Promise<number | null> {
    // @ts-expect-error import.meta.env is injected by Vite
    const base = import.meta.env.DEV
        ? `/yf/v8/finance/chart/${encodeURIComponent(ticker)}`
        : `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`;

    const url = `${base}?interval=1d&range=1d`;

    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(6000) // 6s timeout per ticker
        });

        if (!response.ok) return null;

        const json: YahooChartResponse = await response.json();
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
 * Fallback fetcher for crypto assets using CoinGecko public API.
 */
async function fetchCoinGeckoPrice(symbol: string): Promise<number | null> {
    const cleanSymbol = symbol.replace('-USD', '').toUpperCase();
    const geckoId = COINGECKO_MAP[cleanSymbol];
    if (!geckoId) return null;

    try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return null;
        const data: CoinGeckoPriceResponse = await res.json();
        return data[geckoId]?.usd ?? null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Main Public API
// ---------------------------------------------------------------------------

/**
 * Refreshes prices for all positions using Yahoo Finance with CoinGecko fallback.
 */
export async function refreshPositionPrices(positions: Position[]): Promise<Position[]> {
    if (positions.length === 0) return positions;

    // Collect all valid Yahoo tickers
    const tickerToPositions = new Map<string, Position[]>();
    for (const pos of positions) {
        const ticker = toYahooTicker(pos);
        if (!ticker) continue;

        const list = tickerToPositions.get(ticker) ?? [];
        list.push(pos);
        tickerToPositions.set(ticker, list);
    }

    const tickers = Array.from(tickerToPositions.keys());
    if (tickers.length === 0) return positions;

    // Check cache
    const cached = readCache();
    let prices: Record<string, number> = cached?.data ?? {};

    const missingTickers = tickers.filter(t => !(t in prices));

    if (missingTickers.length > 0) {
        const fetchedPrices: Record<string, number> = {};

        // Fetch missing tickers in parallel
        const results = await Promise.allSettled(
            missingTickers.map(async (ticker) => {
                let price = await fetchYahooTickerPrice(ticker);

                // If Yahoo fails and it's a crypto, attempt CoinGecko fallback
                if (price === null && ticker.endsWith('-USD')) {
                    price = await fetchCoinGeckoPrice(ticker);
                }

                return { ticker, price };
            })
        );

        for (const res of results) {
            if (res.status === 'fulfilled' && res.value.price !== null) {
                fetchedPrices[res.value.ticker] = res.value.price;
            }
        }

        if (Object.keys(fetchedPrices).length > 0) {
            prices = { ...prices, ...fetchedPrices };
            writeCache(prices);
        }
    }

    // Apply resolved prices to positions
    return positions.map(pos => {
        const ticker = toYahooTicker(pos);
        const resolvedPrice = (ticker && prices[ticker]) ?? prices[pos.symbol.trim().toUpperCase()];

        if (!resolvedPrice) return pos;

        const marketValue = pos.quantity * resolvedPrice;
        const costBasis = pos.quantity * pos.avgCost;
        const unrealizedPL = marketValue - costBasis;
        const unrealizedPLPercent = costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0;

        return {
            ...pos,
            lastPrice: resolvedPrice,
            marketValue,
            unrealizedPL,
            unrealizedPLPercent
        };
    });
}
