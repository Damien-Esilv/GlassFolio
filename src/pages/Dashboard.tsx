import React, { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, Tooltip, PieChart, Pie, Cell, XAxis } from 'recharts';
import { ArrowUpRight, AlertTriangle, PlusCircle, PieChart as PieChartIcon } from 'lucide-react';
import { useData } from '../context/DataContext';
import Button from '../components/Button';
import GoalCard from '../components/GoalCard';
import AchievementBadge from '../components/AchievementBadge';
import { DashboardSummary } from '../types';
import { useNavigate } from 'react-router-dom';
import { portfolioService } from '../services/portfolioService';
import { currencyService } from '../services/currencyService';
import PerformerCard from '../components/dashboard/PerformerCard';
import { usePerformerHistory } from '../hooks/usePerformerHistory';
import ChartModeToggle from '../components/ui/ChartModeToggle';
import { useChartPriceMode } from '../hooks/useChartPriceMode';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/currency';
import { ANIMATION_DURATION_MS, ANIMATION_EASING, ENTRANCE_DELAY_MS, STAGGER_DELAY_MS } from '../constants/animations';
import AnimatedCounter from '../components/AnimatedCounter';
import { TrendBadge } from '../components/ui/TrendBadge';
import { getAssetClassConfig, getCanonicalAssetClass } from '../constants/assetClasses';
import { AppThinkingOrb } from '../components/ui/AppThinkingOrb';
import { computeWeeklyStats } from '../services/progressStatsService';
import { gamificationService } from '../services/gamificationService';
import WeeklyProgressCard from '../components/progress/WeeklyProgressCard';
import { alertText } from '../utils/alertText';

/** Longest the loading screen waits for the performer charts' data before showing the page anyway. */
const HISTORY_WAIT_MAX_MS = 4000;

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const locale = user?.preferences?.language === 'fr' ? 'fr-FR' : 'en-US';
  const dateFormat = user?.preferences?.dateFormat || 'DD/MM/YYYY';
  const currency = user?.preferences?.currency || 'USD';
  const { transactions, xpEvents, positions, alerts, goals, achievements, markAlertAsRead, refreshData } = useData();
  const [timeRange, setTimeRange] = useState('1Y');
  const [displayedRange, setDisplayedRange] = useState('1Y');
  const [chartMode, setChartMode] = useChartPriceMode();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [animActive, setAnimActive] = useState(false);

  useEffect(() => {
    // Opening the dashboard is the monthly review quest
    void gamificationService.recordDashboardVisit().catch(() => undefined).finally(refreshData);
  }, [refreshData]);

  useEffect(() => {
    if (!isLoadingSummary && summary && !animActive) {
      const timer = setTimeout(() => setAnimActive(true), ENTRANCE_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [isLoadingSummary, summary, animActive]);

  // Fetch Dashboard Summary
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setIsLoadingSummary(true);
        const data = await portfolioService.getDashboardSummary(timeRange, currency, locale, dateFormat, { chartMode });
        setSummary(data);
        setDisplayedRange(timeRange);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoadingSummary(false);
      }
    };

    fetchSummary();
  }, [transactions, positions, timeRange, currency, locale, dateFormat, chartMode]);

  // This week's figures: transactions of the week, current streak, XP earned this week
  const weeklyStats = useMemo(() => computeWeeklyStats(transactions, xpEvents), [transactions, xpEvents]);

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

  // Real price history of both performers, for the selected range. The hook keeps the same data
  // across refreshes, so the sparklines draw once.
  const bestHistory = usePerformerHistory(bestPerformer, timeRange);
  const worstHistory = usePerformerHistory(worstPerformer, timeRange);
  const historiesReady = (!bestPerformer || bestHistory !== null) && (!worstPerformer || worstHistory !== null);

  // The loading screen stays until the summary and both histories are in (or a short grace period
  // ends), so every chart appears with its data and animates once. It never comes back afterwards.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (revealed || !summary) return;
    if (historiesReady) {
      setRevealed(true);
      return;
    }
    const timer = setTimeout(() => setRevealed(true), HISTORY_WAIT_MAX_MS);
    return () => clearTimeout(timer);
  }, [revealed, summary, historiesReady]);

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

  if (!summary || !revealed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4" role="status" aria-live="polite">
        <AppThinkingOrb state="searching" size={72} label={t('common:labels.loading')} />
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
                <TrendBadge value={summary.plPercent} isPercent showIcon animated className="text-xs font-bold" />
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
              <AreaChart key={displayedRange} data={summary.chartData} margin={{ top: 10, right: 25, left: 25, bottom: 30 }}>
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
          timeRange={timeRange}
          currency={currency}
          locale={locale}
        />

        {/* Worst Performer Card */}
        <PerformerCard
          title={t('dashboard:worstPerformer')}
          position={worstPerformer}
          isWorst={true}
          realHistory={worstHistory}
          timeRange={timeRange}
          currency={currency}
          locale={locale}
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

          {visibleGoals.map((goal) => (
            <div
              key={goal.id}
              className="cursor-default"
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
            {achievements.slice(0, 4).map((ach) => (
              <div
                key={ach.id}
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
        <WeeklyProgressCard stats={weeklyStats} animated={animActive} />
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
                    <p className="font-bold text-xs text-primary truncate hover:underline">{alertText(alert, t).title}</p>
                    <p className="text-[10px] text-tertiary truncate">{alertText(alert, t).message}</p>
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