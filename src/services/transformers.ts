import { Transaction } from '../types';
import { UnifiedTransaction, Account, Institute, Instrument, InstrumentType } from '../types';
import { db } from './db';
import { resolveQuantity } from './portfolio/positionLedger';

/**
 * Map InstrumentType to legacy asset class
 */
function instrumentTypeToAssetClass(type: InstrumentType): 'Equity' | 'ETF' | 'Crypto' | 'Cash' {
    switch (type) {
        case 'stock': return 'Equity';
        case 'etf': return 'ETF';
        case 'fund': return 'ETF';
        case 'crypto': return 'Crypto';
        case 'cash': return 'Cash';
        case 'bond': return 'Equity';
        case 'other': return 'Equity';
        default: return 'Equity';
    }
}

/**
 * Helper to lookup entity by ID from either Map<string, T> or T[]
 */
function lookupEntity<T extends { id: string }>(
    container: T[] | Map<string, T> | undefined,
    id: string | undefined
): T | undefined {
    if (!id || !container) return undefined;
    if (container instanceof Map) return container.get(id);
    return container.find(x => x.id === id);
}

/**
 * Convert UnifiedTransaction to legacy Transaction format.
 * Uses the Instrument entity for asset classification and symbol resolution.
 * Supports pre-built Map lookups or arrays for O(1) performance during batch conversions.
 */
export function convertToLegacyTransaction(
    unified: UnifiedTransaction,
    accounts: Account[] | Map<string, Account>,
    institutes: Institute[] | Map<string, Institute>,
    instruments?: Instrument[] | Map<string, Instrument>
): Transaction {
    // Find account and institute for source info using O(1) Map lookup when available
    let account = lookupEntity(accounts, unified.accountId);
    if (!account) {
        account = lookupEntity(accounts, unified.batchId);
    }
    const institute = account ? lookupEntity(institutes, account.instituteId) : null;

    // Resolve instrument for asset classification
    let instrument: Instrument | undefined;
    if (unified.instrumentId) {
        instrument = instruments
            ? lookupEntity(instruments, unified.instrumentId)
            : db.getInstrumentById(unified.instrumentId);
    }

    // Map UnifiedTransaction type to legacy type
    const typeMap: Record<string, string> = {
        'BUY': 'Buy',
        'SELL': 'Sell',
        'DEPOSIT': 'Deposit',
        'WITHDRAW': 'Withdrawal',
        'INCOME': 'Deposit',
        'EXPENSE': 'Fee',
        'TRANSFER': 'Transfer',
        'SWAP': 'Buy',
        'ADJUSTMENT': 'Other',
        'BALANCE_ADJUSTMENT': 'Other',
        'SNAPSHOT_ADJUSTMENT': 'Other'
    };

    // Asset class from instrument type (no hardcoded symbol lists)
    const assetClass = instrument
        ? instrumentTypeToAssetClass(instrument.type)
        : 'Equity';

    const symbol = instrument?.marketIdentifier.symbol || unified.assetSymbol || '';

    const qty = resolveQuantity(unified);
    const price = parseFloat(unified.priceUnit || '0');
    const amount = parseFloat(unified.amountPrimary || '0');
    const fee = parseFloat(unified.feeAmount || '0');

    return {
        id: unified.id,
        date: unified.transactionDate.split('T')[0],
        source: institute?.name || 'Import',
        type: (typeMap[unified.type] || 'Buy') as 'Buy' | 'Sell' | 'Deposit' | 'Withdrawal',
        instrument: instrument?.name || unified.label || symbol || 'Unknown',
        symbol,
        amount: Math.abs(qty),
        price: price || (qty !== 0 ? Math.abs(amount / qty) : 0),
        total: Math.abs(amount),
        fees: Math.abs(fee),
        currency: instrument?.denominationCurrency || unified.feeAsset || 'USD',
        assetClass,
        status: 'Completed',
        bankName: institute?.name,
        accountName: account?.name
    };
}
