import { Position, PositionFilter, DashboardSummary, Transaction } from '../../types';
import { db, delay } from './db';
import { dashboardChartData } from '../../mockData';

export const portfolioService = {
    getPositions: async (filter?: PositionFilter): Promise<Position[]> => {
        await delay(300);
        let positions = db.getPositions();

        if (filter) {
            positions = positions.filter(p => {
                if (filter.type && filter.type !== 'All') {
                    if (filter.type === 'Equities' && p.type !== 'Equity') return false;
                    if (filter.type === 'ETFs' && p.type !== 'ETF') return false;
                    // Note: Mock data 'Crypto' matches type exactly, unlike 'Equities' which maps to 'Equity'
                    if (filter.type === 'Crypto' && p.type !== 'Crypto') return false;
                    if (filter.type === 'Cash' && p.type !== 'Cash') return false;
                }

                if (filter.searchQuery) {
                    const query = filter.searchQuery.toLowerCase();
                    const matches =
                        p.instrument.toLowerCase().includes(query) ||
                        p.symbol.toLowerCase().includes(query) ||
                        (p.bankName && p.bankName.toLowerCase().includes(query));
                    if (!matches) return false;
                }

                if (filter.source && filter.source !== 'All' && p.source !== filter.source) return false;
                if (filter.currency && filter.currency !== 'All' && p.currency !== filter.currency) return false;

                return true;
            });
        }

        return positions;
    },

    getDashboardSummary: async (): Promise<DashboardSummary> => {
        await delay(400); // Slightly longer for "calculation"
        const positions = db.getPositions(); // fetching raw to calculate

        const totalValue = positions.reduce((acc, pos) => acc + pos.marketValue, 0);
        const totalCost = positions.reduce((acc, pos) => acc + (pos.quantity * pos.avgCost), 0);
        const totalPL = totalValue - totalCost;
        const plPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

        // --- Chart Data Logic (Migrated from Dashboard.tsx) ---
        // In a real app, this would query historical data table
        const baseData = dashboardChartData;
        // Scale mock data so the last point matches current totalValue
        const lastMockValue = baseData[baseData.length - 1].value;
        const scaleFactor = totalValue / (lastMockValue || 1);

        const chartData = baseData.map(d => ({
            ...d,
            value: d.value * scaleFactor * (1 + (Math.random() * 0.02 - 0.01))
        }));

        return {
            totalValue,
            totalCost,
            totalPL,
            plPercent,
            chartData
        };
    },

    recalculatePositions: async (newTxs: Transaction[]): Promise<void> => {
        // This is the logic migrated from DataContext.addTransactions
        // It runs server-side (conceptually) to update the Positions table

        const currentPositions = [...db.getPositions()];

        newTxs.forEach(tx => {
            const isBuy = tx.type === 'Buy' || tx.type === 'Deposit';
            const isSell = tx.type === 'Sell' || tx.type === 'Withdrawal';
            if (!isBuy && !isSell) return;

            // Find existing position matching symbol AND (if cash) bank/account
            const existingIdx = currentPositions.findIndex(p => {
                if (p.type === 'Cash' && tx.assetClass === 'Cash') {
                    // Strict match for cash accounts
                    return p.symbol === tx.symbol && p.bankName === tx.bankName && p.accountName === tx.accountName;
                }
                return p.symbol === tx.symbol;
            });

            const qtyChange = isBuy ? tx.amount : -tx.amount;

            if (existingIdx >= 0) {
                const pos = currentPositions[existingIdx];
                const newQty = Math.max(0, pos.quantity + qtyChange);
                let newAvgCost = pos.avgCost;
                if (isBuy && newQty > 0) {
                    const totalCost = (pos.quantity * pos.avgCost) + (tx.amount * tx.price);
                    newAvgCost = totalCost / (pos.quantity + tx.amount);
                }

                if (newQty === 0) {
                    currentPositions.splice(existingIdx, 1);
                } else {
                    currentPositions[existingIdx] = {
                        ...pos,
                        quantity: newQty,
                        avgCost: newAvgCost,
                        marketValue: newQty * tx.price,
                        unrealizedPL: (tx.price - newAvgCost) * newQty,
                        unrealizedPLPercent: newAvgCost > 0 ? ((tx.price - newAvgCost) / newAvgCost) * 100 : 0
                    };
                }
            } else if (isBuy) {
                let type: Position['type'] = 'Equity';
                if (tx.assetClass) type = tx.assetClass;
                else if (['BTC', 'ETH', 'SOL'].some(c => tx.symbol.includes(c))) type = 'Crypto';
                else if (tx.symbol === 'USD' || tx.symbol === 'EUR' || tx.type === 'Deposit') type = 'Cash';

                currentPositions.push({
                    id: Math.random().toString(36).substr(2, 9),
                    symbol: tx.symbol,
                    instrument: tx.instrument || tx.symbol,
                    quantity: tx.amount,
                    avgCost: tx.price,
                    lastPrice: tx.price,
                    marketValue: tx.amount * tx.price,
                    unrealizedPL: 0,
                    unrealizedPLPercent: 0,
                    currency: tx.currency,
                    type: type,
                    source: tx.source,
                    bankName: tx.bankName,
                    accountName: tx.accountName
                });
            }
        });

        db.savePositions(currentPositions);
    }
};
