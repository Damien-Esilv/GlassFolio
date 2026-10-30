/**
 * Asset classifier: decides what an imported asset is (stock, ETF, fund, crypto, cash, bond, other).
 *
 * Priority, first answer wins:
 *   1. a type the caller already knows
 *   2. an ISO currency code  -> cash (read per row, so cash stays cash in any account)
 *   3. a network / contract address (a token) -> crypto
 *   4. the account's default: a crypto account -> crypto, an "other" account -> other (no lookup needed)
 *   5. a market-data lookup by symbol or ISIN: Yahoo `quoteType`, then CoinGecko (exact symbol only)
 *   6. offline fallback: the short list of well-known cryptos, otherwise stock
 *
 * The lookup is best effort: time-boxed, done once per distinct asset, cached on the device, and the
 * import never depends on it. "other" is never guessed from a lookup: it has no price tracker and is
 * only chosen by the user (or by an "other" account).
 */

import { yahooFinanceUrl } from '../config/marketData';
import { appStorage } from './storage/appStorage';
import {
    AccountType,
    ISIN_REGEX,
    InstrumentType,
    VALID_CRYPTO_SYMBOLS,
    VALID_FIAT_CURRENCIES,
} from '../types';

const CACHE_KEY = 'gf_asset_class_cache';
const SETTING_KEY = 'gf_asset_lookup';
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 3000;
const COINGECKO_SEARCH = 'https://api.coingecko.com/api/v3/search';

export interface ClassificationInput {
    symbol: string;
    isin?: string;
    network?: string;
    contractAddress?: string;
    accountType?: AccountType;
    /** Type already known by the caller (file column, user choice): returned as is. */
    type?: InstrumentType;
}

export interface Classification {
    type: InstrumentType;
    /** Name found by the lookup, when the file gave none. */
    name?: string;
    /** Exchange found by the lookup (Yahoo exchange code), when the file gave none. */
    exchange?: string;
    source: 'given' | 'currency' | 'token' | 'account' | 'cache' | 'yahoo' | 'coingecko' | 'local';
}

interface CacheEntry {
    type: InstrumentType | null;
    name?: string;
    exchange?: string;
    source: 'yahoo' | 'coingecko';
    at: number;
}

// ---------------------------------------------------------------------------
// Setting (device preference): lookups are on by default, off in unit tests unless enabled explicitly
// ---------------------------------------------------------------------------

const isTestMode = (): boolean =>
    (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test';

export function isAssetLookupEnabled(): boolean {
    try {
        const stored = appStorage.getItem(SETTING_KEY);
        if (stored === 'on') return true;
        if (stored === 'off') return false;
    } catch {
        // Storage disabled: use the default
    }
    return !isTestMode();
}

export function setAssetLookupEnabled(enabled: boolean): void {
    try {
        appStorage.setItem(SETTING_KEY, enabled ? 'on' : 'off');
    } catch {
        // Storage disabled: the default applies
    }
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const readCache = (): Record<string, CacheEntry> => {
    try {
        const raw = appStorage.getItem(CACHE_KEY);
        return raw ? (JSON.parse(raw) as Record<string, CacheEntry>) : {};
    } catch {
        return {};
    }
};

const cacheKey = (input: ClassificationInput): string =>
    `${(input.isin || input.symbol).trim().toUpperCase()}|${isCryptoAccount(input.accountType) ? 'c' : 'x'}`;

const readEntry = (key: string): CacheEntry | undefined => {
    const entry = readCache()[key];
    if (!entry) return undefined;
    const ttl = entry.type ? HIT_TTL_MS : MISS_TTL_MS;
    return Date.now() - entry.at <= ttl ? entry : undefined;
};

const writeEntry = (key: string, entry: CacheEntry): void => {
    try {
        appStorage.setItem(CACHE_KEY, JSON.stringify({ ...readCache(), [key]: entry }));
    } catch {
        // Storage full or disabled: the lookup is simply repeated next time
    }
};

export function clearAssetClassCache(): void {
    appStorage.removeItem(CACHE_KEY);
}

// ---------------------------------------------------------------------------
// Local rules
// ---------------------------------------------------------------------------

const isCryptoAccount = (type?: AccountType): boolean =>
    type === 'crypto_spot' || type === 'crypto_earn' || type === 'crypto_futures';

/** What an account makes of an asset that has no other signal. */
export function defaultTypeForAccount(type?: AccountType): InstrumentType | undefined {
    if (isCryptoAccount(type)) return 'crypto';
    if (type === 'other') return 'other';
    return undefined;
}

const isFiat = (symbol: string): boolean =>
    (VALID_FIAT_CURRENCIES as readonly string[]).includes(symbol);

const isKnownCrypto = (symbol: string): boolean =>
    (VALID_CRYPTO_SYMBOLS as readonly string[]).includes(symbol);

/** Yahoo `quoteType` to instrument type. Anything unknown is a stock: "other" is never guessed. */
export function mapYahooQuoteType(quoteType: string | undefined): InstrumentType {
    switch ((quoteType || '').toUpperCase()) {
        case 'ETF': return 'etf';
        case 'MUTUALFUND': return 'fund';
        case 'CRYPTOCURRENCY': return 'crypto';
        case 'CURRENCY': return 'cash';
        default: return 'stock';
    }
}

// ---------------------------------------------------------------------------
// Lookups (best effort)
// ---------------------------------------------------------------------------

interface YahooSearchQuote {
    symbol?: string;
    quoteType?: string;
    shortname?: string;
    longname?: string;
    exchange?: string;
}

interface CoinGeckoCoin {
    symbol?: string;
    name?: string;
    market_cap_rank?: number | null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

const baseOf = (yahooSymbol: string): string => yahooSymbol.toUpperCase().split(/[.-]/)[0];

/** Picks the quote that is this asset: the exact symbol, else the same base ticker (NEAR-USD, CW8.PA). */
function pickQuote(quotes: YahooSearchQuote[], query: string, preferCrypto: boolean): YahooSearchQuote | undefined {
    const wanted = query.toUpperCase();
    const exact = quotes.find(q => q.symbol?.toUpperCase() === wanted);
    if (exact) return exact;
    const sameBase = quotes.filter(q => q.symbol && baseOf(q.symbol) === wanted);
    return (preferCrypto && sameBase.find(q => q.quoteType?.toUpperCase() === 'CRYPTOCURRENCY')) || sameBase[0];
}

async function lookupYahoo(query: string, preferCrypto: boolean, isinQuery: boolean): Promise<CacheEntry | null> {
    const data = await fetchJson<{ quotes?: YahooSearchQuote[] }>(
        yahooFinanceUrl(`/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`)
    );
    const quotes = data?.quotes ?? [];
    // An ISIN search returns the listings of that security: any of them tells what it is
    const hit = isinQuery ? quotes.find(q => q.quoteType) : pickQuote(quotes, query, preferCrypto);
    if (!hit?.quoteType) return null;
    return {
        type: mapYahooQuoteType(hit.quoteType),
        name: hit.longname || hit.shortname,
        exchange: hit.exchange,
        source: 'yahoo',
        at: Date.now(),
    };
}

async function lookupCoinGecko(symbol: string): Promise<CacheEntry | null> {
    const data = await fetchJson<{ coins?: CoinGeckoCoin[] }>(`${COINGECKO_SEARCH}?query=${encodeURIComponent(symbol)}`);
    const matches = (data?.coins ?? []).filter(c => c.symbol?.toUpperCase() === symbol.toUpperCase());
    if (matches.length === 0) return null;
    const best = matches.reduce((a, b) => ((b.market_cap_rank ?? Infinity) < (a.market_cap_rank ?? Infinity) ? b : a));
    return { type: 'crypto', name: best.name, source: 'coingecko', at: Date.now() };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function classifyAsset(input: ClassificationInput): Promise<Classification> {
    if (input.type) return { type: input.type, source: 'given' };

    const symbol = input.symbol.trim().toUpperCase();
    const isin = input.isin?.trim().toUpperCase();
    const hasIsin = Boolean(isin && ISIN_REGEX.test(isin));

    if (!hasIsin && isFiat(symbol)) return { type: 'cash', source: 'currency' };
    if (input.network || input.contractAddress) return { type: 'crypto', source: 'token' };

    const accountDefault = !hasIsin ? defaultTypeForAccount(input.accountType) : undefined;
    if (accountDefault) return { type: accountDefault, source: 'account' };

    const key = cacheKey(input);
    const cached = readEntry(key);
    if (cached?.type) return { type: cached.type, name: cached.name, exchange: cached.exchange, source: 'cache' };

    if (!cached && isAssetLookupEnabled()) {
        const hit = hasIsin
            ? await lookupYahoo(isin as string, false, true)
            : (await lookupYahoo(symbol, isCryptoAccount(input.accountType), false)) ?? (await lookupCoinGecko(symbol));
        writeEntry(key, hit ?? { type: null, source: 'yahoo', at: Date.now() });
        if (hit?.type) return { type: hit.type, name: hit.name, exchange: hit.exchange, source: hit.source };
    }

    // Offline, disabled or unknown: the short list of well-known cryptos, otherwise a stock
    if (!hasIsin && isKnownCrypto(symbol)) return { type: 'crypto', source: 'local' };
    return { type: 'stock', source: 'local' };
}
