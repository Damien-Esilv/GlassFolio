import { Position, PositionFilter, Transaction } from '../../types';
import { db, delay } from './db';
import { convertToLegacyTransaction } from './transformers';

export const portfolioService = {
    getPositions: async (filter?: PositionFilter): Promise<Position[]> => {
        await delay(100);
        let positions = db.getPositions();

        if (filter) {
            positions = positions.filter(p => {
                const matchesType = !filter.type || filter.type === 'All' || p.type === filter.type;
                const matchesSource = !filter.source || filter.source === 'All' || p.source === filter.source;
                const matchesCurrency = !filter.currency || filter.currency === 'All' || p.currency === filter.currency;
                const matchesSearch = !filter.searchQuery ||
                    p.symbol.toLowerCase().includes(filter.searchQuery.toLowerCase()) ||
                    p.instrument.toLowerCase().includes(filter.searchQuery.toLowerCase());

                return matchesType && matchesSource && matchesCurrency && matchesSearch;
            });
        }
        return positions;
    },

    recalculatePositions: async (newTxs?: Transaction[]): Promise<void> => {
        // Fetch ALL transactions to rebuild positions accurately
        const unifiedTxs = db.getUnifiedTransactions();
        const accounts = db.getAccounts();
        const institutes = db.getInstitutes();

        const convertedTxs = unifiedTxs.map(tx =>
            convertToLegacyTransaction(tx, accounts, institutes)
        );
        const legacyTxs = db.getTransactions();
        const allTxs = [...convertedTxs, ...legacyTxs];

        // Sort by date ascending
        allTxs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Group by Symbol + Source to keep positions separated by broker
        const positionMap = new Map<string, Position>();

        for (const tx of allTxs) {
            if (!tx.symbol) continue;

            const key = `${tx.symbol}-${tx.source || 'Unknown'}`;

            let pos = positionMap.get(key);
            if (!pos) {
                pos = {
                    id: `pos-${Math.random().toString(36).substr(2, 9)}`,
                    instrument: tx.instrument,
                    symbol: tx.symbol,
                    quantity: 0,
                    avgCost: 0,
                    lastPrice: tx.price,
                    marketValue: 0,
                    unrealizedPL: 0,
                    unrealizedPLPercent: 0,
                    currency: tx.currency,
                    type: tx.assetClass || 'Equity',
                    source: tx.source,
                    bankName: tx.bankName,
                    accountName: tx.accountName
                };
            }

            // Simple FIFO/AvgCost Logic
            // Note: This matches the simplified logic common in MVP portfolio trackers
            if (tx.type === 'Buy' || tx.type === 'Deposit') {
                const totalCost = (pos.quantity * pos.avgCost) + (tx.amount * tx.price);
                const totalQty = pos.quantity + tx.amount;

                if (totalQty > 0) {
                    pos.avgCost = totalCost / totalQty;
                }
                pos.quantity = totalQty;
                pos.lastPrice = tx.price > 0 ? tx.price : pos.lastPrice;
            } else if (tx.type === 'Sell' || tx.type === 'Withdrawal') {
                pos.quantity -= tx.amount;
                if (tx.price > 0) pos.lastPrice = tx.price;
            }

            // Ensure quantity doesn't go negative (data errors)
            if (pos.quantity < 0) pos.quantity = 0;

            positionMap.set(key, pos);
        }

        // Filter zero positions
        const positions = Array.from(positionMap.values())
            .filter(p => p.quantity > 0.000001);

        // Calculate PL
        positions.forEach(p => {
            p.marketValue = p.quantity * p.lastPrice;
            p.unrealizedPL = p.marketValue - (p.quantity * p.avgCost);
            const invested = p.quantity * p.avgCost;
            p.unrealizedPLPercent = invested > 0 ? (p.unrealizedPL / invested) * 100 : 0;
        });

        // Save calculated positions to DB (cache)
        db.savePositions(positions);
    },

    getDashboardSummary: async (): Promise<any> => {
        await delay(300);
        const positions = db.getPositions();

        const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
        const totalInvested = positions.reduce((sum, p) => sum + (p.quantity * p.avgCost), 0);
        const totalPL = totalValue - totalInvested;
        const plPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

        // Generate dummy chart data based on current value mostly being steady with some volatility
        // In a real app, this would come from historical snapshots
        const chartData = Array.from({ length: 30 }, (_, i) => {
            const volatility = (Math.random() - 0.5) * 0.02; // 2% daily volatility
            return {
                name: `Day ${i + 1}`,
                value: totalValue * (1 - (0.01 * (30 - i))) * (1 + volatility)
            };
        });

        return {
            totalValue,
            totalCost: totalInvested,
            totalPL,
            plPercent,
            chartData
        };
    }
};
