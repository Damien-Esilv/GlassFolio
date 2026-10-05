/**
 * Preset Detector for CSV Imports
 * 
 * Auto-detects well-known broker & exchange export formats:
 * Binance, BoursoBank, Trade Republic, Kraken, Coinbase, Bitget.
 */

import { FieldMappings } from './types';

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
 * Get field mappings for a recognized preset
 */
export function getPresetMappings(presetName: string, headers: string[]): FieldMappings {
    const findHeader = (patterns: string[]): string => {
        for (const pattern of patterns) {
            const found = headers.find(h => h.toLowerCase().includes(pattern.toLowerCase()));
            if (found) return found;
        }
        return '';
    };

    switch (presetName) {
        case 'Binance':
            return {
                transactionDate: findHeader(['UTC_Time', 'time']),
                type: findHeader(['Operation', 'type']),
                rawType: findHeader(['Operation', 'type']),
                assetSymbol: findHeader(['Coin', 'asset']),
                amountPrimary: findHeader(['Change', 'amount']),
                rawLabel: findHeader(['Remark', 'note'])
            };

        case 'Bourso':
        case 'BoursoBank-Alt':
            return {
                transactionDate: findHeader(['dateOp', 'Date opération']),
                valueDate: findHeader(['dateVal', 'Date valeur']),
                rawLabel: findHeader(['label', 'Libellé']),
                amountPrimary: findHeader(['amount', 'Montant']),
                balanceAfter: findHeader(['accountBalance', 'Solde']),
                assetSymbol: 'EUR'
            };

        default:
            return {
                transactionDate: findHeader(['date', 'time', 'timestamp']),
                type: findHeader(['type', 'side', 'operation', 'action']),
                assetSymbol: findHeader(['symbol', 'asset', 'coin', 'ticker']),
                amountPrimary: findHeader(['amount', 'change', 'quantity', 'total']),
                priceUnit: findHeader(['price', 'prix']),
                feeAmount: findHeader(['fee', 'frais', 'commission'])
            };
    }
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
