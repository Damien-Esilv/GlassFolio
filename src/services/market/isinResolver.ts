/**
 * ISIN → market symbol (TGLA-221).
 *
 * Brokers give an ISIN; prices are fetched by Yahoo symbol (CW8.PA, IWDA.AS). The resolver asks
 * Yahoo search first (it accepts an ISIN), then OpenFIGI through the relay when Yahoo has nothing,
 * and picks the listing that matches the account currency (Euronext Paris first for EUR).
 * Results are cached in the browser (public market data, like the price cache).
 */
import { usesYahooProxy, yahooFinanceUrl } from '../../config/marketData';
import { relayJson } from '../connectors/relayClient';
import { OpenFigiMappingResponseSchema, YahooSearchResponseSchema } from '../contracts/externalSchemas';
import { appStorage } from '../storage/appStorage';

const CACHE_KEY = 'gf_isin_symbol_cache';
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 6000;
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/** OpenFIGI (Bloomberg) exchange code → Yahoo suffix. */
export const FIGI_EXCHANGE_SUFFIX: Record<string, string> = {
    FP: '.PA', NA: '.AS', BB: '.BR', GY: '.DE', GR: '.DE', IM: '.MI', SM: '.MC', LN: '.L', SW: '.SW', SE: '.SW',
    US: '', UN: '', UW: '', UQ: '', UA: '', UR: '', UP: '',
};

/** Listings preferred for an account currency, best first. */
const PREFERRED_SUFFIXES: Record<string, string[]> = {
    EUR: ['.PA', '.AS', '.DE', '.MI', '.MC', '.BR'],
    USD: [''],
    GBP: ['.L'],
    CHF: ['.SW'],
};

interface CacheEntry { symbol: string | null; at: number }

const readCache = (): Record<string, CacheEntry> => {
    try {
        const parsed: unknown = JSON.parse(appStorage.getItem(CACHE_KEY) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, CacheEntry>) : {};
    } catch {
        return {};
    }
};

const writeCache = (isin: string, symbol: string | null): void => {
    try {
        appStorage.setItem(CACHE_KEY, JSON.stringify({ ...readCache(), [isin]: { symbol, at: Date.now() } }));
    } catch {
        // Storage full or disabled: resolution simply runs again next time.
    }
};

const suffixOf = (symbol: string): string => {
    const dot = symbol.lastIndexOf('.');
    return dot > 0 ? symbol.slice(dot) : '';
};

const hasPreferredListing = (symbols: string[], currency: string): boolean =>
    (PREFERRED_SUFFIXES[currency.toUpperCase()] ?? []).some(suffix => symbols.some(symbol => suffixOf(symbol) === suffix));

/** The listing that suits the account currency, else the first one. */
export function pickListing(symbols: string[], currency: string): string | undefined {
    if (symbols.length === 0) return undefined;
    const preferred = PREFERRED_SUFFIXES[currency.toUpperCase()] ?? [];
    for (const suffix of preferred) {
        const match = symbols.find(symbol => suffixOf(symbol) === suffix);
        if (match) return match;
    }
    return symbols[0];
}

async function yahooSymbols(isin: string): Promise<string[]> {
    const query = `q=${encodeURIComponent(isin)}&quotesCount=10&newsCount=0`;
    const raw = usesYahooProxy()
        ? await fetch(yahooFinanceUrl(`/v1/finance/search?${query}`), { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) })
            .then(response => (response.ok ? response.json() : null))
        : await relayJson({ provider: 'yahoo', method: 'GET', path: '/v1/finance/search', query });
    const parsed = YahooSearchResponseSchema.safeParse(raw);
    if (!parsed.success) return [];
    return (parsed.data.quotes ?? [])
        .filter(quote => quote.symbol && quote.quoteType !== 'CRYPTOCURRENCY')
        .map(quote => (quote.symbol as string).toUpperCase());
}

async function figiSymbols(isin: string): Promise<string[]> {
    const raw = await relayJson({ provider: 'openfigi', method: 'POST', path: '/v3/mapping', body: [{ idType: 'ID_ISIN', idValue: isin }] });
    const parsed = OpenFigiMappingResponseSchema.safeParse(raw);
    if (!parsed.success) return [];
    const symbols = new Set<string>();
    for (const listing of parsed.data[0]?.data ?? []) {
        const suffix = listing.exchCode ? FIGI_EXCHANGE_SUFFIX[listing.exchCode] : undefined;
        if (listing.ticker && suffix !== undefined) symbols.add(`${listing.ticker.toUpperCase()}${suffix}`);
    }
    return [...symbols];
}

export const isinResolver = {
    /** Market symbol for an ISIN, or undefined when no source knows it. Never throws. */
    async resolve(isin: string, currency: string): Promise<string | undefined> {
        const key = isin.trim().toUpperCase();
        if (!ISIN_PATTERN.test(key)) return undefined;
        const cached = readCache()[key];
        if (cached && Date.now() - cached.at < (cached.symbol ? HIT_TTL_MS : MISS_TTL_MS)) {
            return cached.symbol ?? undefined;
        }
        // Yahoo often lists one place only (IWDA.L): OpenFIGI fills in the listing of the account currency
        let symbols = await yahooSymbols(key).catch(() => []);
        if (!hasPreferredListing(symbols, currency)) {
            symbols = [...symbols, ...(await figiSymbols(key).catch(() => []))];
        }
        const symbol = pickListing(symbols, currency);
        writeCache(key, symbol ?? null);
        return symbol;
    },

    clearCache(): void {
        appStorage.removeItem(CACHE_KEY);
    },
};
