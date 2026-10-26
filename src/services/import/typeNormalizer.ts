/**
 * Type Normalizer for CSV Imports
 * 
 * Normalizes transaction types, sub-types, dates, and numeric values.
 */

import { TransactionType, TransactionSubType } from '../../types/types.backend';

const CANONICAL_TYPES: ReadonlySet<string> = new Set([
    'BUY', 'SELL', 'DEPOSIT', 'WITHDRAW', 'INCOME', 'EXPENSE', 'TRANSFER', 'SWAP',
    'ADJUSTMENT', 'BALANCE_ADJUSTMENT', 'SNAPSHOT_ADJUSTMENT',
]);

/** Stock splits, reverse splits, spin-offs: they change quantities without any cash flow. */
const CORPORATE_ACTION_PATTERN = /\b(?:reverse\s+)?split\b|regroupement|spin[\s-]?off|scission|attribution gratuite/;

/**
 * Classify a raw type label. Returns null when the label is empty or unknown, so callers
 * can tell "recognized" apart from "defaulted".
 */
function classifyLabel(rawType: string): TransactionType | null {
    if (!rawType) return null;

    // Exact canonical value (e.g. the `operation` column of GlassFolio's own export): keep it as is.
    const canonical = rawType.trim().toUpperCase();
    if (CANONICAL_TYPES.has(canonical)) return canonical as TransactionType;

    const lower = rawType.toLowerCase().trim();
    const has = (...needles: string[]): boolean => needles.some(needle => lower.includes(needle));

    if (CORPORATE_ACTION_PATTERN.test(lower)) return 'ADJUSTMENT';

    // Sell wording that contains a buy keyword ("rachat" holds "achat", "verkauf" holds "kauf") is tested first
    if (has('verkauf', 'rachat', 'transaction sold', 'transaction spend', 'vendita', 'venta', 'cession')) {
        return 'SELL';
    }

    // Buy patterns
    if (has('buy', 'achat', 'purchase', 'kauf', 'souscription', 'transaction revenue', 'compra', 'acquisto', 'acquisition')) {
        return 'BUY';
    }

    // Sell patterns
    if (has('sell', 'vente', 'sold')) {
        return 'SELL';
    }

    // Deposit patterns
    if (has('deposit', 'dépôt', 'virement reçu', 'credit', 'crédit', 'versement', 'apport', 'einzahlung')) {
        return 'DEPOSIT';
    }

    // Withdraw patterns
    if (has('withdraw', 'retrait', 'virement émis', 'debit', 'débit', 'auszahlung')) {
        return 'WITHDRAW';
    }

    // Income patterns (dividends, interest, staking, cashback)
    if (has('dividend', 'dividende', 'interest', 'intérêt', 'distribution', 'staking', 'reward', 'cashback',
        'saveback', 'airdrop', 'mining', 'coupon', 'zinsen')) {
        return 'INCOME';
    }

    // Expense patterns
    if (has('fee', 'frais', 'commission', 'gebühr')) {
        return 'EXPENSE';
    }

    // Transfer patterns
    if (has('transfer', 'virement', 'send', 'receive', 'envoi')) {
        return 'TRANSFER';
    }

    // Swap patterns
    if (has('swap', 'exchange', 'convert', 'small assets', 'dust')) {
        return 'SWAP';
    }

    // Adjustment patterns
    if (has('adjust', 'correction', 'manual')) {
        return 'ADJUSTMENT';
    }

    return null;
}

/** True when a cell reads like a transaction type label (buy, vente, Verkauf, dividend, split…) */
export function isKnownTypeLabel(rawType: string): boolean {
    const lower = rawType.toLowerCase().trim();
    return classifyLabel(rawType) !== null || (lower !== '' && CORPORATE_ACTION_PATTERN.test(lower));
}

/**
 * Normalize raw transaction type string to standard TransactionType.
 * Unknown or empty labels fall back to BUY; use resolveTransactionType to tell them apart.
 */
export function normalizeTransactionType(rawType: string): TransactionType {
    return classifyLabel(rawType) ?? 'BUY';
}

/**
 * Infer transaction sub-type from raw type string.
 * Provides granular classification, especially for crypto operations.
 */
export function inferTransactionSubType(rawType: string): TransactionSubType | undefined {
    if (!rawType) return undefined;
    const lower = rawType.toLowerCase().trim();

    if (lower.includes('dividend') || lower.includes('dividende')) return 'DIVIDEND';
    if (lower.includes('interest') || lower.includes('intérêt')) return 'INTEREST';
    if (lower.includes('staking') || lower.includes('stake reward')) return 'STAKING_REWARD';
    if (lower.includes('airdrop')) return 'AIRDROP';
    if (lower.includes('mining')) return 'MINING_REWARD';
    if (lower.includes('cashback') || lower.includes('saveback')) return 'CASHBACK';
    if (lower.includes('dust') || lower.includes('small assets')) return 'DUST_CONVERSION';

    return undefined;
}

/**
 * Supported explicit day/month ordering hints for ambiguous slash dates.
 */
export type DateFormatHint = 'DD/MM/YYYY' | 'MM/DD/YYYY';

const MONTH_NAMES: Record<string, number> = {
    jan: 1, janv: 1, janvier: 1, january: 1,
    feb: 2, fev: 2, fevr: 2, fevrier: 2, february: 2,
    mar: 3, mars: 3, march: 3,
    apr: 4, avr: 4, avril: 4, april: 4,
    may: 5, mai: 5,
    jun: 6, juin: 6, june: 6,
    jul: 7, juil: 7, juillet: 7, july: 7,
    aug: 8, aou: 8, aout: 8, august: 8,
    sep: 9, sept: 9, septembre: 9, september: 9,
    oct: 10, octobre: 10, october: 10,
    nov: 11, novembre: 11, november: 11,
    dec: 12, decembre: 12, december: 12
};

function stripAccents(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Build a UTC ISO string, rejecting impossible calendar dates (e.g. 31/02)
 * instead of silently rolling them over to the next month.
 */
function buildUtcIso(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): string | null {
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date.toISOString();
}

function expandYear(raw: string): number {
    const year = parseInt(raw, 10);
    if (raw.length === 4) return year;
    return year < 70 ? 2000 + year : 1900 + year;
}

function parseTime(rest: string): [number, number, number] {
    const timeMatch = rest.match(/(\d{1,2})[:h](\d{2})(?::(\d{2}))?/);
    if (!timeMatch) return [0, 0, 0];
    return [parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), parseInt(timeMatch[3] || '0', 10)];
}

/**
 * Infer the day/month ordering of a date column from its values.
 * Returns undefined when every sample is ambiguous (both parts <= 12).
 */
export function detectDateFormat(samples: string[]): DateFormatHint | undefined {
    let dayFirst = 0;
    let monthFirst = 0;
    for (const sample of samples) {
        const match = sample?.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/);
        if (!match) continue;
        const first = parseInt(match[1], 10);
        const second = parseInt(match[2], 10);
        if (first > 12 && second <= 12) dayFirst++;
        else if (second > 12 && first <= 12) monthFirst++;
    }
    if (dayFirst === 0 && monthFirst === 0) return undefined;
    return monthFirst > dayFirst ? 'MM/DD/YYYY' : 'DD/MM/YYYY';
}

/**
 * Parse a date string into an ISO 8601 UTC string.
 *
 * Supported: ISO / YYYY-MM-DD (with optional time and offset), DD/MM/YYYY and
 * MM/DD/YYYY (separators / - .; 2 or 4 digit years), month names (FR/EN),
 * Unix epoch seconds / milliseconds. Dates without an explicit offset are
 * interpreted as UTC so the result never depends on the browser time zone.
 */
export function parseDate(dateStr: string, formatHint?: string): string | null {
    if (!dateStr || dateStr.trim() === '') return null;

    const cleaned = dateStr.trim().replace(/^"|"$/g, '');

    // Unix epoch (seconds or milliseconds) — Kraken / Binance API exports
    if (/^\d{10}(\.\d+)?$/.test(cleaned)) return new Date(parseFloat(cleaned) * 1000).toISOString();
    if (/^\d{13}$/.test(cleaned)) return new Date(parseInt(cleaned, 10)).toISOString();

    // Year-first: 2024-01-15, 2024/01/15, 2024-01-15 10:30:00, 2024-01-15T10:30:00+02:00
    const isoMatch = cleaned.match(
        /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|UTC|GMT|[+-]\d{2}:?\d{2})?$/i
    );
    if (isoMatch) {
        const [, y, mo, d, h, mi, sec, tz] = isoMatch;
        const utc = buildUtcIso(parseInt(y, 10), parseInt(mo, 10), parseInt(d, 10),
            parseInt(h || '0', 10), parseInt(mi || '0', 10), parseInt(sec || '0', 10));
        if (!utc) return null;
        if (tz && /^[+-]/.test(tz)) {
            const sign = tz.startsWith('-') ? -1 : 1;
            const digits = tz.replace(/[^\d]/g, '');
            const offsetMinutes = sign * (parseInt(digits.slice(0, 2), 10) * 60 + parseInt(digits.slice(2, 4), 10));
            return new Date(new Date(utc).getTime() - offsetMinutes * 60000).toISOString();
        }
        return utc;
    }

    // Day/month first: 15/01/2024, 01/15/2024, 15.01.24, 15-01-2024 14:30
    const slashMatch = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)(.*)$/);
    if (slashMatch) {
        const [, a, b, y, rest] = slashMatch;
        const first = parseInt(a, 10);
        const second = parseInt(b, 10);
        let day = first;
        let month = second;
        if (formatHint === 'MM/DD/YYYY') {
            month = first;
            day = second;
        } else if (formatHint !== 'DD/MM/YYYY' && first <= 12 && second > 12) {
            // Unambiguous US date without hint (e.g. 01/15/2024)
            month = first;
            day = second;
        }
        const [h, mi, sec] = parseTime(rest);
        return buildUtcIso(expandYear(y), month, day, h, mi, sec);
    }

    // Month names: "15 janv. 2024", "15-Jan-2024", "Jan 15, 2024"
    const normalized = stripAccents(cleaned.toLowerCase());
    const dayFirstName = normalized.match(/^(\d{1,2})[\s-]+([a-z]+)\.?[\s-]+(\d{4})(.*)$/);
    const monthFirstName = normalized.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})(.*)$/);
    const named = dayFirstName
        ? { day: dayFirstName[1], month: dayFirstName[2], year: dayFirstName[3], rest: dayFirstName[4] }
        : monthFirstName
            ? { day: monthFirstName[2], month: monthFirstName[1], year: monthFirstName[3], rest: monthFirstName[4] }
            : null;
    if (named && MONTH_NAMES[named.month] !== undefined) {
        const [h, mi, sec] = parseTime(named.rest);
        return buildUtcIso(parseInt(named.year, 10), MONTH_NAMES[named.month], parseInt(named.day, 10), h, mi, sec);
    }

    // Fallback: RFC 2822 and other formats the engine understands natively
    if (/[a-z]/i.test(cleaned)) {
        const fallback = new Date(cleaned);
        if (!isNaN(fallback.getTime())) return fallback.toISOString();
    }

    return null;
}

export type DecimalSeparator = ',' | '.';

/** "1,234" / "12.345": an integer part of 1-3 digits, no leading zero run, then exactly 3 digits. */
function isThreeDigitGroup(intPart: string, fracPart: string): boolean {
    return fracPart.length === 3 && intPart.length >= 1 && intPart.length <= 3 && !/^0+$/.test(intPart);
}

/**
 * Resolve a number that contains a single kind of separator (only ',' or only '.').
 * A decimalHint (the separator the whole file uses) settles the ambiguous 3-digit case.
 */
function resolveSingleSeparator(value: string, separator: DecimalSeparator, decimalHint?: DecimalSeparator): string | null {
    const parts = value.split(separator);
    if (parts.length > 2) {
        // Repeated separator can only be a thousands separator: 1.234.567 / 1,234,567
        if (parts.slice(1).every(p => p.length === 3) && parts[0].length >= 1 && parts[0].length <= 3) {
            return parts.join('');
        }
        return null;
    }
    const [intPart, fracPart] = parts;
    if (isThreeDigitGroup(intPart, fracPart)) {
        if (decimalHint) {
            return separator === decimalHint ? `${intPart}.${fracPart}` : intPart + fracPart;
        }
        // "1,234" — historically treated as US thousands grouping
        if (separator === ',') return intPart + fracPart;
    }
    return `${intPart || '0'}.${fracPart}`;
}

/**
 * Parse a localized number into a canonical decimal string.
 *
 * Handles: FR/EU (1 234,56 · 1.234,56 · 1234,56), US (1,234.56), Swiss (1'234.56),
 * currency symbols/codes anywhere (12,50 € · EUR 12.50 · $1,250.50), narrow/non-breaking
 * spaces, explicit '+', trailing minus (12,50-), accounting negatives ((12.50)),
 * unicode minus and scientific notation (1.2E-5).
 *
 * A lone ',' or '.' followed by exactly 3 digits ("1,500") is ambiguous: pass the file's
 * decimalHint (see detectDecimalSeparator) to read it as a decimal or as thousands.
 */
export function parseDecimal(value: string | undefined, decimalHint?: DecimalSeparator): string | null {
    if (value === undefined || value === null) return null;
    let cleaned = String(value).trim();
    if (cleaned === '') return null;

    if (/^[+-]?\d+(\.\d+)?e[+-]?\d+$/i.test(cleaned)) {
        const sci = Number(cleaned);
        return Number.isFinite(sci) ? sci.toString() : null;
    }

    let negative = false;
    if (/^\(.*\)$/.test(cleaned)) {
        negative = true;
        cleaned = cleaned.slice(1, -1);
    }

    // Remove currency symbols / ISO codes, percent signs and every whitespace variant
    cleaned = cleaned
        .replace(/−/g, '-')
        .replace(/[A-Za-z€$£¥₿%'’\s\u00a0\u202f]/g, '');

    if (cleaned.endsWith('-')) {
        negative = !negative;
        cleaned = cleaned.slice(0, -1);
    }
    if (cleaned.startsWith('+')) {
        cleaned = cleaned.slice(1);
    } else if (cleaned.startsWith('-')) {
        negative = !negative;
        cleaned = cleaned.slice(1);
    }

    if (!/^[\d.,]+$/.test(cleaned) || !/\d/.test(cleaned)) return null;

    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    let normalized: string | null;

    if (lastComma >= 0 && lastDot >= 0) {
        // Both separators: the right-most one is the decimal separator
        const decimalSep = lastComma > lastDot ? ',' : '.';
        const thousandsSep = decimalSep === ',' ? '.' : ',';
        if (cleaned.split(decimalSep).length > 2) return null;
        normalized = cleaned.split(thousandsSep).join('').replace(decimalSep, '.');
    } else if (lastComma >= 0) {
        normalized = resolveSingleSeparator(cleaned, ',', decimalHint);
    } else if (lastDot >= 0) {
        normalized = resolveSingleSeparator(cleaned, '.', decimalHint);
    } else {
        normalized = cleaned;
    }

    if (normalized === null) return null;
    const num = Number(normalized);
    if (!Number.isFinite(num)) return null;

    return (negative && num !== 0 ? -num : num).toString();
}

/**
 * Infer which separator a numeric column uses for decimals. Only unambiguous samples vote
 * ("1 234,56", "3.5", "2,5"); a lone 3-digit group ("1,500") says nothing, except in a
 * semicolon-delimited file where a comma is far more likely a decimal than a thousands mark.
 */
export function detectDecimalSeparator(samples: string[], delimiter?: string): DecimalSeparator | undefined {
    let commaVotes = 0;
    let pointVotes = 0;
    let ambiguousCommas = 0;

    for (const sample of samples) {
        const cleaned = String(sample ?? '').replace(/[A-Za-z€$£¥₿%'’\s\u00a0\u202f+\-−()]/g, '');
        if (!/^[\d.,]+$/.test(cleaned) || !/\d/.test(cleaned)) continue;

        const lastComma = cleaned.lastIndexOf(',');
        const lastDot = cleaned.lastIndexOf('.');
        if (lastComma >= 0 && lastDot >= 0) {
            if (lastComma > lastDot) commaVotes++;
            else pointVotes++;
            continue;
        }

        const separator: DecimalSeparator | null = lastComma >= 0 ? ',' : lastDot >= 0 ? '.' : null;
        if (!separator) continue;
        const parts = cleaned.split(separator);
        if (parts.length > 2) continue; // repeated separator: thousands grouping
        if (isThreeDigitGroup(parts[0], parts[1])) {
            if (separator === ',') ambiguousCommas++;
            continue;
        }
        if (separator === ',') commaVotes++;
        else pointVotes++;
    }

    if (commaVotes > pointVotes) return ',';
    if (pointVotes > commaVotes) return '.';
    if (commaVotes === 0 && ambiguousCommas > 0 && delimiter === ';') return ',';
    return undefined;
}

/**
 * 'signed' when an amount column mixes negative and positive values (cash flow convention:
 * outflow negative). A column that is all positive or all negative carries no direction.
 */
export function detectAmountSignConvention(samples: string[]): 'signed' | 'unsigned' {
    let hasNegative = false;
    let hasPositive = false;
    for (const sample of samples) {
        const parsed = parseDecimal(sample);
        if (parsed === null) continue;
        const value = Number(parsed);
        if (value < 0) hasNegative = true;
        else if (value > 0) hasPositive = true;
    }
    return hasNegative && hasPositive ? 'signed' : 'unsigned';
}

export interface TypeResolutionInput {
    rawType: string;
    /** Parsed quantity, sign preserved */
    quantity: string | null;
    /** Parsed cash amount, sign preserved */
    amount: string | null;
    /** The amount column of the file mixes signs (see detectAmountSignConvention) */
    amountSigned: boolean;
    /** The row is about a currency, not a security (bank statement line) */
    isCashAsset: boolean;
}

export interface TypeResolution {
    type: TransactionType;
    /** Where the answer comes from: the type label, the sign of quantity/amount, or the BUY default */
    source: 'label' | 'sign' | 'default';
    /** The label was understood (false for an empty or unknown label) */
    recognized: boolean;
    /** Split, spin-off…: not supported as a journal entry */
    corporateAction: boolean;
}

const toSignedNumber = (value: string | null): number | null => {
    if (value === null || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

/**
 * Decide the transaction type of a row: the label first, then the signs of quantity and
 * amount, and BUY only as a last resort. A currency is never bought: its lines are deposits
 * and withdrawals.
 */
export function resolveTransactionType(input: TypeResolutionInput): TypeResolution {
    const { rawType, isCashAsset, amountSigned } = input;

    if (CORPORATE_ACTION_PATTERN.test(rawType.toLowerCase().trim())) {
        return { type: 'ADJUSTMENT', source: 'label', recognized: true, corporateAction: true };
    }

    const labelType = classifyLabel(rawType);
    if (labelType) {
        let type = labelType;
        if (isCashAsset && type === 'BUY') type = 'WITHDRAW';
        else if (isCashAsset && type === 'SELL') type = 'DEPOSIT';
        return { type, source: 'label', recognized: true, corporateAction: false };
    }

    const quantity = toSignedNumber(input.quantity);
    const amount = toSignedNumber(input.amount);

    if (isCashAsset) {
        if (amount !== null && amount < 0) return { type: 'WITHDRAW', source: 'sign', recognized: false, corporateAction: false };
        return { type: 'DEPOSIT', source: amountSigned && amount !== null && amount > 0 ? 'sign' : 'default', recognized: false, corporateAction: false };
    }

    if (quantity !== null && quantity !== 0) {
        // Cash-flow convention: a positive amount in a signed column is money coming in
        const isSell = quantity < 0 || (amountSigned && amount !== null && amount > 0);
        return { type: isSell ? 'SELL' : 'BUY', source: 'sign', recognized: false, corporateAction: false };
    }
    if (amount !== null && amount < 0) return { type: 'BUY', source: 'sign', recognized: false, corporateAction: false };
    if (amountSigned && amount !== null && amount > 0) return { type: 'SELL', source: 'sign', recognized: false, corporateAction: false };

    return { type: 'BUY', source: 'default', recognized: false, corporateAction: false };
}
