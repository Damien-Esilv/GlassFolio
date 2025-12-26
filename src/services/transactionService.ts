import { Transaction, TransactionFilter } from '../../types';
import { db, delay } from './db';
import { portfolioService } from './portfolioService';

export const transactionService = {
    getTransactions: async (filter?: TransactionFilter): Promise<Transaction[]> => {
        await delay(300); // Simulate network latency
        let transactions = db.getTransactions();

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
        const currentTransactions = db.getTransactions();
        const updatedTransactions = [...newTxs, ...currentTransactions];
        db.saveTransactions(updatedTransactions);

        // Trigger position recalculation logic
        // In a real backend, this would likely be a queued job or a transaction
        await portfolioService.recalculatePositions(newTxs);
    },

    checkDuplicates: async (limit = 1000): Promise<Transaction[]> => {
        // Return a lightweight list for checking duplicates (or check internally)
        // For this implementation, we'll just expose getTransactions for client-side check 
        // OR implement the specific check here.

        // Let's implement the specific check needed by ImportWizard if needed, 
        // but ImportWizard logic was fairly complex client-side.
        // Better: Return all transactions so client can check (or emulate a "checkBatch" endpoint).

        return db.getTransactions();
    }
};
