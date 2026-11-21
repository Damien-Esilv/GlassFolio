/**
 * Asset Pair & Trailing Unit Normalizer
 *
 * Pure helpers for exchange trading pairs (BTCUSDT, XXBTZEUR, BTC/EUR)
 * and cells that embed a ticker or currency suffix ("0.0001BNB", "9,94 CHF").
 */

const KNOWN_QUOTE_SUFFIXES = [
    'FDUSD',
    'USDT',
    'USDC',
    'BUSD',
    'TUSD',
    'USDP',
    'EUR',
    'USD',
    'GBP',
    'CHF',
    'JPY',
    'CAD',
    'AUD',
    'BTC',
    'ETH',
    'BNB',
] as const;

const KRAKEN_ASSET_ALIASES: Record<string, string> = {
    XBT: 'BTC',
    XDG: 'DOGE',
};

function normalizeAssetCode(code: string): string {
    const upper = code.trim().toUpperCase();
    return KRAKEN_ASSET_ALIASES[upper] ?? upper;
}

/**
 * Normalize a Kraken 4-char prefixed asset code (XXBT -> BTC, ZEUR -> EUR)
 * while leaving normal 4-letter tickers (USDT, USDC, DOGE, LINK) untouched.
 */
function normalizeKrakenLeg(leg: string): string {
    if (leg.length === 4 && (leg.startsWith('X') || leg.startsWith('Z'))) {
        return normalizeAssetCode(leg.slice(1));
    }
    return normalizeAssetCode(leg);
}

/**
 * Extract a trailing alphabetic asset/currency unit from a numeric cell
 * (e.g. "0.0001BNB" -> "BNB", "9,94 CHF" -> "CHF"). Returns undefined for
 * pure numbers, scientific notation, or currency-prefixed strings ("USD 50").
 */
export function extractTrailingAssetUnit(rawCell: string | undefined): string | undefined {
    if (!rawCell) return undefined;
    const trimmed = rawCell.trim();
    if (!trimmed || /^[+-]?\d+(?:[.,]\d+)?e[+-]?\d+$/i.test(trimmed)) return undefined;

    const match = trimmed.match(/^[+-]?\s*(?:\d[\d\s'’.,]*\d|\d)\s*([A-Za-z]{2,10})$/);
    if (!match) return undefined;
    return normalizeAssetCode(match[1]);
}

/** True when the mapped symbol column header denotes a trading pair (Pair, pair, Trading pair, Market). */
export function isPairHeader(header: string | number | undefined): boolean {
    if (typeof header !== 'string') return false;
    return /\b(pair|paire|trading\s*pair|market)\b/i.test(header);
}

/**
 * Split a trading pair into base asset and optional quote asset/currency.
 * Handles delimited pairs ("BTC/EUR", "ETH-USDT"), Kraken legacy pairs
 * ("XXBTZEUR", "XETHZUSD", "XETHXXBT"), and concatenated pairs ("BTCUSDT").
 */
export function normalizeTradingPair(rawPair: string): { base: string; quote?: string } {
    const cleaned = rawPair.trim().toUpperCase();
    if (!cleaned) return { base: '' };

    // Delimited pairs: BTC/EUR, ETH-USDT, SOL_USD
    const delimited = cleaned.match(/^([A-Z0-9]+)[/_-]([A-Z0-9]+)$/);
    if (delimited) {
        return {
            base: normalizeAssetCode(delimited[1]),
            quote: normalizeAssetCode(delimited[2]),
        };
    }

    // Kraken legacy 8-char X/Z-prefixed pairs: XXBTZEUR, XETHZUSD, XETHXXBT, XLTCZUSD
    const krakenMatch = cleaned.match(/^([XZ][A-Z0-9]{3})([XZ][A-Z0-9]{3})$/);
    if (krakenMatch) {
        return {
            base: normalizeKrakenLeg(krakenMatch[1]),
            quote: normalizeKrakenLeg(krakenMatch[2]),
        };
    }

    // Kraken base aliases without leading X (e.g. XBTUSD, XBTUSDT, XDGUSD) so "XBTUSD" isn't split as XB+TUSD
    const krakenAliasMatch = cleaned.match(/^(XBT|XDG)([A-Z]{3,5})$/);
    if (krakenAliasMatch) {
        return {
            base: normalizeAssetCode(krakenAliasMatch[1]),
            quote: normalizeAssetCode(krakenAliasMatch[2]),
        };
    }

    // Concatenated pairs: BTCUSDT, ETHEUR, BNBFDUSD
    for (const suffix of KNOWN_QUOTE_SUFFIXES) {
        if (cleaned.endsWith(suffix) && cleaned.length > suffix.length + 1) {
            const rawBase = cleaned.slice(0, cleaned.length - suffix.length);
            // Guard against stripping ZEUR when a 4-char Kraken base precedes it (e.g. XXBTEUR)
            const base = rawBase.length === 4 && rawBase.startsWith('X')
                ? normalizeKrakenLeg(rawBase)
                : normalizeAssetCode(rawBase);
            return { base, quote: suffix };
        }
    }

    return { base: normalizeAssetCode(cleaned) };
}
