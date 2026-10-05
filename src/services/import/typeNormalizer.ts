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
 * Parse date with format detection
 */
export function parseDate(dateStr: string, formatHint?: string): string | null {
    if (!dateStr || dateStr.trim() === '') return null;

    const cleaned = dateStr.trim();

    // Try ISO format first
    if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
        const date = new Date(cleaned);
        if (!isNaN(date.getTime())) {
            return date.toISOString();
        }
    }

    // Try DD/MM/YYYY format (European)
    const euroMatch = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(.*)$/);
    if (euroMatch) {
        const [, day, month, year, rest] = euroMatch;
        let time = '00:00:00';
        const timeMatch = rest.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
        if (timeMatch) {
            time = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3] || '00'}`;
        }
        const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time}Z`);
        if (!isNaN(date.getTime())) {
            return date.toISOString();
        }
    }

    // Try MM/DD/YYYY format (US)
    const usMatch = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(.*)$/);
    if (usMatch && formatHint === 'MM/DD/YYYY') {
        const [, month, day, year, rest] = usMatch;
        let time = '00:00:00';
        const timeMatch = rest.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
        if (timeMatch) {
            time = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3] || '00'}`;
        }
        const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time}Z`);
        if (!isNaN(date.getTime())) {
            return date.toISOString();
        }
    }

    // Fallback
    const fallback = new Date(cleaned);
    if (!isNaN(fallback.getTime())) {
        return fallback.toISOString();
    }

    return null;
}

/**
 * Parse decimal with format detection
 */
export function parseDecimal(value: string | undefined): string | null {
    if (!value || value.trim() === '') return null;

    // Remove currency symbols, non-breaking spaces, and whitespace first
    let cleaned = value.trim().replace(/[€$£¥\s\u00a0]/g, '');

    // European format (1.234,56 -> 1234.56)
    if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(cleaned)) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
    // Simple comma decimal (1234,56 -> 1234.56)
    else if (/^-?\d+,\d+$/.test(cleaned)) {
        cleaned = cleaned.replace(',', '.');
    }
    // US format with thousand separators (1,234.56 -> 1234.56)
    else if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(cleaned)) {
        cleaned = cleaned.replace(/,/g, '');
    }

    const num = parseFloat(cleaned);
    if (isNaN(num)) return null;

    return num.toString();
}
