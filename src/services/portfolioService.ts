import { Position, PositionFilter, DashboardSummary, Instrument, RealizedPLSummary } from '../types';
import type { ChartPriceMode } from '../types/domain';
import { db, delay } from './db';
import { refreshPositionPrices, fetchRealPriceHistory, HistoricalPricePoint } from './priceService';
import { currencyService } from './currencyService';
import { formatChartDate, DateFormatPattern } from '../utils/date';
import { roundCurrency } from '../utils/currency';
import { ASSET_CLASSES, isAssetClassMatch } from '../constants/assetClasses';
import { portfolioRepository, transactionRepository } from './repositories';
import { instrumentTypeToPositionType } from './portfolio/assetTypeMapping';
import { buildLedger, buildRealizedEvents, applyTransaction, defaultLedgerKey, emptyLedgerState, rowSymbol, sortChronologically, LedgerState } from './portfolio/positionLedger';

/** Asset class shown for a position, from its instrument (no instrument: equity) */
const positionTypeOf = (instrument: Instrument | undefined): Position['type'] => instrumentTypeToPositionType(instrument?.type);

export const portfolioService = {
    getPositions: async (filter?: PositionFilter): Promise<Position[]> => {
        await delay(100);
        let allPositions: Position[] = [];
        for (let attempt = 0; attempt < 3; attempt++) {
            const stored = await portfolioRepository.getPositions();
            // Refresh live prices from Yahoo Finance on ALL positions (15-min cache)
            allPositions = await refreshPositionPrices(stored);
            // The price fetch is slow: an import may have recalculated the positions meanwhile, and
            // saving this older list would bring removed or outdated positions back.
            const current = await portfolioRepository.getPositions();
            if (current.length === stored.length && current.every((p, i) => p.id === stored[i].id && p.quantity === stored[i].quantity)) {
                // Persist updated prices for all positions (never save filtered subset)
                await portfolioRepository.savePositions(allPositions);
                break;
            }
            // Newer positions: price them instead (the prices are cached by now)
        }

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

    /**
     * Return (%) since the start of `timeRange` of what is held now, per asset class and for the whole
     * portfolio ('All'), weighted by current value in `baseCurrency`, from each asset's price history.
     * Cash counts at 0 %. A class without any history is left out (no invented curve).
     */
    getHoldingsReturnSeries: async (
        positions: Position[],
        timeRange: '1M' | '3M' | '1Y' | 'ALL',
        pointsCount: number,
        baseCurrency: string
    ): Promise<Record<string, number[]>> => {
        const rates = await currencyService.getExchangeRates([...new Set(positions.map(p => p.currency || 'EUR'))], baseCurrency);
        const withReturns = (await Promise.all(positions.map(async (p) => {
            const weight = Math.max(0, currencyService.convertAmount(p.marketValue || 0, p.currency || 'EUR', baseCurrency, rates));
            if (weight === 0) return null;
            if (p.type === 'Cash') return { p, weight, returns: Array.from({ length: pointsCount }, () => 0) };
            const points = [...await fetchRealPriceHistory(p, timeRange, { allowEstimate: false }).catch(() => [] as HistoricalPricePoint[])]
                .sort((a, b) => a.timestamp - b.timestamp);
            if (points.length < 2 || points[0].price <= 0) return null;
            const first = points[0].price;
            const returns = Array.from({ length: pointsCount }, (_, i) => {
                const idx = Math.round(i * (points.length - 1) / Math.max(1, pointsCount - 1));
                return (points[idx].price / first - 1) * 100;
            });
            return { p, weight, returns };
        }))).filter((item): item is { p: Position; weight: number; returns: number[] } => item !== null);

        const combine = (items: typeof withReturns): number[] | undefined => {
            const total = items.reduce((sum, item) => sum + item.weight, 0);
            if (total === 0 || items.every(item => item.p.type === 'Cash')) return undefined;
            return Array.from({ length: pointsCount }, (_, i) =>
                Math.round(items.reduce((sum, item) => sum + item.weight * item.returns[i], 0) / total * 100) / 100);
        };

        const result: Record<string, number[]> = {};
        const all = combine(withReturns);
        if (all) result.All = all;
        for (const assetClass of ASSET_CLASSES) {
            const curve = combine(withReturns.filter(item => isAssetClassMatch(item.p.type, assetClass)));
            if (curve) result[assetClass] = curve;
        }
        return result;
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
                // Stable across recalculations (account + asset), so a selection or a link survives them
                id: `pos-${key}`,
                instrumentId: instrument?.id,
                instrument: instrument?.name || firstTx.label || symbol,
                symbol,
                quantity: state.quantity,
                avgCost: state.quantity > 0 ? state.costBasis / state.quantity : 0,
                lastPrice,
                marketValue: 0,
                unrealizedPL: 0,
                unrealizedPLPercent: 0,
                // The fee asset (e.g. BNB) is not the currency the position is priced in
                currency: instrument?.denominationCurrency || account?.defaultCurrency || 'EUR',
                type: positionTypeOf(instrument),
                source: institute?.name || 'Unknown',
                bankName: institute?.name,
                accountId: account?.id,
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
        // Live prices, saved without overwriting a recalculation made during the fetch
        const positions = await portfolioService.getPositions();

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
            case '3M':
                startDate.setDate(now.getDate() - 90);
                pointCount = 13;
                labelFormat = 'day';
                break;
            case 'YTD':
                startDate = new Date(now.getFullYear(), 0, 1);
                pointCount = Math.max(2, now.getMonth() + 2);
                labelFormat = 'month';
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
        const instrumentList = db.getInstruments();
        const instrumentSymbols = new Map(instrumentList.map(i => [i.id, i.marketIdentifier.symbol]));
        const instrumentCurrencies = new Map(instrumentList.map(i => [i.id, i.denominationCurrency]));
        const accountCurrencies = new Map(db.getAccounts().map(a => [a.id, a.defaultCurrency]));
        // An asset sold since has no position left: value it from its own trades, never at 1 per unit
        const lastTradePrice: Record<string, number> = {};
        const assetCost: Record<string, number> = {};
        const assetCurrency: Record<string, string> = {};
        // When each asset was (last) acquired: the estimated price moves from its cost to today's
        // price over the time it is held, not over the range on screen (every range showed the whole gain)
        const heldSince: Record<string, number> = {};
        const noteQuantity = (symbol: string, previous: number, timeMs: number): void => {
            if (previous <= 0 && (assetQuantities[symbol] ?? 0) > 0) heldSince[symbol] = timeMs;
        };
        const unifiedWithTime = unifiedTxs.map(tx => ({ tx, time: new Date(tx.transactionDate).getTime() }));
        const ledgerStates = new Map<string, LedgerState>();
        const accountMethods = new Map(db.getAccounts().map(a => [a.id, a.costBasisMethod ?? 'WAC']));
        let unifiedIdx = 0;

        const chartData = Array.from({ length: pointCount }, (_, i) => {
            const pointTimeMs = startDate.getTime() + i * timeStepMs;
            const pointTime = new Date(pointTimeMs);

            while (unifiedIdx < unifiedWithTime.length && unifiedWithTime[unifiedIdx].time <= pointTimeMs) {
                const { tx } = unifiedWithTime[unifiedIdx];
                const key = defaultLedgerKey(tx);
                if (key) {
                    const prev = ledgerStates.get(key) ?? emptyLedgerState();
                    const next = applyTransaction(prev, tx, accountMethods.get(tx.accountId) ?? 'WAC');
                    ledgerStates.set(key, next);
                    const symbol = instrumentSymbols.get(tx.instrumentId) || rowSymbol(tx) || tx.assetSymbol;
                    // Incrementally update this symbol across accounts in O(1)
                    const previousQuantity = assetQuantities[symbol] ?? 0;
                    assetQuantities[symbol] = previousQuantity + (next.quantity - prev.quantity);
                    noteQuantity(symbol, previousQuantity, unifiedWithTime[unifiedIdx].time);
                    assetCost[symbol] = (assetCost[symbol] ?? 0) + (next.costBasis - prev.costBasis);
                    const tradePrice = parseFloat(tx.priceUnit || '');
                    if (tradePrice > 0) lastTradePrice[symbol] = tradePrice;
                    const currency = instrumentCurrencies.get(tx.instrumentId) || accountCurrencies.get(tx.accountId);
                    if (currency) assetCurrency[symbol] = currency;
                }
                unifiedIdx++;
            }

            // Incrementally accumulate transactions up to pointTimeMs
            while (txIdx < txsWithTime.length && txsWithTime[txIdx].time <= pointTimeMs) {
                const tx = txsWithTime[txIdx];
                const previousQuantity = assetQuantities[tx.symbol] ?? 0;
                if (tx.type === 'Buy' || tx.type === 'Deposit') {
                    assetQuantities[tx.symbol] = (assetQuantities[tx.symbol] || 0) + tx.amount;
                } else if (tx.type === 'Sell' || tx.type === 'Withdrawal') {
                    assetQuantities[tx.symbol] = Math.max(0, (assetQuantities[tx.symbol] || 0) - tx.amount);
                }
                if (tx.price > 0) lastTradePrice[tx.symbol] = tx.price;
                if (tx.currency) assetCurrency[tx.symbol] = tx.currency;
                noteQuantity(tx.symbol, previousQuantity, tx.time);
                txIdx++;
            }

            let pointValue = 0;
            let pointInvested = 0;

            if (txIdx > 0 || unifiedIdx > 0) {
                Object.entries(assetQuantities).forEach(([symbol, qty]) => {
                    if (qty <= 0) return;
                    const since = heldSince[symbol] ?? startDate.getTime();
                    const progress = Math.min(1, Math.max(0, (pointTimeMs - since) / Math.max(1, now.getTime() - since)));
                    const pos = positionMap.get(symbol);
                    const ledgerCost = assetCost[symbol] !== undefined ? assetCost[symbol] / qty : undefined;
                    const costPrice = pos ? pos.avgCost : (ledgerCost ?? lastTradePrice[symbol] ?? 0);
                    const currentPrice = pos ? pos.lastPrice : (lastTradePrice[symbol] ?? costPrice);
                    const posCurr = pos?.currency || assetCurrency[symbol] || 'EUR';

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
