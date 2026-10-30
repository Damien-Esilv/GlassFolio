import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ReferenceLine } from 'recharts';
import { ArrowLeft, Percent, ShieldAlert, Award, ArrowUpRight, ArrowDownRight, Search, Plus, Loader2, BookOpen, Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ChartModeToggle from '../components/ui/ChartModeToggle';
import { useChartPriceMode } from '../hooks/useChartPriceMode';
import { portfolioService } from '../services/portfolioService';
import { searchLiveAssets, fetchAssetHistory, CURATED_CATALOG, SearchResultItem } from '../services/assetSearchService';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { DashboardSummary } from '../types';
import { formatCurrency } from '../utils/currency';
import { formatChartDate } from '../utils/date';
import AnimatedCounter from '../components/AnimatedCounter';
import { TrendValue } from '../components/ui/TrendValue';
import { ANIMATION_DURATION_MS, ANIMATION_EASING } from '../constants/animations';
import { ASSET_CLASSES, ASSET_CLASSES_CONFIG } from '../constants/assetClasses';
import { CHART_SERIES_PALETTE, getAssetStableColor } from '../constants/themeTokens';
import { AppThinkingOrb } from '../components/ui/AppThinkingOrb';
import { useEscapeKey } from '../hooks/useEscapeKey';

const PortfolioPerformance: React.FC = () => {
   const { t } = useTranslation();
   const navigate = useNavigate();
   const { user } = useAuth();
   const { transactions, positions } = useData();
   const locale = user?.preferences?.language === 'fr' ? 'fr-FR' : 'en-US';
   const dateFormat = user?.preferences?.dateFormat || 'DD/MM/YYYY';
   const currency = user?.preferences?.currency || 'EUR';

   const [timeRange, setTimeRange] = useState<'1M' | '3M' | 'YTD' | '1Y' | 'ALL'>('1Y');
   const [chartMode, setChartMode] = useChartPriceMode();
   const [benchmarkRate, setBenchmarkRate] = useState<number>(3.0); // Default 3.0% risk-free rate
   const [summary, setSummary] = useState<DashboardSummary | null>(null);
   const [isLoading, setIsLoading] = useState<boolean>(true);

   // Side-by-side comparison state
   const [compareTimeRange, setCompareTimeRange] = useState<'1M' | '3M' | '1Y' | 'ALL'>('1Y');
   const [selectedCompareItems, setSelectedCompareItems] = useState<string[]>(['All']);
   const [curveMode, setCurveMode] = useState<'separate' | 'merged'>('separate');
   const [searchInputValue, setSearchInputValue] = useState('');
   const [isSearchFocused, setIsSearchFocused] = useState(false);
   const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
   const [isSearching, setIsSearching] = useState(false);
   const [referenceHistoryMap, setReferenceHistoryMap] = useState<Record<string, number[]>>({});
   // Real curves of what is held (per asset class and 'All'): never invented ones
   const [holdingsHistoryMap, setHoldingsHistoryMap] = useState<Record<string, number[]>>({});

   // Catalog Modal state
   const [isCatalogOpen, setIsCatalogOpen] = useState(false);
   useEscapeKey(() => setIsCatalogOpen(false), isCatalogOpen);
   const [catalogActiveTab, setCatalogActiveTab] = useState<'etf' | 'stocks' | 'crypto' | 'indices'>('etf');
   const [tempCatalogSelection, setTempCatalogSelection] = useState<string[]>([]);

   // Helpers to separate internal asset categories from searched reference tickers
   const isAssetCategory = (item: string) => (ASSET_CLASSES as readonly string[]).includes(item);

   const selectedInternalCategories = useMemo(() => {
      return selectedCompareItems.filter(i => isAssetCategory(i));
   }, [selectedCompareItems]);

   const selectedReferenceAssets = useMemo(() => {
      return selectedCompareItems.filter(i => !isAssetCategory(i) && i !== 'All' && i !== 'Global Portfolio');
   }, [selectedCompareItems]);

   // Helper to retrieve consistent color for asset categories or searched tickers
   const getItemColor = (itemKey: string, customList?: string[]): string => {
      if (itemKey === 'All' || itemKey === 'Global Portfolio') return 'var(--color-accent-indigo)';
      const config = ASSET_CLASSES_CONFIG.find(c => c.id.toLowerCase() === itemKey.toLowerCase());
      if (config && config.hex) return config.hex;
      
      const refList = customList || selectedReferenceAssets;
      const refIndex = refList.indexOf(itemKey);

      if (refIndex !== -1) {
         return CHART_SERIES_PALETTE[refIndex % CHART_SERIES_PALETTE.length].cssVar;
      }

      return getAssetStableColor(itemKey).cssVar;
   };

   useEffect(() => {
      const fetchData = async () => {
         try {
            setIsLoading(true);
            const data = await portfolioService.getDashboardSummary(timeRange, currency, locale, dateFormat, { chartMode });
            setSummary(data);
         } catch (e) {
            console.error(e);
         } finally {
            setIsLoading(false);
         }
      };

      fetchData();
   }, [timeRange, currency, transactions, positions, locale, dateFormat, chartMode]);

   // Calculate period fraction in years for compound benchmark return (from the real dates)
   const periodYears = useMemo(() => {
      const yearMs = 365.25 * 24 * 3600 * 1000;
      const now = new Date();
      switch (timeRange) {
         case '1M': return 1 / 12;
         case '3M': return 3 / 12;
         case 'YTD': return Math.max(1 / 365, (now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / yearMs);
         case '1Y': return 1.0;
         case 'ALL': {
            const first = transactions.reduce((min, tx) => Math.min(min, new Date(tx.date).getTime()), Infinity);
            return Number.isFinite(first) ? Math.max(1 / 365, (now.getTime() - first) / yearMs) : 1.0;
         }
         default: return 1.0;
      }
   }, [timeRange, transactions]);

   // Combine Portfolio Chart Data with Benchmark Curve (Livret A cashflow-adjusted compounding)
   const combinedChartData = useMemo(() => {
      if (!summary || !summary.chartData || summary.chartData.length === 0) return [];

      const totalPoints = summary.chartData.length;
      const stepYears = totalPoints > 1 ? periodYears / (totalPoints - 1) : 0;
      const compoundStepFactor = Math.pow(1 + benchmarkRate / 100, stepYears);

      let runningBenchmark = 0;
      let prevInvested = 0;

      return summary.chartData.map((pt, idx) => {
         // Capital invested at this point in time (from transactions / cost basis)
         const currentInvested = typeof pt.invested === 'number'
            ? pt.invested
            : (pt.value > 0 ? (summary.totalCost > 0 ? Math.min(pt.value, summary.totalCost) : pt.value) : 0);

         if (idx === 0) {
            // Benchmark starts at exact capital invested at point 0 (0 if no investments)
            runningBenchmark = currentInvested;
            prevInvested = currentInvested;
         } else {
            // 1. Compound existing balance over the step
            runningBenchmark = runningBenchmark * compoundStepFactor;

            // 2. Add net new capital invested (deposits / purchases, like adding money to Livret A)
            if (currentInvested > prevInvested) {
               runningBenchmark += (currentInvested - prevInvested);
            } else if (currentInvested < prevInvested && prevInvested > 0) {
               // Proportional withdrawal / sale if capital decreased
               const ratio = (prevInvested - currentInvested) / prevInvested;
               runningBenchmark = Math.max(0, runningBenchmark * (1 - ratio));
            }
            prevInvested = currentInvested;
         }

         const benchmarkValue = Math.round(runningBenchmark * 100) / 100;

         return {
            ...pt,
            portfolioValue: pt.value,
            benchmarkValue
         };
      });
   }, [summary, benchmarkRate, periodYears]);

   const firstPointVal = combinedChartData[0]?.portfolioValue || 0;
   const lastPointVal = combinedChartData[combinedChartData.length - 1]?.portfolioValue || 0;
   const lastBenchmarkVal = combinedChartData[combinedChartData.length - 1]?.benchmarkValue || 0;

   // Return over the selected period, not since the first purchase: the gain made during the period
   // (new money excluded) over the capital at work in it. "ALL" gives the all-time figure.
   const firstInvested = Number(summary?.chartData?.[0]?.invested ?? 0);
   const lastInvested = Number(summary?.chartData?.[summary.chartData.length - 1]?.invested ?? 0);
   const addedCapital = Math.max(0, lastInvested - firstInvested);
   const periodBase = firstPointVal + addedCapital;
   const periodGain = (lastPointVal - lastInvested) - (firstPointVal - firstInvested);
   const portfolioReturnPct = periodBase > 0 ? (periodGain / periodBase) * 100 : 0;
   const totalCostBasis = summary?.totalCost || 0;
   const benchmarkBase = firstInvested + addedCapital;
   const benchmarkProfit = lastBenchmarkVal - lastInvested;
   const benchmarkReturnPct = benchmarkBase > 0 ? (benchmarkProfit / benchmarkBase) * 100 : (benchmarkRate * periodYears);
   const outperformancePct = portfolioReturnPct - benchmarkReturnPct;
   const isOutperforming = outperformancePct >= 0;

   // Fetch live historical performance data for selected reference assets
   useEffect(() => {
      if (selectedReferenceAssets.length === 0) return;

      let pointsCount = 12;
      if (compareTimeRange === '1M') pointsCount = 30;
      else if (compareTimeRange === '3M') pointsCount = 12;
      else if (compareTimeRange === 'ALL') pointsCount = 24;

      let isMounted = true;

      const loadHistories = async () => {
         const newMap: Record<string, number[]> = { ...referenceHistoryMap };
         await Promise.all(
            selectedReferenceAssets.map(async (ticker) => {
               try {
                  const history = await fetchAssetHistory(ticker, compareTimeRange, pointsCount);
                  if (isMounted) {
                     newMap[ticker] = history;
                  }
               } catch (e) {
                  console.error(e);
               }
            })
         );
         if (isMounted) {
            setReferenceHistoryMap(newMap);
         }
      };

      loadHistories();

      return () => {
         isMounted = false;
      };
   }, [selectedReferenceAssets, compareTimeRange]);

   const comparePointsCount = compareTimeRange === '1M' ? 30 : compareTimeRange === 'ALL' ? 24 : 12;
   useEffect(() => {
      let isMounted = true;
      portfolioService.getHoldingsReturnSeries(positions, compareTimeRange, comparePointsCount, currency)
         .then((series) => { if (isMounted) setHoldingsHistoryMap(series); })
         .catch((e) => {
            console.error(e);
            if (isMounted) setHoldingsHistoryMap({});
         });
      return () => {
         isMounted = false;
      };
   }, [positions, compareTimeRange, comparePointsCount, currency]);

   // Generate Data for Comparison Chart (% Return vs Base 100 Index)
   const comparisonChartData = useMemo(() => {
      let pointsCount = 12;
      const now = new Date();
      let months: string[] = [];

      if (compareTimeRange === '1M') {
         pointsCount = 30;
         months = Array.from({ length: 30 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (29 - i));
            return formatChartDate(d, 'day', dateFormat, locale);
         });
      } else if (compareTimeRange === '3M') {
         pointsCount = 12;
         months = Array.from({ length: 12 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - Math.round((11 - i) * 90 / 11));
            return formatChartDate(d, 'day', dateFormat, locale);
         });
      } else if (compareTimeRange === 'ALL') {
         pointsCount = 24;
         months = Array.from({ length: 24 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - (23 - i), 1);
            return formatChartDate(d, 'month', dateFormat, locale);
         });
      } else {
         // Default 1Y: rolling 12 months ending at current month
         pointsCount = 12;
         months = Array.from({ length: 12 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
            return formatChartDate(d, 'month', dateFormat, locale);
         });
      }

      // Curve value of an asset class, the whole portfolio or a searched ticker at index i, from real
      // price histories only; undefined (no point drawn) when there is none.
      const getItemVal = (itemKey: string, index: number): number | undefined => {
         if (itemKey === 'All' || itemKey === 'Global Portfolio') return holdingsHistoryMap.All?.[index];
         if (isAssetCategory(itemKey)) return holdingsHistoryMap[itemKey]?.[index];
         return referenceHistoryMap[itemKey]?.[index];
      };

      return Array.from({ length: pointsCount }, (_, i) => {
         const point: Record<string, string | number> = {
            dateName: months[i] || `P${i + 1}`
         };

         selectedCompareItems.forEach((item) => {
            const returnPct = getItemVal(item, i);
            if (returnPct === undefined) return;
            point[item] = returnPct;
            point[`${item}_base100`] = Math.round((100 + returnPct) * 100) / 100;
         });

         // Calculate Merged Selection for internal asset categories ONLY
         if (curveMode === 'merged' && selectedInternalCategories.length > 1) {
            const known = selectedInternalCategories
               .map(cat => getItemVal(cat, i))
               .filter((v): v is number => v !== undefined);
            if (known.length > 0) {
               const avgReturn = known.reduce((sum, v) => sum + v, 0) / known.length;
               point['Merged Selection'] = Math.round(avgReturn * 100) / 100;
               point['Merged Selection_base100'] = Math.round((100 + avgReturn) * 100) / 100;
            }
         }

         return point;
      });
   }, [compareTimeRange, selectedCompareItems, selectedInternalCategories, curveMode, dateFormat, locale, holdingsHistoryMap, referenceHistoryMap]);

   // Selection Toggle Logic:
   // - Selecting "All" deselects internal asset categories, keeping searched reference assets if present.
   // - Selecting an internal asset category deselects "All".
   // - Deselecting all internal items reverts back to "All".
   const toggleCompareItem = (item: string) => {
      if (item === 'All' || item === 'Global Portfolio') {
         const referenceOnly = selectedCompareItems.filter(i => !isAssetCategory(i) && i !== 'All' && i !== 'Global Portfolio');
         setSelectedCompareItems(['All', ...referenceOnly]);
         return;
      }

      if (isAssetCategory(item)) {
         let next = selectedCompareItems.filter(i => i !== 'All' && i !== 'Global Portfolio');
         if (next.includes(item)) {
            next = next.filter(i => i !== item);
         } else {
            next = [...next, item];
         }

         const hasItem = next.length > 0;
         if (!hasItem) {
            next = ['All'];
         }
         setSelectedCompareItems(next);
         return;
      }

      // Custom searched reference asset/ticker
      let next = [...selectedCompareItems];
      if (next.includes(item)) {
         next = next.filter(i => i !== item);
      } else {
         if (selectedReferenceAssets.length >= 4) {
            return;
         }
         next.push(item);
      }
      if (next.length === 0) {
         next = ['All'];
      }
      setSelectedCompareItems(next);
   };

   // Live API Search Debounced Effect (Yahoo Finance + CoinGecko)
   useEffect(() => {
      const query = searchInputValue.trim();
      if (!query) {
         setSearchResults([]);
         setIsSearching(false);
         return;
      }

      setIsSearching(true);
      const timer = setTimeout(async () => {
         try {
            const results = await searchLiveAssets(query);
            setSearchResults(results);
         } catch (err) {
            console.error(err);
            setSearchResults([]);
         } finally {
            setIsSearching(false);
         }
      }, 300);

      return () => clearTimeout(timer);
   }, [searchInputValue]);

   const handleSelectSuggestion = (symbol: string) => {
      if (selectedReferenceAssets.length >= 4 && !selectedCompareItems.includes(symbol)) return;
      toggleCompareItem(symbol);
      setSearchInputValue('');
      setIsSearchFocused(false);
   };

   const handleAddSearchItem = () => {
      if (selectedReferenceAssets.length >= 4) return;
      if (searchResults.length > 0) {
         handleSelectSuggestion(searchResults[0].symbol);
      }
   };

   // Catalog Modal Handlers
   const handleOpenCatalog = () => {
      setTempCatalogSelection([...selectedReferenceAssets]);
      setIsCatalogOpen(true);
   };

   const handleToggleCatalogItem = (symbol: string) => {
      setTempCatalogSelection((prev) => {
         if (prev.includes(symbol)) {
            return prev.filter(s => s !== symbol);
         }
         if (prev.length >= 4) {
            return prev;
         }
         return [...prev, symbol];
      });
   };

   const handleApplyCatalog = () => {
      const internalItems = selectedCompareItems.filter(i => isAssetCategory(i) || i === 'All' || i === 'Global Portfolio');
      if (internalItems.length === 0) {
         setSelectedCompareItems(['All', ...tempCatalogSelection]);
      } else {
         setSelectedCompareItems([...internalItems, ...tempCatalogSelection]);
      }
      setIsCatalogOpen(false);
   };

   const cardStyle = "rounded-2xl bg-card p-6 shadow-lg border border-border";

   if (!summary && isLoading) {
      return (
         <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4" role="status" aria-live="polite">
            <AppThinkingOrb state="searching" size={72} label={t('common:labels.loading')} />
            <span className="text-xs sm:text-sm font-semibold text-secondary tracking-wide">
               {t('common:labels.loading')}
            </span>
         </div>
      );
   }

   if (!summary) return null;

   return (
      <div className="space-y-8">
         {/* Top Header & Back Button */}
         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-subtle">
            <div className="flex items-center gap-4">
               <button
                  onClick={() => navigate('/analytics')}
                  className="p-2.5 rounded-xl bg-subtle hover:bg-subtle/80 text-secondary hover:text-primary transition-colors"
                  title={t('reports:backToReports')}
               >
                  <ArrowLeft size={20} />
               </button>
               <div>
                  <h1 className="text-3xl font-bold text-primary mb-1">{t('reports:performance.title')}</h1>
                  <p className="text-secondary text-sm">{t('reports:performance.subtitle')}</p>
               </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <ChartModeToggle mode={chartMode} onChange={mode => void setChartMode(mode)} />
            {/* Time Period Selector */}
            <div className="flex items-center gap-1 bg-subtle p-1 rounded-xl border border-subtle">
               {(['1M', '3M', 'YTD', '1Y', 'ALL'] as const).map((range) => (
                  <button
                     key={range}
                     onClick={() => setTimeRange(range)}
                     className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                        timeRange === range
                           ? 'bg-card text-brand shadow-sm border border-subtle font-bold'
                           : 'text-secondary hover:text-primary'
                     }`}
                  >
                     {range}
                  </button>
               ))}
            </div>
            </div>
         </div>

         {/* Metric Cards Row */}
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* 1. Total Value */}
            <div className={cardStyle}>
               <span className="text-tertiary text-xs font-bold uppercase tracking-wider">{t('reports:performance.totalValue')}</span>
               <div className="mt-2 text-2xl font-extrabold text-primary">
                  <AnimatedCounter value={summary.totalValue} currency={currency} locale={locale} />
               </div>
               <p className="text-tertiary text-[10px] mt-1">{t('dashboard:realTimeEstimate')}</p>
            </div>

            {/* 2. Total Invested */}
            <div className={cardStyle}>
               <span className="text-tertiary text-xs font-bold uppercase tracking-wider">{t('reports:performance.totalInvested')}</span>
               <div className="mt-2 text-2xl font-extrabold text-primary">
                  <AnimatedCounter value={summary.totalCost} currency={currency} locale={locale} />
               </div>
               <p className="text-tertiary text-[10px] mt-1">{t('reports:performance.costBasisDisclaimer')}</p>
            </div>

            {/* 3. Portfolio Return */}
            <div className={cardStyle}>
               <span className="text-tertiary text-xs font-bold uppercase tracking-wider">{t('reports:performance.totalReturn')} ({timeRange})</span>
               <div className="mt-2 flex items-center gap-2">
                  <TrendValue
                     value={portfolioReturnPct}
                     format="percent"
                     decimals={2}
                     showPlusSign
                     showIcon
                     iconSize={20}
                     className="text-2xl font-extrabold"
                     animated
                  />
               </div>
               <p className="text-tertiary text-[10px] mt-1">
                  <AnimatedCounter value={periodGain} currency={currency} locale={locale} />
               </p>
            </div>

            {/* 4. Benchmark Return */}
            <div className={cardStyle}>
               <span className="text-tertiary text-xs font-bold uppercase tracking-wider">{t('reports:performance.benchmarkValue')} ({benchmarkRate}%)</span>
               <div className="mt-2 flex items-center gap-2">
                  <TrendValue
                     value={benchmarkReturnPct}
                     format="percent"
                     decimals={2}
                     showPlusSign
                     showIcon={false}
                     className="text-2xl font-extrabold text-warning"
                     animated
                  />
               </div>
               <p className="text-tertiary text-[10px] mt-1">
                  <AnimatedCounter value={Math.max(0, lastBenchmarkVal - summary.totalCost)} currency={currency} locale={locale} /> ({t('reports:performance.interestGains')})
               </p>
            </div>

            {/* 5. Outperformance Delta */}
            <div className={cardStyle}>
               <span className="text-tertiary text-xs font-bold uppercase tracking-wider">
                  {isOutperforming ? t('reports:performance.outperformance') : t('reports:performance.underperformance')}
               </span>
               <div className="mt-2 flex items-center gap-2">
                  <TrendValue
                     value={outperformancePct}
                     format="percent"
                     decimals={2}
                     showPlusSign
                     showIcon={false}
                     className="text-2xl font-extrabold"
                     animated
                  />
                  {isOutperforming ? <Award size={20} className="text-warning" /> : <ShieldAlert size={20} className="text-negative" />}
               </div>
               <p className="text-tertiary text-[10px] mt-1">vs Benchmark @ {benchmarkRate}%</p>
            </div>
         </div>

         {/* Benchmark Rate Control Bar */}
         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-subtle/50 border border-subtle">
            <div className="flex items-center gap-2">
               <Percent size={18} className="text-brand" />
               <span className="text-sm font-semibold text-primary">{t('reports:performance.benchmarkLabel')}</span>
            </div>
            <div className="flex items-center gap-3">
               <span className="text-xs text-secondary font-medium">{t('reports:performance.benchmarkRate')}:</span>
               <div className="flex items-center gap-1.5">
                  {[2.0, 3.0, 4.0, 5.0].map((rate) => (
                     <button
                        key={rate}
                        onClick={() => setBenchmarkRate(rate)}
                        className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                           benchmarkRate === rate
                              ? 'bg-brand text-white shadow-sm'
                              : 'bg-card text-secondary hover:text-primary border border-subtle'
                        }`}
                     >
                        {rate}%
                     </button>
                  ))}
                  <div className="flex items-center gap-1 ml-2 bg-card border border-subtle rounded-md px-2 py-1">
                     <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="20"
                        value={benchmarkRate}
                        onChange={(e) => setBenchmarkRate(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-12 text-xs font-bold text-primary bg-transparent text-right outline-none"
                     />
                     <span className="text-xs font-bold text-tertiary">%</span>
                  </div>
               </div>
            </div>
         </div>

         {/* Main Benchmark Comparison Chart */}
         <div className={cardStyle}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
               <div>
                  <h3 className="text-xl font-bold text-primary">{t('reports:performance.benchmarkComparison')}</h3>
                  <p className="text-tertiary text-xs">{t('reports:performance.subtitle')}</p>
               </div>
            </div>

            <div className="h-[380px] w-full">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart key={`${timeRange}-${benchmarkRate}`} data={combinedChartData} margin={{ top: 10, right: 25, left: 25, bottom: 0 }}>
                     <defs>
                        <linearGradient id="colorPortfolio" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                           <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="colorBenchmark" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="var(--color-accent-amber)" stopOpacity={0.25} />
                           <stop offset="95%" stopColor="var(--color-accent-amber)" stopOpacity={0.0} />
                        </linearGradient>
                     </defs>
                     <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500 }}
                        interval="equidistantPreserveStart"
                        minTickGap={30}
                        dy={10}
                     />
                     <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500 }}
                        tickFormatter={(val: number) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(val)}
                     />
                     <Tooltip
                        content={({ active, payload }) => {
                           if (active && payload && payload.length) {
                              const pVal = payload.find(p => p.dataKey === 'portfolioValue')?.value || 0;
                              const bVal = payload.find(p => p.dataKey === 'benchmarkValue')?.value || 0;
                              const dateName = payload[0].payload?.name || '';
                              const diff = Number(pVal) - Number(bVal);

                              return (
                                 <div className="bg-card border border-border p-3 rounded-xl shadow-xl text-xs space-y-1.5 min-w-[180px]">
                                    <p className="text-[10px] text-tertiary font-bold uppercase tracking-wider">{dateName}</p>
                                    <div className="flex justify-between items-center text-primary font-bold">
                                       <span className="flex items-center gap-1.5">
                                          <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
                                          {t('reports:performance.portfolioValue')}
                                       </span>
                                       <span>{formatCurrency(Number(pVal), currency, locale, { maximumFractionDigits: 0 })}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-warning font-bold">
                                       <span className="flex items-center gap-1.5">
                                          <span className="w-2.5 h-2.5 rounded-full bg-warning inline-block" />
                                          {t('reports:performance.benchmarkWithRate', { rate: benchmarkRate })}
                                       </span>
                                       <span>{formatCurrency(Number(bVal), currency, locale, { maximumFractionDigits: 0 })}</span>
                                    </div>
                                    <div className="pt-1.5 border-t border-subtle flex justify-between text-[11px] font-bold">
                                       <span className="text-tertiary">{t('reports:performance.delta')}</span>
                                       <span className={diff >= 0 ? 'text-positive' : 'text-negative'}>
                                          {diff >= 0 ? '+' : ''}{formatCurrency(diff, currency, locale, { maximumFractionDigits: 0 })}
                                       </span>
                                    </div>
                                 </div>
                              );
                           }
                           return null;
                        }}
                     />
                     <Legend
                        verticalAlign="top"
                        align="right"
                        height={36}
                        iconType="circle"
                        formatter={(val) => <span className="text-xs font-bold text-secondary mr-4">{val === 'portfolioValue' ? t('reports:performance.portfolioValue') : `Benchmark (${benchmarkRate}%)`}</span>}
                     />
                     <Area
                        type="monotone"
                        name="portfolioValue"
                        dataKey="portfolioValue"
                        stroke="var(--color-primary)"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorPortfolio)"
                        isAnimationActive={true}
                        animationDuration={ANIMATION_DURATION_MS}
                        animationEasing={ANIMATION_EASING}
                     />
                     <Area
                        type="monotone"
                        name="benchmarkValue"
                        dataKey="benchmarkValue"
                        stroke="var(--color-accent-amber)"
                        strokeWidth={2.5}
                        strokeDasharray="4 4"
                        fillOpacity={1}
                        fill="url(#colorBenchmark)"
                        isAnimationActive={true}
                        animationDuration={ANIMATION_DURATION_MS}
                        animationEasing={ANIMATION_EASING}
                     />
                  </AreaChart>
               </ResponsiveContainer>
            </div>
         </div>

         {/* Multi-Asset & Category Comparison Tool */}
         <div className={cardStyle}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
               <div>
                  <h3 className="text-xl font-bold text-primary">{t('reports:performance.assetComparison')}</h3>
                  <p className="text-tertiary text-xs">{t('reports:performance.assetComparisonSubtitle')}</p>
               </div>

               <div className="flex flex-wrap items-center gap-3">
                  {/* Curve Display Mode Toggle (Separate vs Merged) */}
                  <div className="flex items-center gap-1 bg-subtle p-1 rounded-xl border border-subtle">
                     <button
                        onClick={() => setCurveMode('separate')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                           curveMode === 'separate'
                              ? 'bg-card text-brand shadow-sm border border-subtle'
                              : 'text-secondary hover:text-primary'
                        }`}
                     >
                        {t('reports:performance.separateCurves')}
                     </button>
                     <button
                        onClick={() => setCurveMode('merged')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                           curveMode === 'merged'
                              ? 'bg-card text-brand shadow-sm border border-subtle'
                              : 'text-secondary hover:text-primary'
                        }`}
                     >
                        {t('reports:performance.mergedCurve')}
                     </button>
                  </div>

                  {/* Time Period Selector for Comparison Chart */}
                  <div className="flex items-center gap-1 bg-subtle p-1 rounded-xl border border-subtle">
                     {(['1M', '3M', '1Y', 'ALL'] as const).map((range) => (
                        <button
                           key={range}
                           onClick={() => setCompareTimeRange(range)}
                           className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                              compareTimeRange === range
                                 ? 'bg-card text-brand shadow-sm border border-subtle'
                                 : 'text-secondary hover:text-primary'
                           }`}
                        >
                           {range}
                        </button>
                     ))}
                  </div>
               </div>
            </div>

            {/* Selection Controls Row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 p-4 bg-subtle/50 rounded-xl border border-subtle">
               {/* Asset Classes Pills */}
               <div className="flex flex-wrap items-center gap-2 flex-1">
                  <span className="text-xs font-semibold text-tertiary mr-1">{t('reports:performance.categoriesAndAssets')}</span>
                  
                  {/* "All" Pill Button */}
                  <button
                     onClick={() => toggleCompareItem('All')}
                     className="px-3 py-1 text-xs font-bold rounded-lg border transition-all"
                     style={{
                        borderColor: (selectedCompareItems.includes('All') || selectedCompareItems.includes('Global Portfolio')) ? 'var(--color-accent-indigo)' : 'var(--border-subtle)',
                        backgroundColor: (selectedCompareItems.includes('All') || selectedCompareItems.includes('Global Portfolio')) ? 'var(--color-accent-indigo-subtle)' : 'var(--bg-card)',
                        color: (selectedCompareItems.includes('All') || selectedCompareItems.includes('Global Portfolio')) ? 'var(--color-accent-indigo)' : 'var(--text-tertiary)'
                     }}
                  >
                     {t('reports:performance.globalPortfolio')}
                  </button>

                  {/* Internal Category Pills with Associated Colors */}
                  {ASSET_CLASSES.map((cls) => {
                     const isSelected = selectedCompareItems.includes(cls);
                     const config = ASSET_CLASSES_CONFIG.find(c => c.id === cls);
                     const label = config ? t(`portfolio:categories.${config.i18nKey}`) : cls;
                     const hexColor = getItemColor(cls);

                     return (
                        <button
                           key={cls}
                           onClick={() => toggleCompareItem(cls)}
                           className="px-3 py-1 text-xs font-bold rounded-lg border transition-all"
                           style={{
                              borderColor: isSelected ? hexColor : 'var(--border-subtle)',
                              backgroundColor: isSelected ? `color-mix(in srgb, ${hexColor} 18%, transparent)` : 'var(--bg-card)',
                              color: isSelected ? hexColor : 'var(--text-tertiary)'
                           }}
                        >
                           {label}
                        </button>
                     );
                  })}

                  {/* Custom Searched Reference Assets Pills */}
                  {selectedReferenceAssets.map((item) => {
                     const hexColor = getItemColor(item);
                     return (
                        <button
                           key={item}
                           onClick={() => toggleCompareItem(item)}
                           className="px-3 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 shadow-sm"
                           style={{
                              borderColor: hexColor,
                              backgroundColor: `color-mix(in srgb, ${hexColor} 18%, transparent)`,
                              color: hexColor
                           }}
                        >
                           <span>{item}</span>
                           <span>✕</span>
                        </button>
                     );
                  })}
               </div>

               {/* Ticker Search & Catalog Modal Trigger */}
               <div className="flex flex-wrap items-center gap-2">
                  {/* Catalog Picker Button */}
                  <button
                     onClick={handleOpenCatalog}
                     className="flex items-center gap-1.5 px-3 py-2 bg-subtle hover:bg-subtle/80 border border-subtle rounded-lg text-xs font-bold text-primary transition-colors shadow-sm"
                     title={t('reports:performance.catalogModalTitle')}
                  >
                     <BookOpen size={15} className="text-brand" />
                     <span>{t('reports:performance.catalogButton')}</span>
                  </button>

                  <div className="relative">
                     <div className="flex items-center gap-2">
                        <div className="relative">
                           <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-tertiary" size={14} />
                           <input
                              type="text"
                              placeholder={selectedReferenceAssets.length >= 4 ? t('reports:performance.maxTickersReached') : t('reports:performance.searchTickerPlaceholder')}
                              disabled={selectedReferenceAssets.length >= 4}
                              value={searchInputValue}
                              onFocus={() => setIsSearchFocused(true)}
                              onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
                              onChange={(e) => setSearchInputValue(e.target.value)}
                              onKeyDown={(e) => {
                                 if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddSearchItem();
                                 }
                              }}
                              className="bg-card border border-subtle text-primary text-xs rounded-lg focus:ring-brand focus:border-brand pl-9 p-2 w-64 placeholder-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
                           />
                           {isSearching && (
                              <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-brand animate-spin" size={14} />
                           )}
                        </div>
                        <button 
                           onClick={handleAddSearchItem}
                           disabled={selectedReferenceAssets.length >= 4 || !searchInputValue.trim() || searchResults.length === 0}
                           className="p-2 bg-brand text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand/90 transition-colors"
                        >
                           <Plus size={16} />
                        </button>
                     </div>

                     {/* Live API Autocomplete Dropdown */}
                     {isSearchFocused && searchInputValue.trim() !== '' && (
                        <div className="absolute right-0 top-full mt-1.5 w-72 bg-card border border-subtle rounded-xl shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                           {isSearching ? (
                              <div className="p-4 text-xs text-tertiary flex items-center justify-center gap-2">
                                 <Loader2 className="animate-spin text-brand" size={14} />
                                 <span>{t('reports:performance.searching')}</span>
                              </div>
                           ) : searchResults.length > 0 ? (
                              searchResults.map((item) => (
                                 <button
                                    key={item.symbol}
                                    onMouseDown={() => handleSelectSuggestion(item.symbol)}
                                    className="w-full text-left px-3 py-2.5 text-xs hover:bg-subtle text-primary transition-colors flex items-center justify-between border-b border-subtle/40 last:border-0"
                                 >
                                    <div className="min-w-0 pr-2">
                                       <span className="font-extrabold text-primary block truncate">{item.symbol}</span>
                                       <span className="text-[10px] text-secondary truncate block">{item.name}</span>
                                    </div>
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-subtle text-tertiary whitespace-nowrap">
                                       {item.exchange}
                                    </span>
                                 </button>
                              ))
                           ) : (
                              <div className="p-3 text-xs text-tertiary text-center">
                                 {t('reports:performance.noTickerFound')}
                              </div>
                           )}
                        </div>
                     )}
                  </div>
               </div>
            </div>

            {/* Dual Stacked Charts View */}
            <div className="space-y-8">
               {/* CHART 1: % Return */}
               <div>
                  <div className="flex items-center justify-between mb-3 px-1">
                     <span className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-brand inline-block" />
                        {t('reports:performance.percentReturn')}
                     </span>
                  </div>
                  <div className="h-[280px] w-full">
                     <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={comparisonChartData} margin={{ top: 10, right: 25, left: 25, bottom: 0 }}>
                           <XAxis
                              dataKey="dateName"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500 }}
                              interval="equidistantPreserveStart"
                              minTickGap={30}
                              dy={10}
                           />
                           <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500 }}
                              tickFormatter={(val) => `${val}%`}
                           />
                           <ReferenceLine
                              y={0}
                              stroke="var(--border-strong)"
                              strokeDasharray="3 3"
                              strokeWidth={1.5}
                           />
                           <Tooltip
                              content={({ active, payload }) => {
                                 if (active && payload && payload.length) {
                                    return (
                                       <div className="bg-card border border-border p-3 rounded-xl shadow-xl text-xs space-y-1.5 min-w-[160px]">
                                          <p className="text-[10px] text-tertiary font-bold uppercase tracking-wider">{payload[0].payload?.dateName}</p>
                                          {payload.map((p, i) => (
                                             <div key={i} className="flex justify-between items-center font-bold" style={{ color: p.color }}>
                                                <span>{p.name}</span>
                                                <span>{Number(p.value) >= 0 ? '+' : ''}{p.value}%</span>
                                             </div>
                                          ))}
                                       </div>
                                    );
                                 }
                                 return null;
                              }}
                           />
                           <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
                           {curveMode === 'merged' && selectedInternalCategories.length > 1 ? (
                              <>
                                 <Line
                                    key="Merged Selection"
                                    type="monotone"
                                    name={t('reports:performance.mergedSelection')}
                                    dataKey="Merged Selection"
                                    stroke="var(--color-primary)"
                                    strokeWidth={3}
                                    dot={false}
                                    isAnimationActive={true}
                                    animationDuration={ANIMATION_DURATION_MS}
                                    animationEasing={ANIMATION_EASING}
                                 />
                                 {(selectedCompareItems.includes('All') || selectedCompareItems.includes('Global Portfolio')) && (
                                    <Line
                                       key="All"
                                       type="monotone"
                                       name={t('reports:performance.globalPortfolio')}
                                       dataKey="All"
                                       stroke="var(--color-accent-blue)"
                                       strokeWidth={3}
                                       dot={false}
                                       isAnimationActive={true}
                                       animationDuration={ANIMATION_DURATION_MS}
                                       animationEasing={ANIMATION_EASING}
                                    />
                                 )}
                                 {selectedReferenceAssets.map((refAsset) => {
                                    const color = getItemColor(refAsset);
                                    return (
                                       <Line
                                          key={refAsset}
                                          type="monotone"
                                          name={refAsset}
                                          dataKey={refAsset}
                                          stroke={color}
                                          strokeWidth={2.5}
                                          strokeDasharray="4 4"
                                          dot={false}
                                          isAnimationActive={true}
                                          animationDuration={ANIMATION_DURATION_MS}
                                          animationEasing={ANIMATION_EASING}
                                       />
                                    );
                                 })}
                              </>
                           ) : (
                              selectedCompareItems.map((item) => {
                                 const isAll = item === 'All' || item === 'Global Portfolio';
                                 const color = getItemColor(item);
                                 const displayName = isAll 
                                    ? t('reports:performance.globalPortfolio') 
                                    : (ASSET_CLASSES_CONFIG.find(c => c.id === item) 
                                         ? t(`portfolio:categories.${ASSET_CLASSES_CONFIG.find(c => c.id === item)?.i18nKey}`) 
                                         : item);

                                 return (
                                    <Line
                                       key={item}
                                       type="monotone"
                                       name={displayName}
                                       dataKey={item}
                                       stroke={color}
                                       strokeWidth={isAll ? 3 : 2.5}
                                       strokeDasharray={isAll ? '0' : (isAssetCategory(item) ? '0' : '4 4')}
                                       dot={false}
                                       isAnimationActive={true}
                                       animationDuration={ANIMATION_DURATION_MS}
                                       animationEasing={ANIMATION_EASING}
                                    />
                                 );
                              })
                           )}
                        </LineChart>
                     </ResponsiveContainer>
                  </div>
               </div>

               <div className="border-t border-subtle my-2" />

               {/* CHART 2: Base 100 Rebased Index */}
               <div>
                  <div className="flex items-center justify-between mb-3 px-1">
                     <span className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-accent-purple inline-block" />
                        {t('reports:performance.indexEvolution')}
                     </span>
                  </div>
                  <div className="h-[280px] w-full">
                     <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={comparisonChartData} margin={{ top: 10, right: 25, left: 25, bottom: 0 }}>
                           <XAxis
                              dataKey="dateName"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500 }}
                              interval="equidistantPreserveStart"
                              minTickGap={30}
                              dy={10}
                           />
                           <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500 }}
                              tickFormatter={(val) => `${val}`}
                           />
                           <ReferenceLine
                              y={100}
                              stroke="var(--border-strong)"
                              strokeDasharray="3 3"
                              strokeWidth={1.5}
                           />
                           <Tooltip
                              content={({ active, payload }) => {
                                 if (active && payload && payload.length) {
                                    return (
                                       <div className="bg-card border border-border p-3 rounded-xl shadow-xl text-xs space-y-1.5 min-w-[160px]">
                                          <p className="text-[10px] text-tertiary font-bold uppercase tracking-wider">{payload[0].payload?.dateName}</p>
                                          {payload.map((p, i) => (
                                             <div key={i} className="flex justify-between items-center font-bold" style={{ color: p.color }}>
                                                <span>{p.name}</span>
                                                <span>{p.value} pts</span>
                                             </div>
                                          ))}
                                       </div>
                                    );
                                 }
                                 return null;
                              }}
                           />
                           <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
                           {curveMode === 'merged' && selectedInternalCategories.length > 1 ? (
                              <>
                                 <Line
                                    key="Merged Selection"
                                    type="monotone"
                                    name={t('reports:performance.mergedSelection')}
                                    dataKey="Merged Selection_base100"
                                    stroke="var(--color-primary)"
                                    strokeWidth={3}
                                    dot={false}
                                    isAnimationActive={true}
                                    animationDuration={ANIMATION_DURATION_MS}
                                    animationEasing={ANIMATION_EASING}
                                 />
                                 {(selectedCompareItems.includes('All') || selectedCompareItems.includes('Global Portfolio')) && (
                                    <Line
                                       key="All"
                                       type="monotone"
                                       name={t('reports:performance.globalPortfolio')}
                                       dataKey="All_base100"
                                       stroke="var(--color-accent-blue)"
                                       strokeWidth={3}
                                       dot={false}
                                       isAnimationActive={true}
                                       animationDuration={ANIMATION_DURATION_MS}
                                       animationEasing={ANIMATION_EASING}
                                    />
                                 )}
                                 {selectedReferenceAssets.map((refAsset) => {
                                    const color = getItemColor(refAsset);
                                    return (
                                       <Line
                                          key={refAsset}
                                          type="monotone"
                                          name={refAsset}
                                          dataKey={`${refAsset}_base100`}
                                          stroke={color}
                                          strokeWidth={2.5}
                                          strokeDasharray="4 4"
                                          dot={false}
                                          isAnimationActive={true}
                                          animationDuration={ANIMATION_DURATION_MS}
                                          animationEasing={ANIMATION_EASING}
                                       />
                                    );
                                 })}
                              </>
                           ) : (
                              selectedCompareItems.map((item) => {
                                 const isAll = item === 'All' || item === 'Global Portfolio';
                                 const color = getItemColor(item);
                                 const displayName = isAll 
                                    ? t('reports:performance.globalPortfolio') 
                                    : (ASSET_CLASSES_CONFIG.find(c => c.id === item) 
                                         ? t(`portfolio:categories.${ASSET_CLASSES_CONFIG.find(c => c.id === item)?.i18nKey}`) 
                                         : item);

                                 return (
                                    <Line
                                       key={item}
                                       type="monotone"
                                       name={displayName}
                                       dataKey={`${item}_base100`}
                                       stroke={color}
                                       strokeWidth={isAll ? 3 : 2.5}
                                       strokeDasharray={isAll ? '0' : (isAssetCategory(item) ? '0' : '4 4')}
                                       dot={false}
                                       isAnimationActive={true}
                                       animationDuration={ANIMATION_DURATION_MS}
                                       animationEasing={ANIMATION_EASING}
                                    />
                                 );
                              })
                           )}
                        </LineChart>
                     </ResponsiveContainer>
                  </div>
               </div>
            </div>
         </div>

         {/* Grand Popup Modal: Reference Assets Selection Catalogue */}
         {isCatalogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
               <div className="bg-card border border-subtle shadow-2xl rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between p-6 border-b border-subtle">
                     <div>
                        <h2 className="text-xl font-bold text-primary">{t('reports:performance.catalogModalTitle')}</h2>
                        <p className="text-xs text-tertiary mt-1">{t('reports:performance.catalogModalSubtitle')}</p>
                     </div>
                     <button
                        onClick={() => setIsCatalogOpen(false)}
                        className="p-2 rounded-xl bg-subtle hover:bg-subtle/80 text-secondary hover:text-primary transition-colors"
                     >
                        <X size={20} />
                     </button>
                  </div>

                  {/* Category Tabs */}
                  <div className="flex items-center gap-2 px-6 pt-4 border-b border-subtle bg-subtle/30 overflow-x-auto custom-scrollbar">
                     {(['etf', 'stocks', 'crypto', 'indices'] as const).map((tabKey) => {
                        const isActive = catalogActiveTab === tabKey;
                        const label = t(`reports:performance.tabs.${tabKey}`);
                        return (
                           <button
                              key={tabKey}
                              onClick={() => setCatalogActiveTab(tabKey)}
                              className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
                                 isActive
                                    ? 'bg-card text-brand border-brand shadow-sm'
                                    : 'text-secondary hover:text-primary border-transparent'
                              }`}
                           >
                              {label}
                           </button>
                        );
                     })}
                  </div>

                  {/* Grid Content */}
                  <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                     <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {CURATED_CATALOG
                           .filter((item) => item.category === catalogActiveTab)
                           .map((item) => {
                              const isSelected = tempCatalogSelection.includes(item.symbol);
                              const isMaxReached = tempCatalogSelection.length >= 4 && !isSelected;
                              const itemColor = getItemColor(item.symbol, tempCatalogSelection);

                              return (
                                 <button
                                    key={item.symbol}
                                    disabled={isMaxReached}
                                    onClick={() => handleToggleCatalogItem(item.symbol)}
                                    className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                                       isSelected
                                          ? 'shadow-sm'
                                          : isMaxReached
                                          ? 'opacity-40 cursor-not-allowed bg-subtle/50 border-subtle'
                                          : 'bg-subtle/40 border-subtle hover:bg-subtle/80 hover:border-subtle/80'
                                    }`}
                                    style={isSelected ? { borderColor: itemColor, backgroundColor: `${itemColor}18` } : undefined}
                                 >
                                    <div className="space-y-1 min-w-0 pr-2">
                                       <div className="flex items-center gap-2">
                                          <span className="font-extrabold text-xs text-primary" style={{ color: isSelected ? itemColor : undefined }}>
                                             {item.symbol}
                                          </span>
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-subtle text-tertiary font-semibold truncate max-w-[120px]">
                                             {item.exchange}
                                          </span>
                                       </div>
                                       <p className="text-xs font-medium text-secondary truncate">{item.name}</p>
                                    </div>
                                    <div 
                                       className={`w-5 h-5 rounded-lg flex items-center justify-center border text-xs transition-all flex-shrink-0 ${
                                          isSelected
                                             ? 'text-white'
                                             : 'border-subtle bg-card text-transparent'
                                       }`}
                                       style={isSelected ? { backgroundColor: itemColor, borderColor: itemColor } : undefined}
                                    >
                                       <Check size={13} className={isSelected ? 'block' : 'hidden'} />
                                    </div>
                                 </button>
                              );
                           })}
                     </div>
                  </div>

                  {/* Footer */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 px-6 border-t border-subtle bg-subtle/30">
                     <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-secondary">
                           {t('reports:performance.selectedCount', { count: tempCatalogSelection.length })}
                        </span>
                        {tempCatalogSelection.length >= 4 && (
                           <span className="text-[11px] font-bold text-warning">
                              ({t('reports:performance.maxSelectedNotice')})
                           </span>
                        )}
                     </div>
                     <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        {tempCatalogSelection.length > 0 && (
                           <button
                              onClick={() => setTempCatalogSelection([])}
                              className="px-3.5 py-2 text-xs font-bold rounded-xl text-tertiary hover:text-primary transition-colors"
                           >
                              {t('reports:performance.clearSelection')}
                           </button>
                        )}
                        <button
                           onClick={handleApplyCatalog}
                           className="px-5 py-2 text-xs font-bold rounded-xl bg-brand text-white hover:bg-brand/90 transition-all shadow-md"
                        >
                           {t('reports:performance.applySelection')}
                        </button>
                     </div>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};

export default PortfolioPerformance;