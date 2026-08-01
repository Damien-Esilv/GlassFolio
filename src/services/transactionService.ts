import { Transaction, TransactionFilter } from '../../types';
import { UnifiedTransaction, Account, Institute, TransactionType } from '../types';
import { db, delay } from './db';
import { portfolioService } from './portfolioService';
import { convertToLegacyTransaction } from './transformers';
import { instrumentService } from './instrumentService';

export const transactionService = {
    getTransactions: async (filter?: TransactionFilter): Promise<Transaction[]> => {
        await delay(200);

        // Read from UnifiedTransaction storage (new imports)
        const unifiedTxs = db.getUnifiedTransactions();
        const accounts = db.getAccounts();
        const institutes = db.getInstitutes();

        // Convert to legacy format
        let transactions = unifiedTxs.map(tx =>
            convertToLegacyTransaction(tx, accounts, institutes)
        );

        if (filter) {
            transactions = transactions.filter(tx => {
                if (filter.searchQuery) {
                    const query = filter.searchQuery.toLowerCase();
                    const matches =
                        tx.instrument.toLowerCase().includes(query) ||
                        tx.symbol.toLowerCase().includes(query) ||
                        tx.id.toLowerCase().includes(query);
                    if (!matches) return false;
                }

                if (filter.dateRange && filter.dateRange !== 'All') {
                    const txDate = new Date(tx.date);
                    const now = new Date();
                    const diffTime = Math.abs(now.getTime() - txDate.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (filter.dateRange === 'Last 30 Days' && diffDays > 30) return false;
                    if (filter.dateRange === 'Last 90 Days' && diffDays > 90) return false;
                    if (filter.dateRange === 'YTD' && txDate.getFullYear() !== now.getFullYear()) return false;
                }

                if (filter.assetClass && filter.assetClass !== 'All') {
                    if (filter.assetClass === 'Equities' && tx.assetClass !== 'Equity') return false;
                    if (filter.assetClass === 'ETFs' && tx.assetClass !== 'ETF') return false;
                    if (filter.assetClass === 'Crypto' && tx.assetClass !== 'Crypto') return false;
                }

                if (filter.side && filter.side !== 'All' && tx.type !== filter.side) return false;
                if (filter.source && filter.source !== 'All' && tx.source !== filter.source) return false;
                if (filter.currency && filter.currency !== 'All' && tx.currency !== filter.currency) return false;
                if (filter.status && filter.status !== 'All' && tx.status !== filter.status) return false;

                return true;
            });
        }

        return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },

    addTransactions: async (newTxs: Transaction[]): Promise<void> => {
        await delay(500);

        const accounts = db.getAccounts();
        const defaultAccount = accounts[0]?.id || 'acc-bourso-cto';
        const now = new Date().toISOString();

        const newUnifiedTxs: UnifiedTransaction[] = await Promise.all(newTxs.map(async (tx) => {
            // Find or create instrument
            const instrument = await instrumentService.findOrCreateInstrument({
                symbol: tx.symbol,
                name: tx.instrument
            });

            const typeMap: Record<string, TransactionType> = {
                'Buy': 'BUY',
                'Sell': 'SELL',
                'Deposit': 'DEPOSIT',
                'Withdrawal': 'WITHDRAW'
            };

            const type: TransactionType = typeMap[tx.type] || 'BUY';

            return {
                id: tx.id || `utx-manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                ownerId: 'default-user',
                accountId: defaultAccount,
                instrumentId: instrument.id,
                batchId: 'batch-manual',
                rowHash: `hash-manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                sourceOrigin: 'MANUAL',
                isSynthetic: false,
                isFiscal: true,
                sourceMode: 'history',
                transactionDate: tx.date.includes('T') ? tx.date : `${tx.date}T12:00:00Z`,
                type,
                rawType: tx.type,
                label: tx.instrument,
                rawLabel: tx.instrument,
                amountPrimary: tx.type === 'Sell' || tx.type === 'Withdrawal' ? (-tx.total).toString() : tx.total.toString(),
                assetSymbol: tx.symbol,
                priceUnit: tx.price.toString(),
                quantity: tx.amount.toString(),
                feeAmount: tx.fees.toString(),
                createdAt: now,
                updatedAt: now,
                version: 1
            };
        }));

        const currentUnified = db.getUnifiedTransactions();
        db.saveUnifiedTransactions([...newUnifiedTxs, ...currentUnified]);

        // Trigger position recalculation logic
        await portfolioService.recalculatePositions();
    },

    checkDuplicates: async (limit = 1000): Promise<Transaction[]> => {
        // Return all transactions for duplicate checking
        const unified = db.getUnifiedTransactions();
        const accounts = db.getAccounts();
        const institutes = db.getInstitutes();

        return unified.map(tx => convertToLegacyTransaction(tx, accounts, institutes));
    }
};

