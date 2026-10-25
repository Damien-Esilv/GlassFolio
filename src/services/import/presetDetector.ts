/**
 * Preset Detector for CSV Imports
 * 
 * Auto-detects well-known broker & exchange export formats:
 * Binance, BoursoBank, Trade Republic, Kraken, Coinbase, Bitget.
 */

import { FieldMappings } from './types';
import { matchHistoryColumns } from './columnMatcher';

export const PRESET_PATTERNS: Record<string, string[]> = {
    'Binance': ['UTC_Time', 'Account', 'Operation', 'Coin', 'Change', 'Remark'],
    'Binance-Spot': ['Date(UTC)', 'Pair', 'Side', 'Price', 'Executed', 'Amount', 'Fee'],
    'Bitget': ['Time', 'Symbol', 'Side', 'Price', 'Filled', 'Total', 'Fee'],
    'Bourso': ['dateOp', 'dateVal', 'label', 'amount', 'accountBalance'],
    'BoursoBank-Alt': ['Date opération', 'Date valeur', 'Libellé', 'Montant', 'Solde'],
    'TradeRepublic': ['Date', 'Type', 'ISIN', 'Name', 'Shares', 'Price', 'Amount'],
    'Coinbase': ['Timestamp', 'Transaction Type', 'Asset', 'Quantity Transacted'],
    'Kraken': ['txid', 'time', 'type', 'pair', 'price', 'vol', 'fee']
};

/**
 * Explicit per-broker overrides. Each entry lists candidate header names in
 * priority order; anything not listed is filled by the generic column matcher.
 */
const PRESET_OVERRIDES: Record<string, Partial<Record<keyof FieldMappings, string[]>>> = {
    // Binance statement: "Change" is a signed coin quantity, there is no price column
    'Binance': {
        transactionDate: ['UTC_Time'],
        type: ['Operation'],
        assetSymbol: ['Coin'],
        quantity: ['Change'],
        amountPrimary: ['Change'],
        rawLabel: ['Remark']
    },
    'Binance-Spot': {
        transactionDate: ['Date(UTC)'],
        type: ['Side'],
        assetSymbol: ['Pair'],
        priceUnit: ['Price'],
        quantity: ['Executed'],
        amountPrimary: ['Amount'],
        feeAmount: ['Fee']
    },
    'Bitget': {
        transactionDate: ['Time'],
        type: ['Side'],
        assetSymbol: ['Symbol'],
        priceUnit: ['Price'],
        quantity: ['Filled', 'Qty'],
        amountPrimary: ['Total'],
        feeAmount: ['Fee']
    },
    'Bourso': {
        transactionDate: ['dateOp'],
        valueDate: ['dateVal'],
        rawLabel: ['label'],
        amountPrimary: ['amount'],
        balanceAfter: ['accountBalance'],
        assetSymbol: ['devise', 'currency']
    },
    'BoursoBank-Alt': {
        transactionDate: ['Date opération'],
        valueDate: ['Date valeur'],
        rawLabel: ['Libellé'],
        amountPrimary: ['Montant'],
        balanceAfter: ['Solde'],
        assetSymbol: ['Devise']
    },
    'TradeRepublic': {
        transactionDate: ['Date'],
        type: ['Type'],
        assetIsin: ['ISIN'],
        assetName: ['Name'],
        quantity: ['Shares'],
        priceUnit: ['Price'],
        amountPrimary: ['Amount'],
        feeAmount: ['Fee'],
        taxAmount: ['Tax']
    },
    'Coinbase': {
        transactionDate: ['Timestamp'],
        type: ['Transaction Type'],
        assetSymbol: ['Asset'],
        quantity: ['Quantity Transacted'],
        priceUnit: ['Spot Price at Transaction', 'Price at Transaction'],
        amountPrimary: ['Subtotal'],
        feeAmount: ['Fees and/or Spread', 'Fees']
    },
    'Kraken': {
        externalId: ['txid'],
        transactionDate: ['time'],
        type: ['type'],
        assetSymbol: ['pair'],
        priceUnit: ['price'],
        quantity: ['vol'],
        amountPrimary: ['cost'],
        feeAmount: ['fee']
    }
};

/**
 * Get field mappings for a recognized preset.
 * Broker-specific overrides first, then the generic column matcher fills gaps
 * (quantity, ISIN, tax...) so no preset silently drops a field.
 */
export function getPresetMappings(presetName: string, headers: string[]): FieldMappings {
    const findExact = (candidates: string[]): string | undefined => {
        for (const candidate of candidates) {
            const found = headers.find(h => h.trim().toLowerCase() === candidate.toLowerCase());
            if (found) return found;
        }
        return undefined;
    };

    const matched = matchHistoryColumns(headers);
    const overrides = PRESET_OVERRIDES[presetName] || {};
    const result: Partial<FieldMappings> = { ...matched };

    (Object.keys(overrides) as (keyof FieldMappings)[]).forEach(field => {
        const header = findExact(overrides[field] || []);
        if (header) result[field] = header;
    });

    return {
        ...result,
        transactionDate: result.transactionDate ?? '',
        amountPrimary: result.amountPrimary ?? ''
    } as FieldMappings;
}

/**
 * Detect preset from headers using match heuristics (>= 60% patterns)
 */
export function detectPreset(headers: string[]): { presetName: string; mappings: FieldMappings } | null {
    if (!headers || headers.length === 0) return null;
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());

    for (const [presetName, patterns] of Object.entries(PRESET_PATTERNS)) {
        const matches = patterns.filter(p =>
            lowerHeaders.some(h => h.includes(p.toLowerCase()))
        );

        if (matches.length >= Math.ceil(patterns.length * 0.6)) {
            return {
                presetName,
                mappings: getPresetMappings(presetName, headers)
            };
        }
    }

    return null;
}
