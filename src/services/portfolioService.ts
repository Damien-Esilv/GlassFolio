import { Position, PositionFilter, DashboardSummary, Instrument, RealizedPLSummary } from '../types';
import type { ChartPriceMode } from '../types/domain';
import { db, delay } from './db';
import { refreshPositionPrices, fetchRealPriceHistory, HistoricalPricePoint } from './priceService';
import { currencyService } from './currencyService';
import { formatChartDate, DateFormatPattern } from '../utils/date';
import { roundCurrency } from '../utils/currency';
import { isAssetClassMatch } from '../constants/assetClasses';
import { portfolioRepository, transactionRepository } from './repositories';
import { buildLedger, buildRealizedEvents, applyTransaction, defaultLedgerKey, emptyLedgerState, rowSymbol, sortChronologically, LedgerState } from './portfolio/positionLedger';

/** Asset class shown for a position, from its instrument (no instrument: equity) */
const positionTypeOf = (instrument: Instrument | undefined): Position['type'] => {
    if (!instrument) return 'Equity';
    if (instrument.type === 'stock') return 'Equity';
    if (instrument.type === 'crypto') return 'Crypto';
    return instrument.type === 'cash' ? 'Cash' : 'ETF';
};

export const portfolioService = {
    getPositions: async (filter?: PositionFilter): Promise<Position[]> => {
        await delay(100);
        let allPositions = await portfolioRepository.getPositions();

        // Refresh live prices from Yahoo Finance on ALL positions (15-min cache)
        allPositions = await refreshPositionPrices(allPositions);

        // Persist updated prices for all positions (never save filtered subset)
        await portfolioRepository.savePositions(allPositions);

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

        // BOLT OPTIMIZATION:
        // Pre-build O(1) Map lookups for instruments, accounts, and institutes to avoid O(N * (Inst + A + I)) linear array searches.
        const instrumentMap = new Map(instruments.map(i => [i.id, i]));
        const accountMap = new Map(accounts.map(a => [a.id, a]));
        const instituteMap = new Map(institutes.map(i => [i.id, i]));

        // Replay the journal through the shared ledger (WAC or FIFO per account)
        const ledger = buildLedger(unifiedTxs, {
            methodFor: accountId => accountMap.get(accountId)?.costBasisMethod ?? 'WAC'
        });

        const positionMap = new Map<string, Position>();

        for (const { key, state, firstTx, lastTx } of ledger.values()) {
            const instrument = instrumentMap.get(firstTx.instrumentId);
            const account = accountMap.get(firstTx.accountId);
            const institute = account ? instituteMap.get(account.instituteId) : null;
            const symbol = instrument?.marketIdentifier.symbol || rowSymbol(firstTx) || firstTx.assetSymbol;
            const isCash = instrument?.type === 'cash';
            const lastPrice = isCash ? 1 : parseFloat(lastTx.priceUnit || '0') || (state.quantity > 0 ? state.costBasis / state.quantity : 0);

            positionMap.set(key, {
                id: `pos-${crypto.randomUUID()}`,
                instrument: instrument?.name || firstTx.label || symbol,
                symbol,
                quantity: state.quantity,
                avgCost: state.quantity > 0 ? state.costBasis / state.quantity : 0,
                lastPrice,
                marketValue: 0,
                unrealizedPL: 0,
                unrealizedPLPercent: 0,
                currency: instrument?.denominationCurrency || firstTx.feeAsset || 'EUR',
                type: positionTypeOf(instrument),
                source: institute?.name || 'Unknown',
                bankName: institute?.name,
                accountName: account?.name
            });
        }

        // Filter out zero positions
        const positions = Array.from(positionMap.values())
            .filter(p => p.quantity > 0.000001);

        // Calculate PL
        positions.forEach(p => {
            p.marketValue = roundCurrency(p.quantity * p.lastPrice);
            p.unrealizedPL = roundCurrency(p.marketValue - (p.quantity * p.avgCost));
            const invested = p.quantity * p.avgCost;
            p.unrealizedPLPercent = invested > 0 ? roundCurrency((p.unrealizedPL / invested) * 100) : 0;
        });

        // Save calculated positions to DB (cache)
        await portfolioRepository.savePositions(positions);
    },

    /**
     * Realized gains and losses from the journal: every sale replayed through the ledger of its
     * account (WAC or FIFO), converted to the base currency.
     */
    getRealizedPL: async (baseCurrency: string = 'EUR'): Promise<RealizedPLSummary> => {
        await delay(100);
        const journal = db.getUnifiedTransactions();
        const methodByAccount = new Map(db.getAccounts().map(a => [a.id, a.costBasisMethod ?? 'WAC']));
        const instrumentById = new Map(db.getInstruments().map(i => [i.id, i]));
        const txById = new Map(journal.map(tx => [tx.id, tx]));

        const events = buildRealizedEvents(journal, { methodFor: accountId => methodByAccount.get(accountId) ?? 'WAC' });
        if (events.length === 0) return { total: 0, byMonth: [], entries: [] };

        const currencyOf = (txId: string): string => {
            const tx = txById.get(txId);
            return (tx ? instrumentById.get(tx.instrumentId)?.denominationCurrency : undefined) || 'EUR';
        };
        const rates = await currencyService.getExchangeRates([...new Set(events.map(e => currencyOf(e.txId)))], baseCurrency);

        const entries = events.map(event => {
            const tx = txById.get(event.txId);
            const instrument = tx ? instrumentById.get(tx.instrumentId) : undefined;
            return {
                date: event.date,
                symbol: instrument?.marketIdentifier.symbol || (tx ? rowSymbol(tx) || tx.assetSymbol : '') || '',
                assetType: positionTypeOf(instrument),
                value: roundCurrency(currencyService.convertAmount(event.realizedPL, currencyOf(event.txId), baseCurrency, rates))
            };
        });

        const months = new Map<string, number>();
        for (const entry of entries) {
            const month = entry.date.slice(0, 7);
            months.set(month, (months.get(month) ?? 0) + entry.value);
        }

        return {
            total: roundCurrency(entries.reduce((sum, entry) => sum + entry.value, 0)),
            byMonth: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value: roundCurrency(value) })),
            entries
        };
    },

    getDashboardSummary: async (
        timeRange: string = '1Y',
        baseCurrency: string = 'EUR',
        locale: string = 'fr-FR',
        dateFormatPattern: DateFormatPattern = 'DD/MM/YYYY',
        options: { chartMode?: ChartPriceMode } = {}
    ): Promise<DashboardSummary> => {
        await delay(150);
        let positions = await portfolioRepository.getPositions();

        // Ensure live prices are fetched and saved
        positions = await refreshPositionPrices(positions);
        await portfolioRepository.savePositions(positions);

        // Fetch FX exchange rates for position currencies to baseCurrency
        const uniqueCurrencies = positions.map(p => p.currency || 'EUR');
        const rates = await currencyService.getExchangeRates(uniqueCurrencies, baseCurrency);

        const rawTotalValue = positions.reduce((sum, p) => {
            const valInBase = currencyService.convertAmount(p.marketValue, p.currency || 'EUR', baseCurrency, rates);
            return sum + valInBase;
        }, 0);
        const totalValue = roundCurrency(rawTotalValue);

        const rawTotalInvested = positions.reduce((sum, p) => {
            const costBasis = p.quantity * p.avgCost;
            const costInBase = currencyService.convertAmount(costBasis, p.currency || 'EUR', baseCurrency, rates);
            return sum + costInBase;
        }, 0);
        const totalInvested = roundCurrency(rawTotalInvested);

        const totalPL = roundCurrency(totalValue - totalInvested);
        const plPercent = totalInvested > 0 ? roundCurrency((totalPL / totalInvested) * 100) : 0;

        // Imports live in the unified journal; the legacy store only backs old demo data
        const unifiedTxs = sortChronologically(db.getUnifiedTransactions());
        const useUnifiedJournal = unifiedTxs.length > 0;
        const transactions = useUnifiedJournal ? [] : await transactionRepository.getAll();
        const sortedTxs = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const firstTxDate = useUnifiedJournal ? unifiedTxs[0].transactionDate : sortedTxs[0]?.date;

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
                if (firstTxDate) {
                    startDate = new Date(firstTxDate);
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

        // BOLT OPTIMIZATION:
        // 1. Pre-parse dates once to eliminate thousands of repeated `new Date()` allocations inside loops.
        // 2. Use a running index pointer (txIdx) over date-sorted transactions to incrementally accumulate asset quantities across consecutive chart points (O(N + M) instead of O(M * N)).
        // 3. Cache positions in an O(1) Map lookup to replace linear Array.find() calls inside the chart rendering loop.
        const txsWithTime = sortedTxs.map(tx => ({
            ...tx,
            time: new Date(tx.date).getTime()
        }));
        const positionMap = new Map(positions.map(p => [p.symbol, p]));

        let txIdx = 0;
        const assetQuantities: Record<string, number> = {};

        // Historical mode: real closing prices per held asset (cached 15 min by priceService)
        const histories = new Map<string, HistoricalPricePoint[]>();
        if (options.chartMode === 'historical') {
            await Promise.all(positions.filter(p => p.type !== 'Cash').map(async p => {
                try {
                    const points = await fetchRealPriceHistory(p, timeRange);
                    if (points.length > 0) histories.set(p.symbol, [...points].sort((a, b) => a.timestamp - b.timestamp));
                } catch {
                    // Missing history falls back to the estimate for this asset
                }
            }));
        }
        const historicalPriceAt = (symbol: string, timeMs: number): number | null => {
            const points = histories.get(symbol);
            if (!points) return null;
            let lo = 0;
            let hi = points.length - 1;
            if (timeMs <= points[0].timestamp) return points[0].price;
            while (lo < hi) {
                const mid = Math.ceil((lo + hi) / 2);
                if (points[mid].timestamp <= timeMs) lo = mid;
                else hi = mid - 1;
            }
            return points[lo].price;
        };

        // Unified journal: replay through the shared ledger so snapshot adjustments,
        // decreases and cash statements move the curve exactly like the positions
        const instrumentSymbols = new Map(db.getInstruments().map(i => [i.id, i.marketIdentifier.symbol]));
        const unifiedWithTime = unifiedTxs.map(tx => ({ tx, time: new Date(tx.transactionDate).getTime() }));
        const ledgerStates = new Map<string, LedgerState>();
        const ledgerSymbols = new Map<string, string>();
        const accountMethods = new Map(db.getAccounts().map(a => [a.id, a.costBasisMethod ?? 'WAC']));
        let unifiedIdx = 0;

        const chartData = Array.from({ length: pointCount }, (_, i) => {
            const pointTimeMs = startDate.getTime() + i * timeStepMs;
            const pointTime = new Date(pointTimeMs);

            while (unifiedIdx < unifiedWithTime.length && unifiedWithTime[unifiedIdx].time <= pointTimeMs) {
                const { tx } = unifiedWithTime[unifiedIdx];
                const key = defaultLedgerKey(tx);
                if (key) {
                    const next = applyTransaction(ledgerStates.get(key) ?? emptyLedgerState(), tx, accountMethods.get(tx.accountId) ?? 'WAC');
                    ledgerStates.set(key, next);
                    const symbol = instrumentSymbols.get(tx.instrumentId) || rowSymbol(tx) || tx.assetSymbol;
                    ledgerSymbols.set(key, symbol);
                    // Re-aggregate this symbol across accounts
                    assetQuantities[symbol] = Array.from(ledgerStates.entries())
                        .filter(([k]) => ledgerSymbols.get(k) === symbol)
                        .reduce((sum, [, st]) => sum + st.quantity, 0);
                }
                unifiedIdx++;
            }

            // Incrementally accumulate transactions up to pointTimeMs
            while (txIdx < txsWithTime.length && txsWithTime[txIdx].time <= pointTimeMs) {
                const tx = txsWithTime[txIdx];
                if (tx.type === 'Buy' || tx.type === 'Deposit') {
                    assetQuantities[tx.symbol] = (assetQuantities[tx.symbol] || 0) + tx.amount;
                } else if (tx.type === 'Sell' || tx.type === 'Withdrawal') {
                    assetQuantities[tx.symbol] = Math.max(0, (assetQuantities[tx.symbol] || 0) - tx.amount);
                }
                txIdx++;
            }

            let pointValue = 0;
            let pointInvested = 0;

            if (txIdx > 0 || unifiedIdx > 0) {
                const progress = (pointTimeMs - startDate.getTime()) / totalDuration;

                Object.entries(assetQuantities).forEach(([symbol, qty]) => {
                    const pos = positionMap.get(symbol);
                    const currentPrice = pos ? pos.lastPrice : 1;
                    const costPrice = pos ? pos.avgCost : 1;
                    const posCurr = pos?.currency || 'EUR';

                    // Real close when available, otherwise a deterministic interpolation between cost and current price
                    const realPrice = historicalPriceAt(symbol, pointTimeMs);
                    const noise = 1 + (Math.sin(i * 1.3 + symbol.length) * 0.012);
                    const simulatedHistoricalPrice = realPrice ?? (costPrice + (currentPrice - costPrice) * progress) * noise;
                    const itemValNative = qty * simulatedHistoricalPrice;
                    const itemValBase = currencyService.convertAmount(itemValNative, posCurr, baseCurrency, rates);

                    pointValue += itemValBase;

                    const itemCostNative = qty * costPrice;
                    const itemCostBase = currencyService.convertAmount(itemCostNative, posCurr, baseCurrency, rates);
                    pointInvested += itemCostBase;
                });
            }

            const name = formatChartDate(pointTime, labelFormat, dateFormatPattern, locale);

            return {
                name,
                value: roundCurrency(pointValue),
                invested: roundCurrency(pointInvested)
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
