import { Transaction, TransactionFilter } from '../../types';
import { UnifiedTransaction, Account, Institute, TransactionType } from '../types';
import { db, delay } from './db';
import { portfolioService } from './portfolioService';
import { convertToLegacyTransaction } from './transformers';
import { instrumentService } from './instrumentService';
import { isAssetClassMatch } from '../constants/assetClasses';
import { transactionRepository } from './repositories';

export const transactionService = {
    getTransactions: async (filter?: TransactionFilter): Promise<Transaction[]> => {
        await delay(200);

        // Read from UnifiedTransaction storage (new imports)
        const unifiedTxs = db.getUnifiedTransactions();
        const accounts = db.getAccounts();
        const institutes = db.getInstitutes();
        const instruments = db.getInstruments();

        // BOLT OPTIMIZATION:
        // Pre-build O(1) Map lookups for accounts, institutes, and instruments to avoid N repeated
        // localStorage reads/JSON parsing calls to db.getInstrumentById and O(N * M) array searches.
        const accountMap = new Map(accounts.map(a => [a.id, a]));
        const instituteMap = new Map(institutes.map(i => [i.id, i]));
        const instrumentMap = new Map(instruments.map(i => [i.id, i]));

        // Convert to legacy format
        let transactions = unifiedTxs.map(tx =>
            convertToLegacyTransaction(tx, accountMap, instituteMap, instrumentMap)
        );

        if (transactions.length === 0) {
            transactions = await transactionRepository.getAll();
        }

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
                    if (!isAssetClassMatch(tx.assetClass, filter.assetClass)) return false;
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

    checkDuplicates: async (_limit = 1000): Promise<Transaction[]> => {
        // Return all transactions for duplicate checking
        const unified = db.getUnifiedTransactions();
        const accounts = db.getAccounts();
        const institutes = db.getInstitutes();
        const instruments = db.getInstruments();

        const accountMap = new Map(accounts.map(a => [a.id, a]));
        const instituteMap = new Map(institutes.map(i => [i.id, i]));
        const instrumentMap = new Map(instruments.map(i => [i.id, i]));

        return unified.map(tx => convertToLegacyTransaction(tx, accountMap, instituteMap, instrumentMap));
    },

    /**
     * Update a single transaction in both Unified and Legacy stores
     */
    updateTransaction: async (updatedTx: Transaction): Promise<void> => {
        await delay(150);

        // 1. Find or create the instrument matching the updated symbol
        const instrument = await instrumentService.findOrCreateInstrument({
            symbol: updatedTx.symbol,
            name: updatedTx.instrument
        });

        // 2. Resolve accountId by first finding the institute from source name,
        //    then finding the account by accountName or falling back to first account of the institute.
        const accounts = db.getAccounts();
        const institutes = db.getInstitutes();

        // Find institute by matching its name to updatedTx.source
        const matchingInstitute = institutes.find(i =>
            updatedTx.source && (
                i.name.toLowerCase() === updatedTx.source.toLowerCase() ||
                updatedTx.source.toLowerCase().includes(i.name.toLowerCase()) ||
                i.name.toLowerCase().includes(updatedTx.source.toLowerCase())
            )
        );

        // Get accounts belonging to that institute
        const instituteAccounts = matchingInstitute
            ? accounts.filter(a => a.instituteId === matchingInstitute.id)
            : [];

        // Find account by matching accountName, or fall back to first account of the institute,
        // or fall back to first account of the source text match
        let matchingAccount = instituteAccounts.find(a =>
            updatedTx.accountName && a.name.toLowerCase() === updatedTx.accountName.toLowerCase()
        ) || instituteAccounts[0];

        // Last resort: find any account whose name loosely matches the source
        if (!matchingAccount) {
            matchingAccount = accounts.find(a =>
                updatedTx.source && a.name.toLowerCase().includes(updatedTx.source.toLowerCase())
            ) || accounts[0];
        }

        // 3. Update unified transactions — this is the source of truth
        const unifiedTxs = db.getUnifiedTransactions();
        const typeMap: Record<string, TransactionType> = {
            'Buy': 'BUY',
            'Sell': 'SELL',
            'Deposit': 'DEPOSIT',
            'Withdrawal': 'WITHDRAW'
        };

        const updatedUnified = unifiedTxs.map(u => {
            if (u.id === updatedTx.id) {
                return {
                    ...u,
                    instrumentId: instrument.id,
                    accountId: matchingAccount ? matchingAccount.id : u.accountId,
                    label: updatedTx.instrument,
                    rawLabel: updatedTx.instrument,
                    assetSymbol: updatedTx.symbol,
                    quantity: updatedTx.amount.toString(),
                    priceUnit: updatedTx.price.toString(),
                    feeAmount: updatedTx.fees.toString(),
                    amountPrimary: (updatedTx.total || (updatedTx.amount * updatedTx.price)).toString(),
                    type: typeMap[updatedTx.type] || u.type,
                    rawType: updatedTx.type,
                    transactionDate: updatedTx.date.includes('T') ? updatedTx.date : `${updatedTx.date}T12:00:00Z`,
                    updatedAt: new Date().toISOString()
                };
            }
            return u;
        });

        db.saveUnifiedTransactions(updatedUnified);

        // 4. Recalculate portfolio positions with the new instrument & ticker
        await portfolioService.recalculatePositions();
    }
};

