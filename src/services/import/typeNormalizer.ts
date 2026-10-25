/**
 * Type Normalizer for CSV Imports
 * 
 * Normalizes transaction types, sub-types, dates, and numeric values.
 */

import { TransactionType, TransactionSubType } from '../../types/types.backend';

/**
 * Normalize raw transaction type string to standard TransactionType.
 */
export function normalizeTransactionType(rawType: string): TransactionType {
    if (!rawType) return 'BUY';

    const lower = rawType.toLowerCase().trim();

    // Buy patterns
    if (lower.includes('buy') || lower.includes('achat') || lower.includes('purchase')) {
        return 'BUY';
    }

    // Sell patterns
    if (lower.includes('sell') || lower.includes('vente') || lower.includes('sold')) {
        return 'SELL';
    }

    // Deposit patterns
    if (lower.includes('deposit') || lower.includes('dépôt') || lower.includes('virement reçu') ||
        lower.includes('credit') || lower.includes('crédit') || lower.includes('versement')) {
        return 'DEPOSIT';
    }

    // Withdraw patterns
    if (lower.includes('withdraw') || lower.includes('retrait') || lower.includes('virement émis') ||
        lower.includes('debit') || lower.includes('débit')) {
        return 'WITHDRAW';
    }

    // Income patterns (dividends, interest, staking, cashback)
    if (lower.includes('dividend') || lower.includes('dividende') || lower.includes('interest') ||
        lower.includes('intérêt') || lower.includes('distribution') || lower.includes('staking') ||
        lower.includes('reward') || lower.includes('cashback') || lower.includes('saveback') ||
        lower.includes('airdrop') || lower.includes('mining')) {
        return 'INCOME';
    }

    // Expense patterns
    if (lower.includes('fee') || lower.includes('frais') || lower.includes('commission')) {
        return 'EXPENSE';
    }

    // Transfer patterns
    if (lower.includes('transfer') || lower.includes('virement') || lower.includes('send') ||
        lower.includes('receive') || lower.includes('envoi')) {
        return 'TRANSFER';
    }

    // Swap patterns
    if (lower.includes('swap') || lower.includes('exchange') || lower.includes('convert') ||
        lower.includes('small assets') || lower.includes('dust')) {
        return 'SWAP';
    }

    // Adjustment patterns
    if (lower.includes('adjust') || lower.includes('correction') || lower.includes('manual')) {
        return 'ADJUSTMENT';
    }

    return 'BUY';
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

/**
 * Resolve a number that contains a single kind of separator (only ',' or only '.').
 */
function resolveSingleSeparator(value: string, separator: ',' | '.'): string | null {
    const parts = value.split(separator);
    if (parts.length > 2) {
        // Repeated separator can only be a thousands separator: 1.234.567 / 1,234,567
        if (parts.slice(1).every(p => p.length === 3) && parts[0].length >= 1 && parts[0].length <= 3) {
            return parts.join('');
        }
        return null;
    }
    const [intPart, fracPart] = parts;
    if (separator === ',' && fracPart.length === 3 && intPart.length >= 1 && intPart.length <= 3 && !/^0+$/.test(intPart)) {
        // "1,234" — historically treated as US thousands grouping
        return intPart + fracPart;
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
 */
export function parseDecimal(value: string | undefined): string | null {
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
        normalized = resolveSingleSeparator(cleaned, ',');
    } else if (lastDot >= 0) {
        normalized = resolveSingleSeparator(cleaned, '.');
    } else {
        normalized = cleaned;
    }

    if (normalized === null) return null;
    const num = Number(normalized);
    if (!Number.isFinite(num)) return null;

    return (negative && num !== 0 ? -num : num).toString();
}
