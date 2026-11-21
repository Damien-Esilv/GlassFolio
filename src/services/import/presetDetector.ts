/**
 * Preset Detector for CSV Imports
 * 
 * Auto-detects well-known broker & exchange export formats:
 * Binance, BoursoBank, Trade Republic, Bitpanda, Kraken, Coinbase, Bitget, Revolut.
 *
 * The first preset in `PRESET_PATTERNS` order that matches wins, so a format whose headers
 * contain another preset's patterns must come before it (Bitpanda before Coinbase).
 */

import { FieldMappings } from './types';
import { matchHistoryColumns } from './columnMatcher';

export const PRESET_PATTERNS: Record<string, string[]> = {
    'Binance': ['UTC_Time', 'Account', 'Operation', 'Coin', 'Change', 'Remark'],
    'Binance-Spot': ['Date(UTC)', 'Pair', 'Side', 'Price', 'Executed', 'Amount', 'Fee'],
    'Bitget': ['Time', 'Symbol', 'Side', 'Price', 'Filled', 'Total', 'Fee'],
    // Bitget UI Spot Order History export (2024-2025)
    'Bitget-Spot': ['Date', 'Order ID', 'Trading pair', 'Direction', 'Executed quantity', 'Average price', 'Trading volume', 'Fee'],
    'Bourso': ['dateOp', 'dateVal', 'label', 'amount', 'accountBalance'],
    // Legacy French BoursoBank export headers
    'BoursoBank-Alt': ['Date opération', 'Date valeur', 'Libellé', 'Montant', 'Solde'],
    'TradeRepublic': ['Date', 'Type', 'ISIN', 'Name', 'Shares', 'Price', 'Amount'],
    // Bitpanda transaction history (crypto, stocks, ETFs, metals). Its Timestamp / Transaction Type /
    // Asset columns also satisfy the Coinbase patterns: it must stay before Coinbase.
    'Bitpanda': ['Transaction ID', 'Timestamp', 'Transaction Type', 'In/Out', 'Amount Fiat', 'Amount Asset',
        'Asset market price', 'Asset class', 'Fee asset', 'Spread Currency'],
    'Coinbase': ['Timestamp', 'Transaction Type', 'Asset', 'Quantity Transacted'],
    'Kraken': ['txid', 'time', 'type', 'pair', 'price', 'vol', 'fee'],
    // Revolut stocks & ETF account statement
    'Revolut': ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'],
    // Revolut crypto account statement: amounts carry their currency ("9,94 CHF"), no currency column
    'Revolut-Crypto': ['Symbol', 'Type', 'Quantity', 'Price', 'Value', 'Fees', 'Date'],
    // GlassFolio's own transactions CSV export (kept last so broker formats win).
    'GlassFolio': ['instrument', 'symbol', 'amount', 'price', 'total', 'fees', 'status', 'currency', 'source']
};

/**
 * Exact headers (case-insensitive) a preset cannot be detected without. The 60 % rule alone would
 * let short, generic layouts — Revolut's crypto statement is just Symbol/Type/Quantity/Price/Value/
 * Fees/Date — claim any hand-made CSV with similar columns.
 */
const PRESET_REQUIRED_HEADERS: Record<string, string[]> = {
    'Bitget-Spot': ['trading pair', 'direction'],
    'Bitpanda': ['in/out', 'amount fiat', 'amount asset'],
    'Revolut': ['ticker', 'price per share', 'total amount'],
    'Revolut-Crypto': ['symbol', 'value', 'fees']
};

const GLASSFOLIO_EXPORT_MARKERS = ['operation', 'instrument', 'symbol', 'total', 'fees'];

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
        // The fee is paid in the coin itself: not a cash cost
        feeAsset: ['Coin'],
        rawLabel: ['Remark']
    },
    'Binance-Spot': {
        transactionDate: ['Date(UTC)'],
        type: ['Side'],
        assetSymbol: ['Pair', 'Market'],
        priceUnit: ['Price'],
        quantity: ['Executed', 'Filled', 'Quantity'],
        amountPrimary: ['Amount', 'Total'],
        feeAmount: ['Fee']
    },
    'Bitget': {
        externalId: ['Order ID', 'Trade ID'],
        transactionDate: ['Time'],
        type: ['Side'],
        assetSymbol: ['Symbol'],
        priceUnit: ['Price'],
        quantity: ['Filled', 'Qty'],
        amountPrimary: ['Total', 'Total_USDT', 'Trading Volume'],
        feeAmount: ['Fee'],
        feeAsset: ['Fee_Ccy', 'Fee Coin', 'Fee Currency']
    },
    'Bitget-Spot': {
        externalId: ['Order ID'],
        transactionDate: ['Date'],
        type: ['Direction'],
        assetSymbol: ['Trading pair'],
        priceUnit: ['Average price', 'Price'],
        quantity: ['Executed quantity', 'Amount'],
        amountPrimary: ['Trading volume', 'Total'],
        feeAmount: ['Fee'],
        feeAsset: ['Fee Coin', 'Fee Currency']
    },
    'Bourso': {
        transactionDate: ['dateOp'],
        valueDate: ['dateVal'],
        rawLabel: ['label'],
        label: ['comment'],
        amountPrimary: ['amount'],
        balanceAfter: ['accountBalance', 'accountbalance'],
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
    // Supports both legacy CSV exports (Date, ISIN, Shares) and 2025 native snake_case exports (datetime, symbol, shares)
    'TradeRepublic': {
        externalId: ['transaction_id', 'Transaction ID'],
        transactionDate: ['datetime', 'Date', 'date'],
        type: ['Type', 'type'],
        assetIsin: ['ISIN', 'isin'],
        assetSymbol: ['Symbol', 'symbol'],
        assetName: ['Name', 'name'],
        quantity: ['Shares', 'shares', 'Quantity', 'quantity'],
        priceUnit: ['Price', 'price'],
        amountPrimary: ['Amount', 'amount'],
        feeAmount: ['Fee', 'fee'],
        taxAmount: ['Tax', 'tax'],
        currency: ['Currency', 'currency']
    },
    // Bitpanda: "Amount Fiat" is the cash value, "Amount Asset" the units; missing values are "-".
    // The fee may be paid in BEST or in the asset itself, hence "Fee asset".
    'Bitpanda': {
        externalId: ['Transaction ID'],
        transactionDate: ['Timestamp'],
        type: ['Transaction Type'],
        assetSymbol: ['Asset'],
        quantity: ['Amount Asset'],
        priceUnit: ['Asset market price'],
        amountPrimary: ['Amount Fiat'],
        feeAmount: ['Fee'],
        feeAsset: ['Fee asset'],
        taxAmount: ['Tax Fiat'],
        currency: ['Fiat']
    },
    'Coinbase': {
        externalId: ['ID'],
        transactionDate: ['Timestamp'],
        type: ['Transaction Type'],
        assetSymbol: ['Asset'],
        quantity: ['Quantity Transacted'],
        priceUnit: ['Spot Price at Transaction', 'Price at Transaction', 'Spot Price'],
        amountPrimary: ['Subtotal', 'Total (inclusive of fees and/or spread)'],
        feeAmount: ['Fees and/or Spread', 'Fees'],
        currency: ['Price Currency', 'Spot Price Currency'],
        rawLabel: ['Notes']
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
    },
    // Revolut stocks: "Total Amount" includes fees; values may carry a currency code ("USD 125.07")
    'Revolut': {
        transactionDate: ['Date'],
        type: ['Type'],
        assetSymbol: ['Ticker'],
        quantity: ['Quantity'],
        priceUnit: ['Price per share'],
        amountPrimary: ['Total Amount'],
        currency: ['Currency']
    },
    'Revolut-Crypto': {
        transactionDate: ['Date'],
        type: ['Type'],
        assetSymbol: ['Symbol'],
        quantity: ['Quantity'],
        priceUnit: ['Price'],
        amountPrimary: ['Value'],
        feeAmount: ['Fees']
    },
    'GlassFolio': {
        externalId: ['id'],
        transactionDate: ['date'],
        type: ['operation', 'type'],
        assetSymbol: ['symbol'],
        assetName: ['instrument'],
        rawLabel: ['instrument'],
        priceUnit: ['price'],
        quantity: ['amount'],
        amountPrimary: ['total'],
        feeAmount: ['fees'],
        currency: ['currency']
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

    // GlassFolio's own export is recognised first: its generic column names (date, type, price, amount…)
    // would otherwise be mistaken for a broker format. `operation` is unique to it.
    if (GLASSFOLIO_EXPORT_MARKERS.every(marker => lowerHeaders.includes(marker))) {
        return { presetName: 'GlassFolio', mappings: getPresetMappings('GlassFolio', headers) };
    }

    for (const [presetName, patterns] of Object.entries(PRESET_PATTERNS)) {
        const required = PRESET_REQUIRED_HEADERS[presetName] || [];
        if (!required.every(header => lowerHeaders.includes(header))) continue;

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
