import { Position, PositionFilter, Transaction, DashboardSummary } from '../../types';
import { db, delay } from './db';
import { convertToLegacyTransaction } from './transformers';
import { refreshPositionPrices } from './priceService';
import { currencyService } from './currencyService';
import { formatChartDate, DateFormatPattern } from '../../utils/date';
import { isAssetClassMatch } from '../constants/assetClasses';

export const portfolioService = {
    getPositions: async (filter?: PositionFilter): Promise<Position[]> => {
        await delay(100);
        let allPositions = db.getPositions();

        // Refresh live prices from Yahoo Finance on ALL positions (15-min cache)
        allPositions = await refreshPositionPrices(allPositions);

        // Persist updated prices for all positions (never save filtered subset)
        db.savePositions(allPositions);

        if (!filter) {
            return allPositions;
        }

        return allPositions.filter(p => {
            const matchesType = !filter.type || filter.type === 'All' || isAssetClassMatch(p.type, filter.type);
            const matchesSource = !filter.source || filter.source === 'All' || p.source === filter.source || p.bankName === filter.source;
            const matchesCurrency = !filter.currency || filter.currency === 'All' || p.currency === filter.currency;
            const matchesSearch = !filter.searchQuery ||
                p.symbol.toLowerCase().includes(filter.searchQuery.toLowerCase()) ||
                p.instrument.toLowerCase().includes(filter.searchQuery.toLowerCase());

            return matchesType && matchesSource && matchesCurrency && matchesSearch;
        });
    },

    recalculatePositions: async (): Promise<void> => {
        const unifiedTxs = db.getUnifiedTransactions();
        const accounts = db.getAccounts();
        const institutes = db.getInstitutes();
        const instruments = db.getInstruments();

        // Sort unified transactions by date ascending
        const sortedTxs = [...unifiedTxs].sort((a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime());

        // Group by (accountId, instrumentId) for proper isolation
        const positionMap = new Map<string, Position>();

        for (const tx of sortedTxs) {
            if (!tx.instrumentId) continue;

            const instrument = instruments.find(i => i.id === tx.instrumentId);
            const account = accounts.find(a => a.id === tx.accountId);
            const institute = account ? institutes.find(i => i.id === account.instituteId) : null;
            const symbol = instrument?.marketIdentifier.symbol || tx.assetSymbol;

            const key = `${tx.accountId}:${tx.instrumentId}`;

            let pos = positionMap.get(key);
            if (!pos) {
                pos = {
                    id: `pos-${Math.random().toString(36).substr(2, 9)}`,
                    instrument: instrument?.name || tx.label || symbol,
                    symbol,
                    quantity: 0,
                    avgCost: 0,
                    lastPrice: parseFloat(tx.priceUnit || '0'),
                    marketValue: 0,
                    unrealizedPL: 0,
                    unrealizedPLPercent: 0,
                    currency: instrument?.denominationCurrency || tx.feeAsset || 'EUR',
                    type: instrument ? (instrument.type === 'stock' ? 'Equity' : instrument.type === 'crypto' ? 'Crypto' : instrument.type === 'cash' ? 'Cash' : 'ETF') : 'Equity',
                    source: institute?.name || 'Unknown',
                    bankName: institute?.name,
                    accountName: account?.name
                };
            }

            const qty = parseFloat(tx.quantity || tx.amountPrimary || '0');
            const price = parseFloat(tx.priceUnit || '0');
            const fees = parseFloat(tx.feeAmount || '0');
            const amount = parseFloat(tx.amountPrimary || '0');

            if (tx.type === 'BUY' || tx.type === 'DEPOSIT' || tx.type === 'BALANCE_ADJUSTMENT' || tx.type === 'SNAPSHOT_ADJUSTMENT') {
                // Cost basis includes fees (CRITICAL for French PRU calculation)
                const totalCost = (pos.quantity * pos.avgCost) + Math.abs(amount) + fees;
                const totalQty = pos.quantity + qty;

                if (totalQty > 0) {
                    pos.avgCost = totalCost / totalQty;
                }
                pos.quantity = totalQty;
                if (price > 0) pos.lastPrice = price;
            } else if (tx.type === 'SELL' || tx.type === 'WITHDRAW') {
                pos.quantity -= Math.abs(qty);
                if (price > 0) pos.lastPrice = price;
            }

            if (pos.quantity < 0) pos.quantity = 0;

            positionMap.set(key, pos);
        }

        // Filter out zero positions
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

    getDashboardSummary: async (
        timeRange: string = '1Y',
        baseCurrency: string = 'EUR',
        locale: string = 'fr-FR',
        dateFormatPattern: DateFormatPattern = 'DD/MM/YYYY'
    ): Promise<DashboardSummary> => {
        await delay(150);
        let positions = db.getPositions();

        // Ensure live prices are fetched and saved
        positions = await refreshPositionPrices(positions);
        db.savePositions(positions);

        // Fetch FX exchange rates for position currencies to baseCurrency
        const uniqueCurrencies = positions.map(p => p.currency || 'EUR');
        const rates = await currencyService.getExchangeRates(uniqueCurrencies, baseCurrency);

        const totalValue = positions.reduce((sum, p) => {
            const valInBase = currencyService.convertAmount(p.marketValue, p.currency || 'EUR', baseCurrency, rates);
            return sum + valInBase;
        }, 0);

        const totalInvested = positions.reduce((sum, p) => {
            const costBasis = p.quantity * p.avgCost;
            const costInBase = currencyService.convertAmount(costBasis, p.currency || 'EUR', baseCurrency, rates);
            return sum + costInBase;
        }, 0);

        const totalPL = totalValue - totalInvested;
        const plPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

        const transactions = db.getTransactions();
        const sortedTxs = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const now = new Date();
        let startDate = new Date();
        let pointCount = 30;
        let labelFormat: 'hour' | 'day' | 'month' = 'day';

        switch (timeRange) {
            case '1D':
                startDate.setDate(now.getDate() - 1);
                pointCount = 24;
                labelFormat = 'hour';
                break;
            case '1W':
                startDate.setDate(now.getDate() - 7);
                pointCount = 7;
                labelFormat = 'day';
                break;
            case '1M':
                startDate.setDate(now.getDate() - 30);
                pointCount = 30;
                labelFormat = 'day';
                break;
            case '1Y':
                startDate.setFullYear(now.getFullYear() - 1);
                pointCount = 12;
                labelFormat = 'month';
                break;
            case 'ALL':
                if (sortedTxs.length > 0) {
                    startDate = new Date(sortedTxs[0].date);
                } else {
                    startDate.setFullYear(now.getFullYear() - 2);
                }
                pointCount = 24;
                labelFormat = 'month';
                break;
            default:
                startDate.setFullYear(now.getFullYear() - 1);
                pointCount = 12;
                labelFormat = 'month';
                break;
        }

        const timeStepMs = Math.max(1000, (now.getTime() - startDate.getTime()) / Math.max(1, pointCount - 1));
        const totalDuration = Math.max(1, now.getTime() - startDate.getTime());

        const chartData = Array.from({ length: pointCount }, (_, i) => {
            const pointTime = new Date(startDate.getTime() + i * timeStepMs);
            const txsUpToDate = sortedTxs.filter(tx => new Date(tx.date) <= pointTime);

            let pointValue = 0;
            const assetQuantities: Record<string, number> = {};

            for (const tx of txsUpToDate) {
                if (tx.type === 'Buy' || tx.type === 'Deposit') {
                    assetQuantities[tx.symbol] = (assetQuantities[tx.symbol] || 0) + tx.amount;
                } else if (tx.type === 'Sell' || tx.type === 'Withdrawal') {
                    assetQuantities[tx.symbol] = Math.max(0, (assetQuantities[tx.symbol] || 0) - tx.amount);
                }
            }

            const progress = (pointTime.getTime() - startDate.getTime()) / totalDuration;

            Object.entries(assetQuantities).forEach(([symbol, qty]) => {
                const pos = positions.find(p => p.symbol === symbol);
                const currentPrice = pos ? pos.lastPrice : 1;
                const costPrice = pos ? pos.avgCost : 1;
                const posCurr = pos?.currency || 'EUR';

                // Deterministic subtle market curve so performance looks realistic like Finary
                const noise = 1 + (Math.sin(i * 1.3 + symbol.length) * 0.012);
                const simulatedHistoricalPrice = (costPrice + (currentPrice - costPrice) * progress) * noise;
                const itemValNative = qty * simulatedHistoricalPrice;
                const itemValBase = currencyService.convertAmount(itemValNative, posCurr, baseCurrency, rates);

                pointValue += itemValBase;
            });

            if (txsUpToDate.length === 0) {
                pointValue = 0;
            }

            const name = formatChartDate(pointTime, labelFormat, dateFormatPattern, locale);

            return {
                name,
                value: Math.round(pointValue * 100) / 100
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
