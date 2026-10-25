import React, { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, Tooltip, PieChart, Pie, Cell, XAxis } from 'recharts';
import { ArrowUpRight, AlertTriangle, PlusCircle, TrendingUp, TrendingDown, PieChart as PieChartIcon } from 'lucide-react';
import { useData } from '../context/DataContext';
import Button from '../components/Button';
import GoalCard from '../components/GoalCard';
import AchievementBadge from '../components/AchievementBadge';
import { DashboardSummary, Position } from '../types';
import { useNavigate } from 'react-router-dom';
import { portfolioService } from '../src/services/portfolioService';
import { currencyService } from '../src/services/currencyService';
import { fetchRealPriceHistory, generateHighPrecisionHistory, HistoricalPricePoint } from '../src/services/priceService';
import ChartModeToggle from '../components/ui/ChartModeToggle';
import { useChartPriceMode } from '../hooks/useChartPriceMode';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/currency';
import { ANIMATION_DURATION_MS, ANIMATION_EASING, STAGGER_DELAY_MS } from '../src/constants/animations';
import AnimatedCounter from '../components/AnimatedCounter';
import { getAssetClassConfig, getCanonicalAssetClass } from '../src/constants/assetClasses';
import { AppThinkingOrb } from '../components/ui/AppThinkingOrb';
import { getISOWeekNumber, getStartOfCurrentWeek } from '../utils/date';
import { calculateWeeklyTrackingStreak } from '../src/services/achievementService';

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const locale = user?.preferences?.language === 'fr' ? 'fr-FR' : 'en-US';
  const dateFormat = user?.preferences?.dateFormat || 'DD/MM/YYYY';
  const currency = user?.preferences?.currency || 'USD';
  const { transactions, positions, alerts, goals, achievements, markAlertAsRead, isLoading: isContextLoading, refreshData } = useData();
  const [timeRange, setTimeRange] = useState('1Y');
  const [chartMode, setChartMode] = useChartPriceMode();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [animActive, setAnimActive] = useState(false);
  const [bestHistory, setBestHistory] = useState<HistoricalPricePoint[]>([]);
  const [worstHistory, setWorstHistory] = useState<HistoricalPricePoint[]>([]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (!isLoadingSummary && summary) {
      setAnimActive(false);
      const timer = setTimeout(() => setAnimActive(true), 80);
      return () => clearTimeout(timer);
    }
  }, [isLoadingSummary, summary]);

  // Fetch Dashboard Summary
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setIsLoadingSummary(true);
        const data = await portfolioService.getDashboardSummary(timeRange, currency, locale, dateFormat, { chartMode });
        setSummary(data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoadingSummary(false);
      }
    };

    fetchSummary();
  }, [transactions, positions, timeRange, currency, locale, dateFormat, chartMode]);

  // Dynamic Weekly Progress values
  const currentWeekNumber = useMemo(() => getISOWeekNumber(new Date()), []);
  const weeklyStats = useMemo(() => {
    const startOfWeek = getStartOfCurrentWeek();
    const weeklyTxs = transactions.filter(tx => {
      const txTime = new Date(tx.date).getTime();
      return !isNaN(txTime) && txTime >= startOfWeek.getTime();
    }).length;

    const streak = calculateWeeklyTrackingStreak(transactions);
    const xp = user?.xp || 0;

    // Relative progress percentage for progress bars (0 if empty/no data)
    const txPercent = Math.min(100, Math.round((weeklyTxs / 5) * 100));
    const streakPercent = Math.min(100, Math.round((streak / 10) * 100));
    const xpPercent = Math.min(100, Math.round((Math.min(xp, 1000) / 1000) * 100));

    return {
      weeklyTxs,
      streak,
      xp,
      txPercent,
      streakPercent,
      xpPercent
    };
  }, [transactions, user?.xp]);

  // Dynamic Asset Allocation Breakdown for Donut Chart
  const assetAllocation = useMemo(() => {
    if (!positions || positions.length === 0) return [];
    
    // Calculate total converted to user base currency
    const total = positions.reduce((sum, p) => {
      const valInBase = currencyService.convertAmount(p.marketValue, p.currency || 'EUR', currency);
      return sum + valInBase;
    }, 0);
    if (total === 0) return [];

    const classTotals: Record<string, number> = {};
    positions.forEach(p => {
      const canonicalId = getCanonicalAssetClass(p.type);
      const valInBase = currencyService.convertAmount(p.marketValue, p.currency || 'EUR', currency);
      classTotals[canonicalId] = (classTotals[canonicalId] || 0) + valInBase;
    });

    return Object.entries(classTotals).map(([assetClassId, val]) => {
      const config = getAssetClassConfig(assetClassId);
      const label = config ? t(`portfolio:categories.${config.i18nKey}`, { defaultValue: assetClassId }) : assetClassId;

      return {
        name: label,
        type: assetClassId,
        value: val,
        percentage: (val / total) * 100,
        color: config?.hex || 'var(--color-accent-blue)'
      };
    }).sort((a, b) => b.value - a.value);
  }, [positions, currency, t]);

  // Calculate Best and Worst Performing positions (excluding pure cash)
  const nonCashPositions = useMemo(() => positions.filter(p => p.type !== 'Cash'), [positions]);

  const bestPerformer = useMemo(() => {
    if (nonCashPositions.length === 0) return null;
    return [...nonCashPositions].sort((a, b) => b.unrealizedPLPercent - a.unrealizedPLPercent)[0];
  }, [nonCashPositions]);

  const worstPerformer = useMemo(() => {
    if (nonCashPositions.length === 0) return null;
    return [...nonCashPositions].sort((a, b) => a.unrealizedPLPercent - b.unrealizedPLPercent)[0];
  }, [nonCashPositions]);

  // Fetch real historical prices for Best and Worst performers (synchronized with selected portfolio timeRange)
  useEffect(() => {
    let isSubscribed = true;

    if (bestPerformer) {
      fetchRealPriceHistory(bestPerformer, timeRange).then(data => {
        if (isSubscribed) setBestHistory(data);
      });
    } else {
      setBestHistory([]);
    }

    if (worstPerformer) {
      fetchRealPriceHistory(worstPerformer, timeRange).then(data => {
        if (isSubscribed) setWorstHistory(data);
      });
    } else {
      setWorstHistory([]);
    }

    return () => { isSubscribed = false; };
  }, [bestPerformer, worstPerformer, timeRange]);

  // Dynamic screen column capacity (1 on sm, 2 on md, 3 on lg)
  const [maxCols, setMaxCols] = useState<number>(() => {
    if (typeof window === 'undefined') return 3;
    if (window.innerWidth >= 1024) return 3;
    if (window.innerWidth >= 768) return 2;
    return 1;
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMaxCols(3);
      else if (window.innerWidth >= 768) setMaxCols(2);
      else setMaxCols(1);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Display pinned goals first, then others.
  const orderedGoals = useMemo(() => {
    const pinned = goals.filter(g => g.isPinned);
    const others = goals.filter(g => !g.isPinned);
    return [...pinned, ...others];
  }, [goals]);

  // Show Quick Add card only if goals count < maxCols (so total items fit on 1 line)
  const showAddGoalCard = orderedGoals.length > 0 && orderedGoals.length < maxCols;

  const visibleGoals = useMemo(() => {
    const limit = showAddGoalCard ? orderedGoals.length : Math.min(orderedGoals.length, maxCols);
    return orderedGoals.slice(0, limit);
  }, [orderedGoals, showAddGoalCard, maxCols]);

  const cardStyle = "rounded-xl bg-card p-6 shadow-lg border border-border";

  /** Reusable Performer Card Component */
  const PerformerCard = ({
    title,
    position,
    isWorst = false,
    realHistory = []
  }: {
    title: string;
    position: Position | null;
    isWorst?: boolean;
    realHistory?: HistoricalPricePoint[];
  }) => {
    // Real Sparkline price trend data (fallback to high-precision financial generator if API returned empty)
    const sparklineData = useMemo(() => {
      if (!position) return [];
      if (realHistory && realHistory.length >= 2) {
        return realHistory.map(pt => ({ val: pt.price }));
      }
      const plRatio = (position.unrealizedPLPercent || 0) / 100;
      const estimatedStart = plRatio !== -1
        ? position.lastPrice / (1 + plRatio)
        : (position.avgCost > 0 ? position.avgCost : position.lastPrice * 0.9);
      const count = timeRange === '1D' ? 24 : timeRange === '1W' ? 42 : timeRange === '1M' ? 30 : timeRange === '3M' ? 90 : timeRange === 'ALL' ? 300 : 252;
      const synthetic = generateHighPrecisionHistory(position.symbol, estimatedStart, position.lastPrice, count);
      return synthetic.map(pt => ({ val: pt.price }));
    }, [realHistory, position, timeRange]);

    if (!position) {
      return (
        <div className={`${cardStyle} flex flex-col justify-between h-full`}>
          <h3 className="text-secondary text-sm font-medium">{title}</h3>
          <p className="text-tertiary text-xs my-auto text-center">{t('dashboard:noPositionsYet')}</p>
        </div>
      );
    }

    const isPositive = position.unrealizedPLPercent >= 0;

    // Color logic according to user guidelines:
    // Best Performer: Green if positive, Red if negative
    // Worst Performer: Red if negative, ORANGE if positive
    let badgeBg = 'bg-positive-subtle text-positive';
    let strokeColor = 'var(--color-positive)';
    const gradientId = `sparkGradient-${position.id}-${isWorst ? 'worst' : 'best'}`;

    if (isWorst) {
      if (isPositive) {
        badgeBg = 'bg-warning-subtle text-warning';
        strokeColor = 'var(--color-warning)';
      } else {
        badgeBg = 'bg-negative-subtle text-negative';
        strokeColor = 'var(--color-negative)';
      }
    } else {
      if (!isPositive) {
        badgeBg = 'bg-negative-subtle text-negative';
        strokeColor = 'var(--color-negative)';
      }
    }

    const TrendIcon = isPositive ? TrendingUp : TrendingDown;

    const convertedMarketValue = currencyService.convertAmount(position.marketValue, position.currency || 'EUR', currency);
    const convertedUnrealizedPL = currencyService.convertAmount(position.unrealizedPL, position.currency || 'EUR', currency);

    return (
      <div className={`${cardStyle} flex flex-col justify-between h-full relative overflow-hidden`}>
        <div className="flex justify-between items-start z-10">
          <div>
            <span className="text-tertiary text-[10px] font-bold uppercase tracking-wider">{title}</span>
            <h4 className="text-lg font-bold text-primary mt-0.5">{position.symbol}</h4>
            <p className="text-tertiary text-xs truncate max-w-[140px]">{position.instrument}</p>
          </div>
          <div className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md ${badgeBg}`}>
            <TrendIcon size={14} />
            <span>{isPositive ? '+' : ''}{position.unrealizedPLPercent.toFixed(2)}%</span>
          </div>
        </div>

        <div className="mt-3 z-10 flex justify-between items-baseline">
          <span className="text-xl font-bold text-primary">{formatCurrency(convertedMarketValue, currency, locale)}</span>
          <span className={`text-xs font-semibold ${isPositive ? (isWorst ? 'text-warning' : 'text-positive') : 'text-negative'}`}>
            {isPositive ? '+' : ''}{formatCurrency(convertedUnrealizedPL, currency, locale)}
          </span>
        </div>

        {/* Mini Sparkline Chart — stretched edge-to-edge below the card padding */}
        <div className="h-20 -mx-6 -mb-6 mt-4 overflow-hidden rounded-b-xl z-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="val"
                stroke={strokeColor}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#${gradientId})`}
                isAnimationActive={true}
                animationDuration={ANIMATION_DURATION_MS}
                animationEasing={ANIMATION_EASING}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  if (isContextLoading || isLoadingSummary || !summary) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4" role="status" aria-live="polite">
        <AppThinkingOrb state="breathing" size={72} label={t('common:labels.loading')} />
        <span className="text-xs sm:text-sm font-semibold text-secondary tracking-wide">
          {t('common:labels.loading')}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Main Portfolio Overview Section */}
      <div className="grid grid-cols-1 gap-6">
        <div className={`${cardStyle} relative overflow-hidden flex flex-col`}>
          {/* Header of the card */}
          <div className="flex justify-between items-start z-10">
            <div>
              <h3 className="text-secondary text-sm font-medium">{t('dashboard:totalPortfolioValue')}</h3>
              <div className="flex items-center gap-3 mt-1">
                <h1 className="text-4xl font-bold text-primary">
                  <AnimatedCounter value={summary.totalValue} currency={currency} locale={locale} />
                </h1>
                <span className={`flex items-center text-xs font-bold px-2 py-1 rounded-md ${summary.plPercent >= 0 ? 'text-accent-green bg-accent-green/10' : 'text-accent-red bg-accent-red/10'}`}>
                  <ArrowUpRight size={14} className="mr-1" /> {summary.plPercent >= 0 ? '+' : ''}{summary.plPercent.toFixed(2)}%
                </span>
              </div>
              <p className="text-tertiary text-[10px] mt-1">{t('dashboard:realTimeEstimate')}</p>
            </div>

            <div className="flex flex-wrap gap-2">
            <ChartModeToggle mode={chartMode} onChange={mode => void setChartMode(mode)} />
            {/* Time Range Selector */}
            <div className="flex gap-1 p-1 bg-subtle rounded-lg">
              {['1D', '1W', '1M', '1Y', 'ALL'].map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-[10px] rounded-md font-bold transition-all ${timeRange === range ? 'bg-subtle/50 text-primary shadow-sm' : 'text-tertiary hover:text-black/70 dark:hover:text-white/70'}`}
                >
                  {range}
                </button>
              ))}
            </div>
            </div>
          </div>

          {/* Main Chart Section with X-Axis Dates */}
          <div className="h-[300px] w-full mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart key={timeRange} data={summary.chartData} margin={{ top: 10, right: 25, left: 25, bottom: 30 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
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
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const val = payload[0].value;
                      const dateName = payload[0].payload?.name || '';
                      return (
                        <div className="bg-card border border-border px-3 py-2 rounded-xl shadow-lg text-xs font-bold text-primary">
                          <p className="text-[10px] text-tertiary font-normal mb-0.5">{dateName}</p>
                          <p className="text-sm font-bold text-primary">
                            {formatCurrency(Number(val), currency, locale, { maximumFractionDigits: 0 })}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                  cursor={{ stroke: 'var(--color-primary)', strokeWidth: 1, strokeDasharray: '5 5' }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-primary)"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorValue)"
                  isAnimationActive={true}
                  animationDuration={ANIMATION_DURATION_MS}
                  animationEasing={ANIMATION_EASING}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 2. Middle Row: Donut Allocation + Best Performer + Worst Performer (3-column grid) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Donut Asset Allocation Card */}
        <div className={`${cardStyle} flex flex-col justify-between`}>
          <h3 className="text-secondary text-sm font-medium mb-2">{t('dashboard:assetAllocation')}</h3>
          {assetAllocation.length === 0 ? (
            <p className="text-tertiary text-xs my-auto text-center">{t('dashboard:noAssetsAllocation')}</p>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4 my-auto">
              {/* Donut Chart with Total in Center */}
              <div className="relative w-36 h-36 flex-shrink-0 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={assetAllocation}
                      innerRadius={44}
                      outerRadius={64}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                      isAnimationActive={true}
                      animationDuration={ANIMATION_DURATION_MS}
                      animationEasing={ANIMATION_EASING}
                      animationBegin={0}
                    >
                      {assetAllocation.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
                  <span className="text-xs font-bold text-primary truncate max-w-full">
                    <AnimatedCounter value={summary.totalValue} currency={currency} locale={locale} options={{ maximumFractionDigits: 0 }} />
                  </span>
                  <span className="text-[10px] text-tertiary uppercase font-bold tracking-wider">{t('dashboard:total')}</span>
                </div>
              </div>

              {/* Asset Breakdown List */}
              <div className="flex-1 w-full space-y-2">
                {assetAllocation.map(item => (
                  <div key={item.type} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-secondary">{item.name}</span>
                      <span className="text-primary">{item.percentage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-subtle rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: animActive ? `${item.percentage}%` : '0%',
                          backgroundColor: item.color,
                          transitionDuration: `${ANIMATION_DURATION_MS}ms`,
                          transitionTimingFunction: ANIMATION_EASING
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Best Performer Card */}
        <PerformerCard
          title={t('dashboard:bestPerformer')}
          position={bestPerformer}
          isWorst={false}
          realHistory={bestHistory}
        />

        {/* Worst Performer Card */}
        <PerformerCard
          title={t('dashboard:worstPerformer')}
          position={worstPerformer}
          isWorst={true}
          realHistory={worstHistory}
        />
      </div>

      {/* 3. Row 3: Financial Goals (Full Width) */}
      <div className={`${cardStyle}`}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-primary tracking-tight">{t('dashboard:financialGoals')}</h3>
          <button
            onClick={() => navigate('/progress')}
            className="text-xs font-bold text-primary hover:text-primary/80 transition-colors uppercase tracking-wider"
          >
            {t('common:actions.seeAll')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleGoals.length === 0 && (
            <p className="col-span-full text-xs text-tertiary text-center py-8">{t('dashboard:noGoalsYet')}</p>
          )}

          {visibleGoals.map((goal, idx) => (
            <div
              key={goal.id}
              className="cursor-default transition-all"
              style={{
                opacity: animActive ? 1 : 0,
                transform: animActive ? 'scale(1)' : 'scale(0.92)',
                transitionDuration: `${ANIMATION_DURATION_MS}ms`,
                transitionTimingFunction: ANIMATION_EASING,
                transitionDelay: `${idx * STAGGER_DELAY_MS}ms`
              }}
            >
              <GoalCard
                goal={goal}
                showDetailTags={false}
              />
            </div>
          ))}

          {showAddGoalCard && (
            <button
              onClick={() => navigate('/progress?action=new')}
              className="group h-full min-h-[160px] p-6 rounded-2xl border-2 border-dashed border-border text-tertiary hover:text-primary hover:border-primary hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-3"
              style={{
                opacity: animActive ? 1 : 0,
                transform: animActive ? 'scale(1)' : 'scale(0.92)',
                transitionDuration: `${ANIMATION_DURATION_MS}ms`,
                transitionTimingFunction: ANIMATION_EASING,
                transitionDelay: `${visibleGoals.length * STAGGER_DELAY_MS}ms`
              }}
            >
              <div className="p-3 rounded-full bg-subtle group-hover:bg-primary/10 transition-colors">
                <PlusCircle size={28} />
              </div>
              <span className="font-bold text-sm">{t('dashboard:addNewGoal')}</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. Row 4: Achievements & Weekly Progress (Pairs) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Achievements */}
        <div className={`${cardStyle}`}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-primary">{t('dashboard:achievements')}</h3>
            <button
              onClick={() => navigate('/progress?tab=achievements')}
              className="text-xs font-bold text-primary hover:underline uppercase tracking-wider"
            >
              {t('common:actions.viewBadges')}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {achievements.slice(0, 4).map((ach, idx) => (
              <div
                key={ach.id}
                className="transition-all"
                style={{
                  opacity: animActive ? 1 : 0,
                  transform: animActive ? 'scale(1)' : 'scale(0.92)',
                  transitionDuration: `${ANIMATION_DURATION_MS}ms`,
                  transitionTimingFunction: ANIMATION_EASING,
                  transitionDelay: `${idx * STAGGER_DELAY_MS}ms`
                }}
              >
                <AchievementBadge
                  achievement={ach}
                  compact
                  onClick={() => navigate(`/progress?tab=achievements&openId=${ach.id}`)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Weekly Progress */}
        <div className={`${cardStyle} flex flex-col justify-between`}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-primary">{t('dashboard:weeklyProgress')}</h3>
            <span className="text-xs font-bold text-tertiary px-3 py-1 bg-subtle rounded-full">
              {t('common:common.week')} {currentWeekNumber}
            </span>
          </div>

          <div className="flex justify-around items-end text-center flex-1 pb-4">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <p className="text-4xl font-black text-primary tracking-tighter">{weeklyStats.weeklyTxs}</p>
                <div className="h-1.5 w-12 bg-primary/20 mt-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full shadow-sm transition-all"
                    style={{
                      width: animActive ? `${weeklyStats.txPercent}%` : '0%',
                      transitionDuration: `${ANIMATION_DURATION_MS}ms`,
                      transitionTimingFunction: ANIMATION_EASING
                    }}
                  ></div>
                </div>
              </div>
              <p className="text-[10px] text-tertiary font-bold uppercase tracking-widest">{t('dashboard:transactions')}</p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <p className="text-4xl font-black text-warning tracking-tighter">{weeklyStats.streak}</p>
                <div className="h-1.5 w-12 bg-warning/20 mt-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-warning rounded-full shadow-sm transition-all"
                    style={{
                      width: animActive ? `${weeklyStats.streakPercent}%` : '0%',
                      transitionDuration: `${ANIMATION_DURATION_MS}ms`,
                      transitionTimingFunction: ANIMATION_EASING
                    }}
                  ></div>
                </div>
              </div>
              <p className="text-[10px] text-tertiary font-bold uppercase tracking-widest">{t('dashboard:streak')}</p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <p className="text-4xl font-black text-positive tracking-tighter">{weeklyStats.xp}</p>
                <div className="h-1.5 w-12 bg-positive/20 mt-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-positive rounded-full shadow-sm transition-all"
                    style={{
                      width: animActive ? `${weeklyStats.xpPercent}%` : '0%',
                      transitionDuration: `${ANIMATION_DURATION_MS}ms`,
                      transitionTimingFunction: ANIMATION_EASING
                    }}
                  ></div>
                </div>
              </div>
              <p className="text-[10px] text-tertiary font-bold uppercase tracking-widest">{t('dashboard:xpEarned')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Row 5: Recent Alerts */}
      <div className={`${cardStyle}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-primary">{t('dashboard:recentAlerts')}</h3>
          <button
            onClick={() => navigate('/notifications')}
            className="text-xs font-bold text-primary hover:underline transition-colors"
          >
            {t('common:actions.viewHistory')}
          </button>
        </div>
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <p className="text-xs text-secondary text-center py-4">{t('notifications:center.empty')}</p>
          ) : (
            alerts.slice(0, 3).map((alert, idx) => (
              <div
                key={alert.id}
                className={`flex items-center justify-between p-3 rounded-xl transition-all ${alert.type === 'warning' ? 'bg-warning-subtle ring-1 ring-warning/20' : 'bg-positive-subtle ring-1 ring-positive/20'}`}
                style={{
                  opacity: animActive ? 1 : 0,
                  transform: animActive ? 'scale(1)' : 'scale(0.92)',
                  transitionDuration: `${ANIMATION_DURATION_MS}ms`,
                  transitionTimingFunction: ANIMATION_EASING,
                  transitionDelay: `${idx * STAGGER_DELAY_MS}ms`
                }}
              >
                <div 
                  className="flex items-center gap-3 min-w-0 mr-2 flex-1 cursor-pointer"
                  onClick={() => {
                    if (!alert.read) {
                      markAlertAsRead(alert.id);
                    }
                    if (alert.actionUrl) {
                      navigate(alert.actionUrl);
                    } else {
                      navigate('/notifications');
                    }
                  }}
                >
                  <AlertTriangle size={18} className={alert.type === 'warning' ? 'text-warning shrink-0' : 'text-positive shrink-0'} />
                  <div className="min-w-0">
                    <p className="font-bold text-xs text-primary truncate hover:underline">{alert.title}</p>
                    <p className="text-[10px] text-tertiary truncate">{alert.message}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[10px] font-bold shrink-0"
                  onClick={() => {
                    if (!alert.read) {
                      markAlertAsRead(alert.id);
                    }
                    if (alert.actionUrl) {
                      navigate(alert.actionUrl);
                    } else {
                      navigate('/notifications');
                    }
                  }}
                >
                  {alert.actionLabelKey ? t(alert.actionLabelKey) : t('common:actions.review')}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;