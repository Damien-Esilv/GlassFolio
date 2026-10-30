import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import {
   ArrowLeft,
   Coins,
   ExternalLink,
   Scale,
   Percent,
   CheckCircle2,
   ArrowRight,
   Layers,
   Globe,
   PieChart
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { etfFeeService, KNOWN_ETF_DB, ETFRecommendation } from '../services/etfFeeService';
import { formatCurrency } from '../utils/currency';
import { currencyService } from '../services/currencyService';
import AnimatedCounter from '../components/AnimatedCounter';
import { ANIMATION_DURATION_MS, ANIMATION_EASING } from '../constants/animations';
import { CHART_SERIES_PALETTE } from '../constants/themeTokens';

const FeeAnalysis: React.FC = () => {
   const { t } = useTranslation();
   const navigate = useNavigate();
   const { user } = useAuth();
   const { positions } = useData();
   const locale = user?.preferences?.language === 'fr' ? 'fr-FR' : 'en-US';
   const currency = user?.preferences?.currency || 'EUR';

   // Horizon state for fee drag calculator: 10, 20, 30, 50 years
   const [horizonYears, setHorizonYears] = useState<10 | 20 | 30 | 50>(20);
   // Scale mode for the Y-axis of the fee drag chart
   const [scaleMode, setScaleMode] = useState<'global' | 'zoomed'>('global');

   // Period selection state for Side-by-Side ETF comparison tool (6M, 1Y, 3Y, 5Y)
   const [comparePeriod, setComparePeriod] = useState<'6M' | '1Y' | '3Y' | '5Y'>('1Y');
   // Scale mode for Y-axis of Side-by-Side ETF comparison line chart ('global' vs 'zoomed')
   const [compareScaleMode, setCompareScaleMode] = useState<'global' | 'zoomed'>('global');

   // Active tab for Sector vs Geography breakdown comparison ('sectors' vs 'geography')
   const [allocationTab, setAllocationTab] = useState<'sectors' | 'geography'>('sectors');

   // Selected optimization index from the recommendations list
   const [selectedOptIndex, setSelectedOptIndex] = useState<number>(0);

   // Side-by-side ETF comparison tool selection state (ticker symbols)
   const [selectedCompareSymbols, setSelectedCompareSymbols] = useState<string[]>([]);

   // Analyze ETF holdings using service
   const feeAnalysis = useMemo(() => {
      return etfFeeService.analyzeEtfFees(positions, currency);
   }, [positions, currency]);

   // Separate optimizable recommendations (>0.01 savings) vs already optimized
   const optimizableRecs = useMemo(() => {
      return feeAnalysis.recommendations.filter(r => r.annualSavings > 0.01);
   }, [feeAnalysis]);

   const alreadyOptimizedRecs = useMemo(() => {
      return feeAnalysis.recommendations.filter(r => r.annualSavings <= 0.01);
   }, [feeAnalysis]);

   const hasEtfPositions = positions.some(p => p.type === 'ETF') || feeAnalysis.recommendations.length > 0;

   // Dynamically generate available ETFs list for manual comparison selection
   const availableEtfList = useMemo(() => {
      const set = new Set<string>();
      feeAnalysis.recommendations.forEach(rec => {
         set.add(rec.heldPosition.symbol.toUpperCase());
         set.add(rec.cheapestSimilar.symbol.toUpperCase());
      });
      Object.values(KNOWN_ETF_DB).forEach(info => {
         set.add(info.symbol.toUpperCase());
      });
      return Array.from(set);
   }, [feeAnalysis]);

   // Initialize comparison selection based on active optimization item or available ETFs
   useEffect(() => {
      if (optimizableRecs.length > 0) {
         const currentIdx = Math.min(selectedOptIndex, optimizableRecs.length - 1);
         const rec = optimizableRecs[currentIdx];
         if (rec) {
            setSelectedCompareSymbols([
               rec.heldPosition.symbol.toUpperCase(),
               rec.cheapestSimilar.symbol.toUpperCase()
            ]);
         }
      } else if (availableEtfList.length > 0 && selectedCompareSymbols.length === 0) {
         setSelectedCompareSymbols(availableEtfList.slice(0, 2));
      }
   }, [optimizableRecs, selectedOptIndex, availableEtfList]);

   // Handle selecting an optimization card
   const handleSelectOptimizationCard = (index: number, rec: ETFRecommendation) => {
      setSelectedOptIndex(index);
      const heldSym = rec.heldPosition.symbol.toUpperCase();
      const altSym = rec.cheapestSimilar.symbol.toUpperCase();
      setSelectedCompareSymbols([heldSym, altSym]);
   };

   // Toggle manual ETF symbol in side-by-side comparison tool
   const toggleCompareSymbol = (sym: string) => {
      if (selectedCompareSymbols.includes(sym)) {
         if (selectedCompareSymbols.length > 1) {
            setSelectedCompareSymbols(selectedCompareSymbols.filter(s => s !== sym));
         }
      } else {
         setSelectedCompareSymbols([...selectedCompareSymbols, sym]);
      }
   };

   // Compute fee drag projection points for selected optimization or horizon
   // Projection of the user's own ETFs only: without any, there is nothing to project (no demo figures)
   const feeDragPoints = useMemo(() => {
      const activeRec = optimizableRecs[Math.min(selectedOptIndex, optimizableRecs.length - 1)] || feeAnalysis.recommendations[0];
      if (!activeRec) return [];

      const baseAmount = currencyService.convertAmount(activeRec.heldPosition.marketValue, activeRec.heldPosition.currency || 'EUR', currency);
      if (!(baseAmount > 0)) return [];
      return etfFeeService.calculateFeeDragProjection(baseAmount, activeRec.currentTer, activeRec.cheapestSimilar.ter, horizonYears);
   }, [feeAnalysis, optimizableRecs, selectedOptIndex, horizonYears, currency]);

   // Generate side-by-side comparison chart data dynamically based on selected time period
   const sideBySidePointsCount = useMemo(() => {
      switch (comparePeriod) {
         case '6M': return 6;
         case '1Y': return 12;
         case '3Y': return 36;
         case '5Y': return 60;
         default: return 12;
      }
   }, [comparePeriod]);

   const [sideBySideData, setSideBySideData] = useState<Array<Record<string, string | number>>>([]);
   useEffect(() => {
      let isMounted = true;
      etfFeeService.getSideBySideEtfComparisonData(selectedCompareSymbols, comparePeriod, sideBySidePointsCount, locale)
         .then((data) => { if (isMounted) setSideBySideData(data); })
         .catch(() => { if (isMounted) setSideBySideData([]); });
      return () => {
         isMounted = false;
      };
   }, [selectedCompareSymbols, comparePeriod, sideBySidePointsCount, locale]);

   // Generate Sector & Geography allocation comparison chart data
   const allocationChartData = useMemo(() => {
      // BOLT OPTIMIZATION: Pre-fetch breakdowns and construct an O(1) percentage Map per symbol
      // to avoid linear Array.find() and repeated etfFeeService.getEtfBreakdown() calls during row generation.
      const keysMap = new Map<string, string>(); // key -> labelKey
      const symbolMapList = selectedCompareSymbols.map(sym => {
         const breakdown = etfFeeService.getEtfBreakdown(sym);
         const list = allocationTab === 'sectors' ? breakdown.sectors : breakdown.geography;
         const map = new Map<string, number>();

         list.forEach(item => {
            if (!keysMap.has(item.key)) {
               keysMap.set(item.key, item.labelKey);
            }
            map.set(item.key, item.percentage);
         });

         return { sym, map };
      });

      return Array.from(keysMap.entries()).map(([key, labelKey]) => {
         const row: Record<string, string | number> = {
            categoryName: t(`reports:feeAnalysis.${labelKey}` as keyof typeof t) || key
         };

         symbolMapList.forEach(({ sym, map }) => {
            row[sym] = map.get(key) || 0;
         });

         return row;
      });
   }, [selectedCompareSymbols, allocationTab, t]);

   const cardStyle = "rounded-2xl bg-card p-6 shadow-lg border border-border";
   const ETF_COLORS = CHART_SERIES_PALETTE.map(slot => slot.cssVar);

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
                  <h1 className="text-3xl font-bold text-primary mb-1">{t('reports:feeAnalysis.title')}</h1>
                  <p className="text-secondary text-sm">{t('reports:feeAnalysis.subtitle')}</p>
               </div>
            </div>
         </div>

         {/* ROW 1: Summary Cards */}
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. Current Management Fees */}
            <div className={cardStyle}>
               <div className="flex items-center justify-between mb-2">
                  <span className="text-tertiary text-xs font-bold uppercase tracking-wider">{t('reports:feeAnalysis.currentAnnualFees')}</span>
                  <Coins size={18} className="text-tertiary" />
               </div>
               <div className="text-3xl font-extrabold text-primary">
                  <AnimatedCounter value={feeAnalysis.currentAnnualFees} currency={currency} locale={locale} />
                  <span className="text-sm font-semibold text-tertiary"> {t('reports:feeAnalysis.perYear')}</span>
               </div>
               <p className="text-tertiary text-xs mt-1">{t('reports:feeAnalysis.currentFeesDesc')}</p>
            </div>

            {/* 2. Yahoo Similar Alternative Fees */}
            <div className={cardStyle}>
               <div className="flex items-center justify-between mb-2">
                  <span className="text-tertiary text-xs font-bold uppercase tracking-wider">{t('reports:feeAnalysis.alternativeAnnualFees')}</span>
                  <Percent size={18} className="text-brand" />
               </div>
               <div className="text-3xl font-extrabold text-brand">
                  <AnimatedCounter value={feeAnalysis.alternativeAnnualFees} currency={currency} locale={locale} />
                  <span className="text-sm font-semibold text-tertiary"> {t('reports:feeAnalysis.perYear')}</span>
               </div>
               <p className="text-tertiary text-xs mt-1">{t('reports:feeAnalysis.alternativeFeesDesc')}</p>
            </div>

            {/* 3. Potential Annual Savings */}
            <div className={cardStyle}>
               <div className="flex items-center justify-between mb-2">
                  <span className="text-tertiary text-xs font-bold uppercase tracking-wider">{t('reports:feeAnalysis.potentialAnnualSavings')}</span>
                  <Coins size={18} className="text-accent-green" />
               </div>
               <div className="text-3xl font-extrabold text-accent-green">
                  <AnimatedCounter value={feeAnalysis.potentialAnnualSavings} currency={currency} locale={locale} />
                  <span className="text-sm font-semibold text-tertiary"> {t('reports:feeAnalysis.perYear')}</span>
               </div>
               <p className="text-tertiary text-xs mt-1">{t('reports:feeAnalysis.potentialSavingsDesc')}</p>
            </div>
         </div>

         {/* ROW 2: Optimization List OR Empty / All Optimized Banner */}
         {!hasEtfPositions ? (
            <div className={`${cardStyle} border-subtle bg-subtle/30 text-center py-10 px-6`}>
               <div className="w-12 h-12 rounded-full bg-subtle flex items-center justify-center mx-auto mb-3 text-tertiary">
                  <Layers size={24} />
               </div>
               <h3 className="text-lg font-bold text-primary mb-1">{t('reports:feeAnalysis.noEtfHeldTitle')}</h3>
               <p className="text-tertiary text-sm max-w-md mx-auto">{t('reports:feeAnalysis.noEtfHeldDesc')}</p>
            </div>
         ) : optimizableRecs.length === 0 ? (
            /* ALL OPTIMIZED BANNER */
            <div className={`${cardStyle} border-accent-green/30 bg-accent-green/5 space-y-6`}>
               <div className="flex items-start gap-4">
                  <div className="p-3 rounded-2xl bg-accent-green/10 text-accent-green shrink-0">
                     <Coins size={28} />
                  </div>
                  <div>
                     <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold text-primary">{t('reports:feeAnalysis.allOptimizedTitle')}</h3>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-accent-green/10 text-accent-green text-xs font-bold">
                           <CheckCircle2 size={12} />
                           {t('reports:feeAnalysis.fullyOptimal')}
                        </span>
                     </div>
                     <p className="text-secondary text-sm mt-1">{t('reports:feeAnalysis.allOptimizedDesc')}</p>
                  </div>
               </div>

               {/* Table of held optimized ETFs */}
               {alreadyOptimizedRecs.length > 0 && (
                  <div className="pt-4 border-t border-subtle">
                     <h4 className="text-xs font-bold uppercase tracking-wider text-tertiary mb-3">{t('reports:feeAnalysis.heldEtf')} ({alreadyOptimizedRecs.length})</h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {alreadyOptimizedRecs.map((rec, idx) => (
                           <div key={idx} className="p-4 rounded-xl bg-card border border-border flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                 <div className="w-9 h-9 rounded-xl bg-subtle flex items-center justify-center font-bold text-xs text-primary">
                                    {rec.heldPosition.symbol}
                                 </div>
                                 <div>
                                    <p className="font-bold text-sm text-primary">{rec.heldPosition.symbol}</p>
                                    <p className="text-xs text-tertiary truncate max-w-[180px]">{rec.heldPosition.instrument}</p>
                                 </div>
                              </div>
                              <div className="text-right">
                                 <span className="text-xs font-bold text-accent-green bg-accent-green/10 px-2.5 py-1 rounded-lg">
                                    {t('reports:feeAnalysis.terPrefix', { value: rec.currentTer.toFixed(2) })}
                                 </span>
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
               )}
            </div>
         ) : (
            /* OPTIMIZATIONS AVAILABLE LIST */
            <div className={cardStyle}>
               <div className="flex items-center justify-between mb-4">
                  <div>
                     <h3 className="text-xl font-bold text-primary">{t('reports:feeAnalysis.optimizationsFoundTitle')}</h3>
                     <p className="text-tertiary text-xs">{t('reports:feeAnalysis.optimizationsFoundSubtitle')}</p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-brand/10 text-brand text-xs font-bold">
                     {t('reports:feeAnalysis.assetsToOptimize', { count: optimizableRecs.length })}
                  </span>
               </div>

               {/* Interactive Cards Grid */}
               <div className="grid grid-cols-1 gap-4">
                  {optimizableRecs.map((rec, idx) => {
                     const isSelected = selectedOptIndex === idx;

                     return (
                        <div
                           key={idx}
                           onClick={() => handleSelectOptimizationCard(idx, rec)}
                           className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                              isSelected
                                 ? 'bg-brand/5 border-brand ring-2 ring-brand/20 shadow-md'
                                 : 'bg-subtle/30 border-subtle hover:border-brand/40 hover:bg-subtle/50'
                           }`}
                        >
                           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                              {/* Left: Held Asset vs Proposed Alternative */}
                              <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
                                 {/* Held Asset */}
                                 <div className="flex-1 p-3 rounded-xl bg-card border border-border">
                                    <span className="text-[10px] font-bold text-tertiary uppercase tracking-wider block mb-1">
                                       {t('reports:feeAnalysis.heldAssetLabel')}
                                    </span>
                                    <div className="flex items-baseline justify-between">
                                       <span className="font-extrabold text-primary text-base">{rec.heldPosition.symbol}</span>
                                       <span className="text-xs font-bold text-secondary">{t('reports:feeAnalysis.terSuffix', { value: rec.currentTer.toFixed(2) })}</span>
                                    </div>
                                    <p className="text-xs text-tertiary truncate mt-0.5">{rec.heldPosition.instrument}</p>
                                    <p className="text-xs font-semibold text-primary mt-1">
                                       {formatCurrency(rec.currentAnnualCost, currency, locale)} {t('reports:feeAnalysis.perYear')}
                                    </p>
                                 </div>

                                 {/* Arrow Icon */}
                                 <div className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full bg-subtle text-brand shrink-0">
                                    <ArrowRight size={16} />
                                 </div>

                                 {/* Recommended Alternative */}
                                 <div className="flex-1 p-3 rounded-xl bg-card border border-brand/30 shadow-sm">
                                    <span className="text-[10px] font-bold text-brand uppercase tracking-wider block mb-1">
                                       {t('reports:feeAnalysis.recommendedAlternativeLabel')}
                                    </span>
                                    <div className="flex items-baseline justify-between">
                                       <span className="font-extrabold text-brand text-base">{rec.cheapestSimilar.symbol}</span>
                                       <span className="text-xs font-bold text-accent-green">{t('reports:feeAnalysis.terSuffix', { value: rec.cheapestSimilar.ter.toFixed(2) })}</span>
                                    </div>
                                    <p className="text-xs text-tertiary truncate mt-0.5">{rec.cheapestSimilar.name}</p>
                                    <p className="text-xs font-semibold text-accent-green mt-1">
                                       {formatCurrency(rec.cheapestAnnualCost, currency, locale)} {t('reports:feeAnalysis.perYear')}
                                    </p>
                                 </div>
                              </div>

                              {/* Right: Potential Savings & Action Selection Button */}
                              <div className="flex flex-row md:flex-col items-center md:items-end justify-between gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-subtle shrink-0">
                                 <div className="text-left md:text-right">
                                    <span className="text-[10px] font-bold text-tertiary uppercase tracking-wider block">
                                       {t('reports:feeAnalysis.potentialAnnualSavings')}
                                    </span>
                                    <span className="text-lg font-extrabold text-accent-green">
                                       +{formatCurrency(rec.annualSavings, currency, locale)}
                                       <span className="text-xs font-semibold text-tertiary"> {t('reports:feeAnalysis.perYear')}</span>
                                    </span>
                                 </div>

                                 <button
                                    onClick={(e) => {
                                       e.stopPropagation();
                                       handleSelectOptimizationCard(idx, rec);
                                    }}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5 ${
                                       isSelected
                                          ? 'bg-brand text-white shadow-sm'
                                          : 'bg-brand/10 hover:bg-brand/20 text-brand'
                                    }`}
                                 >
                                    {isSelected ? (
                                       <>
                                          <CheckCircle2 size={14} />
                                          <span>{t('reports:feeAnalysis.selectedActive')}</span>
                                       </>
                                    ) : (
                                       <span>{t('reports:feeAnalysis.selectToCompare')}</span>
                                    )}
                                 </button>
                              </div>
                           </div>
                        </div>
                     );
                  })}
               </div>
            </div>
         )}

         {/* ROW 3: Side-by-Side ETF Comparison Dashboard */}
         <div className={cardStyle}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-subtle">
               <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-brand/10 text-brand">
                     <Scale size={22} />
                  </div>
                  <div>
                     <h3 className="text-xl font-bold text-primary">{t('reports:feeAnalysis.comparisonDashboardTitle')}</h3>
                     <p className="text-tertiary text-xs">
                        {t('reports:feeAnalysis.comparisonDashboardSubtitle')}: <span className="font-bold text-brand">{selectedCompareSymbols.join(' vs ')}</span>
                     </p>
                  </div>
               </div>

               {/* Control Bar: Time Period Selector + Zoom Mode Toggle + Multi-Select ETF Selector Pills */}
               <div className="flex flex-wrap items-center gap-3">
                  {/* Time Period Selector */}
                  <div className="flex items-center gap-1 bg-subtle p-1 rounded-xl border border-subtle">
                     <span className="text-xs font-semibold text-tertiary px-1.5">{t('reports:feeAnalysis.period')}:</span>
                     {(['6M', '1Y', '3Y', '5Y'] as const).map((p) => (
                        <button
                           key={p}
                           onClick={() => setComparePeriod(p)}
                           className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                              comparePeriod === p
                                 ? 'bg-card text-brand shadow-sm border border-subtle'
                                 : 'text-secondary hover:text-primary'
                           }`}
                        >
                           {p}
                        </button>
                     ))}
                  </div>

                  {/* Scale Mode / Zoom Toggle */}
                  <div className="flex items-center gap-1 bg-subtle p-1 rounded-xl border border-subtle">
                     <button
                        onClick={() => setCompareScaleMode('global')}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                           compareScaleMode === 'global'
                              ? 'bg-card text-primary shadow-sm border border-subtle'
                              : 'text-secondary hover:text-primary'
                        }`}
                     >
                        {t('reports:feeAnalysis.global')}
                     </button>
                     <button
                        onClick={() => setCompareScaleMode('zoomed')}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                           compareScaleMode === 'zoomed'
                              ? 'bg-card text-primary shadow-sm border border-subtle'
                              : 'text-secondary hover:text-primary'
                        }`}
                     >
                        {t('reports:feeAnalysis.zoom')}
                     </button>
                  </div>

                  {/* Multi-Select ETF Selector Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                     <span className="text-xs font-semibold text-tertiary mr-1">{t('reports:feeAnalysis.selectEtfs')}:</span>
                     {availableEtfList.map((sym) => {
                        const isSelected = selectedCompareSymbols.includes(sym);
                        return (
                           <button
                              key={sym}
                              onClick={() => toggleCompareSymbol(sym)}
                              className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
                                 isSelected
                                    ? 'bg-brand/10 text-brand border-brand/30 shadow-sm'
                                    : 'bg-card text-tertiary border-subtle hover:text-primary'
                              }`}
                           >
                              {sym}
                           </button>
                        );
                     })}
                  </div>
               </div>
            </div>

            {/* Performance Comparison Line Chart */}
            <div className="mb-8">
               <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-primary">
                     {t('reports:feeAnalysis.performanceChartTitle', { period: comparePeriod })}
                  </h4>
                  <span className="text-xs text-tertiary font-medium">
                     {compareScaleMode === 'zoomed' ? t('reports:feeAnalysis.zoomActiveCaption') : t('reports:feeAnalysis.globalViewCaption')}
                  </span>
               </div>
               <div className="h-[320px] w-full">
                  {sideBySideData.length === 0 ? (
                     <p className="h-full flex items-center justify-center text-sm text-tertiary">{t('reports:noData')}</p>
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                     <LineChart data={sideBySideData} margin={{ top: 10, right: 25, left: 25, bottom: 0 }}>
                        <XAxis
                           dataKey="month"
                           axisLine={false}
                           tickLine={false}
                           tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500 }}
                           interval="equidistantPreserveStart"
                           minTickGap={30}
                           dy={10}
                        />
                        <YAxis
                           domain={compareScaleMode === 'global' ? ['auto', 'auto'] : ['dataMin - 0.5', 'dataMax + 0.5']}
                           axisLine={false}
                           tickLine={false}
                           tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500 }}
                           tickFormatter={(val) => `${val}%`}
                        />
                        <Tooltip
                           content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                 return (
                                    <div className="bg-card border border-border p-3 rounded-xl shadow-xl text-xs space-y-1.5 min-w-[170px]">
                                       <p className="text-[10px] text-tertiary font-bold uppercase tracking-wider">{payload[0].payload?.month}</p>
                                       {payload.map((p, i) => (
                                          <div key={i} className="flex justify-between items-center font-bold" style={{ color: p.color }}>
                                             <span>{p.dataKey}</span>
                                             <span>{p.value}%</span>
                                          </div>
                                       ))}
                                    </div>
                                 );
                              }
                              return null;
                           }}
                        />
                        <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
                        {selectedCompareSymbols.map((sym, idx) => {
                           const color = ETF_COLORS[idx % ETF_COLORS.length];
                           return (
                              <Line
                                 key={sym}
                                 type="monotone"
                                 dataKey={sym}
                                 stroke={color}
                                 strokeWidth={2.5}
                                 dot={false}
                                 isAnimationActive={true}
                                 animationDuration={ANIMATION_DURATION_MS}
                                 animationEasing={ANIMATION_EASING}
                              />
                           );
                        })}
                     </LineChart>
                  </ResponsiveContainer>
                  )}
               </div>
            </div>

            {/* Key Metrics Comparison Table */}
            <div className="pt-6 border-t border-subtle">
               <h4 className="text-sm font-bold text-primary mb-4">{t('reports:feeAnalysis.metricsTableTitle')}</h4>
               <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                     <thead>
                        <tr className="border-b border-subtle text-tertiary text-xs font-bold uppercase">
                           <th className="pb-3 px-3">{t('reports:feeAnalysis.etfHeader')}</th>
                           <th className="pb-3 px-3">{t('reports:feeAnalysis.category')}</th>
                           <th className="pb-3 px-3">{t('reports:feeAnalysis.isin')}</th>
                           <th className="pb-3 px-3">{t('reports:feeAnalysis.terHeader')}</th>
                           <th className="pb-3 px-3">{t('reports:feeAnalysis.viewOnYahoo')}</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-subtle">
                        {selectedCompareSymbols.map((sym) => {
                           const info = etfFeeService.getEtfInfo(sym);
                           return (
                              <tr key={sym} className="hover:bg-subtle/40 transition-colors">
                                 <td className="py-3 px-3 font-bold text-primary">
                                    <div>
                                       <p className="text-brand font-extrabold">{info.symbol}</p>
                                       <p className="text-tertiary text-xs truncate max-w-[220px]">{info.name}</p>
                                    </div>
                                 </td>
                                 <td className="py-3 px-3 font-semibold text-secondary">{info.category}</td>
                                 <td className="py-3 px-3 text-xs text-tertiary font-mono">{info.isin || t('reports:feeAnalysis.notAvailable')}</td>
                                 <td className="py-3 px-3 font-bold">
                                    <span className={`px-2 py-0.5 rounded text-xs ${
                                       info.ter <= 0.20 ? 'bg-accent-green/10 text-accent-green' : 'bg-subtle text-primary'
                                    }`}>
                                       {info.ter.toFixed(2)}%
                                    </span>
                                 </td>
                                 <td className="py-3 px-3">
                                    <a
                                       href={info.yahooUrl}
                                       target="_blank"
                                       rel="noopener noreferrer"
                                       className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-subtle hover:bg-subtle/80 text-secondary text-xs font-medium transition-colors"
                                    >
                                       <span>{t('reports:feeAnalysis.yahooLink')}</span>
                                       <ExternalLink size={12} />
                                    </a>
                                 </td>
                              </tr>
                           );
                        })}
                     </tbody>
                  </table>
               </div>
            </div>
         </div>

         {/* ROW 4: Side-by-Side Sector & Geographical Allocation Comparison */}
         <div className={cardStyle}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-subtle">
               <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-brand/10 text-brand">
                     {allocationTab === 'sectors' ? <PieChart size={22} /> : <Globe size={22} />}
                  </div>
                  <div>
                     <h3 className="text-xl font-bold text-primary">{t('reports:feeAnalysis.allocationTitle')}</h3>
                     <p className="text-tertiary text-xs">{t('reports:feeAnalysis.allocationSubtitle')}</p>
                  </div>
               </div>

               {/* Sectors vs Geography Toggle Switch */}
               <div className="flex items-center gap-1 bg-subtle p-1 rounded-xl border border-subtle">
                  <button
                     onClick={() => setAllocationTab('sectors')}
                     className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all inline-flex items-center gap-1.5 ${
                        allocationTab === 'sectors'
                           ? 'bg-card text-brand shadow-sm border border-subtle'
                           : 'text-secondary hover:text-primary'
                     }`}
                  >
                     <PieChart size={14} />
                     <span>{t('reports:feeAnalysis.sectors')}</span>
                  </button>
                  <button
                     onClick={() => setAllocationTab('geography')}
                     className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all inline-flex items-center gap-1.5 ${
                        allocationTab === 'geography'
                           ? 'bg-card text-brand shadow-sm border border-subtle'
                           : 'text-secondary hover:text-primary'
                     }`}
                  >
                     <Globe size={14} />
                     <span>{t('reports:feeAnalysis.geography')}</span>
                  </button>
               </div>
            </div>

            {/* Top Exposure Badges for each compared ETF */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
               {selectedCompareSymbols.map((sym, idx) => {
                  const breakdown = etfFeeService.getEtfBreakdown(sym);
                  const list = allocationTab === 'sectors' ? breakdown.sectors : breakdown.geography;
                  const topItem = list[0] || { labelKey: 'sectorTech', percentage: 0 };
                  const color = ETF_COLORS[idx % ETF_COLORS.length];

                  return (
                     <div key={sym} className="p-3.5 rounded-xl bg-subtle/40 border border-subtle flex items-center justify-between">
                        <div>
                           <span className="text-[10px] font-bold text-tertiary uppercase tracking-wider block">
                              {sym} — {allocationTab === 'sectors' ? t('reports:feeAnalysis.topSector') : t('reports:feeAnalysis.topRegion')}
                           </span>
                           <span className="text-sm font-extrabold text-primary" style={{ color }}>
                              {t(`reports:feeAnalysis.${topItem.labelKey}` as keyof typeof t) || topItem.labelKey}
                           </span>
                        </div>
                        <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-card border border-subtle text-primary">
                           {topItem.percentage}%
                        </span>
                     </div>
                  );
               })}
            </div>

            {/* Recharts Grouped Bar Chart */}
            <div className="h-[320px] w-full mb-6">
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={allocationChartData} margin={{ top: 10, right: 25, left: 10, bottom: 25 }}>
                     <XAxis
                        dataKey="categoryName"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500 }}
                        dy={10}
                     />
                     <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500 }}
                        tickFormatter={(val) => `${val}%`}
                     />
                     <Tooltip
                        content={({ active, payload }) => {
                           if (active && payload && payload.length) {
                              return (
                                 <div className="bg-card border border-border p-3 rounded-xl shadow-xl text-xs space-y-1.5 min-w-[170px]">
                                    <p className="text-[10px] text-tertiary font-bold uppercase tracking-wider">{payload[0].payload?.categoryName}</p>
                                    {payload.map((p, i) => (
                                       <div key={i} className="flex justify-between items-center font-bold" style={{ color: p.color }}>
                                          <span>{p.dataKey}</span>
                                          <span>{p.value}%</span>
                                       </div>
                                    ))}
                                 </div>
                              );
                           }
                           return null;
                        }}
                     />
                     <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
                     {selectedCompareSymbols.map((sym, idx) => {
                        const color = ETF_COLORS[idx % ETF_COLORS.length];
                        return (
                           <Bar
                              key={sym}
                              dataKey={sym}
                              fill={color}
                              radius={[6, 6, 0, 0]}
                              isAnimationActive={true}
                              animationDuration={ANIMATION_DURATION_MS}
                           />
                        );
                     })}
                  </BarChart>
               </ResponsiveContainer>
            </div>

            {/* Detailed Comparative Progress Bars */}
            <div className="pt-4 border-t border-subtle space-y-3">
               {allocationChartData.map((row, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-subtle/20 border border-subtle/40 space-y-2">
                     <div className="flex justify-between items-center text-xs font-bold text-primary">
                        <span>{row.categoryName}</span>
                        <div className="flex gap-3">
                           {selectedCompareSymbols.map((sym, sIdx) => {
                              const val = row[sym] as number;
                              const color = ETF_COLORS[sIdx % ETF_COLORS.length];
                              return (
                                 <span key={sym} style={{ color }}>
                                    {sym}: {val}%
                                 </span>
                              );
                           })}
                        </div>
                     </div>
                     {/* Multi-progress bar container */}
                     <div className="h-2 w-full bg-subtle rounded-full overflow-hidden flex gap-0.5">
                        {selectedCompareSymbols.map((sym, sIdx) => {
                           const val = row[sym] as number;
                           const color = ETF_COLORS[sIdx % ETF_COLORS.length];
                           return (
                              <div
                                 key={sym}
                                 style={{ width: `${Math.min(val, 100)}%`, backgroundColor: color }}
                                 className="h-full rounded-full transition-all"
                                 title={`${sym}: ${val}%`}
                              />
                           );
                        })}
                     </div>
                  </div>
               ))}
            </div>
         </div>

         {/* ROW 5: Long-Term Fee Drag Impact Calculator */}
         <div className={cardStyle}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
               <div>
                  <h3 className="text-xl font-bold text-primary">{t('reports:feeAnalysis.feeDragTitle')}</h3>
                  <p className="text-tertiary text-xs">{t('reports:feeAnalysis.feeDragSubtitle')}</p>
               </div>

               {/* Horizon Selector & Scale Mode */}
               <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 bg-subtle p-1 rounded-xl border border-subtle">
                     <button
                        onClick={() => setScaleMode('global')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                           scaleMode === 'global'
                              ? 'bg-card text-primary shadow-sm border border-subtle'
                              : 'text-secondary hover:text-primary'
                        }`}
                     >{t('reports:feeAnalysis.global')}</button>
                     <button
                        onClick={() => setScaleMode('zoomed')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                           scaleMode === 'zoomed'
                              ? 'bg-card text-primary shadow-sm border border-subtle'
                              : 'text-secondary hover:text-primary'
                        }`}
                     >{t('reports:feeAnalysis.zoom')}</button>
                  </div>

                  <div className="flex items-center gap-2 bg-subtle p-1 rounded-xl border border-subtle">
                     <span className="text-xs font-semibold text-tertiary px-2">{t('reports:feeAnalysis.horizon')}:</span>
                     {([10, 20, 30, 50] as const).map((years) => (
                        <button
                           key={years}
                           onClick={() => setHorizonYears(years)}
                           className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                              horizonYears === years
                                 ? 'bg-card text-brand shadow-sm border border-subtle'
                                 : 'text-secondary hover:text-primary'
                           }`}
                        >
                           {years} {t('reports:feeAnalysis.years')}
                        </button>
                     ))}
                  </div>
               </div>
            </div>

            <div className="h-[340px] w-full -mx-2">
               {feeDragPoints.length === 0 ? (
                  <p className="h-full flex items-center justify-center text-sm text-tertiary">{t('reports:noData')}</p>
               ) : (
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart key={horizonYears} data={feeDragPoints} margin={{ top: 10, right: 30, left: 20, bottom: 25 }}>
                     <defs>
                        <linearGradient id="colorOptimized" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="var(--color-accent-green)" stopOpacity={0.3} />
                           <stop offset="95%" stopColor="var(--color-accent-green)" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.25} />
                           <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.0} />
                        </linearGradient>
                     </defs>
                     <XAxis
                        dataKey="year"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500 }}
                        tickFormatter={(val) => t('reports:feeAnalysis.yearTick', { value: val })}
                        dy={10}
                     />
                     <YAxis
                        domain={scaleMode === 'global' ? [0, 'auto'] : ['dataMin', 'auto']}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500 }}
                        tickFormatter={(val: number) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(val)}
                     />
                     <Tooltip
                        content={({ active, payload }) => {
                           if (active && payload && payload.length) {
                              const curVal = payload.find(p => p.dataKey === 'currentFeeValue')?.value || 0;
                              const optVal = payload.find(p => p.dataKey === 'optimizedFeeValue')?.value || 0;
                              const yr = payload[0].payload?.year || 0;
                              const savings = Number(optVal) - Number(curVal);

                              return (
                                 <div className="bg-card border border-border p-3 rounded-xl shadow-xl text-xs space-y-1.5 min-w-[200px]">
                                    <p className="text-[10px] text-tertiary font-bold uppercase tracking-wider">{yr} {t('reports:feeAnalysis.years')}</p>
                                    <div className="flex justify-between items-center text-accent-green font-bold">
                                       <span>{t('reports:feeAnalysis.optimizedTerCurve')}</span>
                                       <span>{formatCurrency(Number(optVal), currency, locale, { maximumFractionDigits: 0 })}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-primary font-bold">
                                       <span>{t('reports:feeAnalysis.currentTerCurve')}</span>
                                       <span>{formatCurrency(Number(curVal), currency, locale, { maximumFractionDigits: 0 })}</span>
                                    </div>
                                    <div className="pt-1.5 border-t border-subtle flex justify-between text-[11px] font-bold text-accent-green">
                                       <span>{t('reports:feeAnalysis.potentialAnnualSavings')}</span>
                                       <span>+{formatCurrency(savings, currency, locale, { maximumFractionDigits: 0 })}</span>
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
                        formatter={(val) => (
                           <span className="text-xs font-bold text-secondary mr-4">
                              {val === 'optimizedFeeValue' ? t('reports:feeAnalysis.optimizedTerCurve') : t('reports:feeAnalysis.currentTerCurve')}
                           </span>
                        )}
                     />
                     <Area
                        type="monotone"
                        name="optimizedFeeValue"
                        dataKey="optimizedFeeValue"
                        stroke="var(--color-accent-green)"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorOptimized)"
                        isAnimationActive={true}
                        animationDuration={ANIMATION_DURATION_MS}
                        animationEasing={ANIMATION_EASING}
                     />
                     <Area
                        type="monotone"
                        name="currentFeeValue"
                        dataKey="currentFeeValue"
                        stroke="var(--color-primary)"
                        strokeWidth={2.5}
                        strokeDasharray="4 4"
                        fillOpacity={1}
                        fill="url(#colorCurrent)"
                        isAnimationActive={true}
                        animationDuration={ANIMATION_DURATION_MS}
                        animationEasing={ANIMATION_EASING}
                     />
                  </AreaChart>
               </ResponsiveContainer>
               )}
            </div>
         </div>
      </div>
   );
};

export default FeeAnalysis;