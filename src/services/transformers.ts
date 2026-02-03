import { Transaction } from '../../types';
import { UnifiedTransaction, Account, Institute } from '../types';

/**
 * Convert UnifiedTransaction to legacy Transaction format
 * This provides backward compatibility with existing UI components
 */
export function convertToLegacyTransaction(
    unified: UnifiedTransaction,
    accounts: Account[],
    institutes: Institute[]
): Transaction {
    // Find account and institute for source info
    let account = accounts.find(a => a.id === unified.accountId);
    if (!account) {
        // Fallback for legacy data (though batchId shouldn't be accountId usually)
        account = accounts.find(a => a.id === unified.batchId);
    }
    const institute = account ? institutes.find(i => i.id === account.instituteId) : null;

    // Map UnifiedTransaction type to legacy type
    const typeMap: Record<string, string> = {
        'BUY': 'Buy',
        'SELL': 'Sell',
        'DEPOSIT': 'Deposit',
        'WITHDRAWAL': 'Withdrawal',
        'DIVIDEND': 'Dividend',
        'INTEREST': 'Interest',
        'FEE': 'Fee',
        'TRANSFER_IN': 'Transfer',
        'TRANSFER_OUT': 'Transfer',
        'STAKING_REWARD': 'Deposit',
        'AIRDROP': 'Deposit',
        'OTHER': 'Other'
    };

    // Determine asset class from symbol/isin
    let assetClass = 'Equity';
    const symbol = unified.assetSymbol?.toUpperCase() || '';
    if (['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'XRP', 'SOL', 'ADA', 'DOGE'].includes(symbol)) {
        assetClass = 'Crypto';
    } else if (['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'].includes(symbol)) {
        assetClass = 'Cash';
    } else if (unified.assetIsin) {
        assetClass = 'ETF'; // ISINs are typically for ETFs/stocks
    }

    const qty = parseFloat(unified.quantity || unified.amountPrimary || '0');
    const price = parseFloat(unified.priceUnit || '0');
    const amount = parseFloat(unified.amountPrimary || '0');
    const fee = parseFloat(unified.feeAmount || '0');

    return {
        id: unified.id,
        date: unified.transactionDate.split('T')[0], // Format: YYYY-MM-DD
        source: institute?.name || 'Import',
        type: (typeMap[unified.type] || 'Buy') as 'Buy' | 'Sell' | 'Deposit' | 'Withdrawal',
        instrument: unified.label || unified.assetSymbol || unified.assetIsin || 'Unknown',
        symbol: unified.assetSymbol || unified.assetIsin || '',
        amount: Math.abs(qty),
        price: price || (qty !== 0 ? Math.abs(amount / qty) : 0),
        total: Math.abs(amount),
        fees: Math.abs(fee),
        currency: unified.feeAsset || 'USD',
        assetClass: assetClass as 'Equity' | 'ETF' | 'Crypto' | 'Cash',
        status: 'Completed',
        bankName: institute?.name,
        accountName: account?.name
    };
}
