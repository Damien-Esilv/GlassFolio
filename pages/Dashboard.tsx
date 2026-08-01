import React, { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, Tooltip, PieChart, Pie, Cell, XAxis } from 'recharts';
import { ArrowUpRight, Trophy, Wallet, AlertTriangle, Star, BarChart3, PlusCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { useData } from '../context/DataContext';
import Button from '../components/Button';
import GoalCard from '../components/GoalCard';
import AchievementBadge from '../components/AchievementBadge';
import { Achievement, DashboardSummary, Position } from '../types';
import { useNavigate } from 'react-router-dom';
import { portfolioService } from '../src/services/portfolioService';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/currency';

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const locale = user?.preferences?.language === 'fr' ? 'fr-FR' : 'en-US';
  const currency = user?.preferences?.currency || 'USD';
  const { transactions, positions, alerts, goals, achievements, isLoading: isContextLoading } = useData();
  const [timeRange, setTimeRange] = useState('1Y');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);

  // Fetch Dashboard Summary
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setIsLoadingSummary(true);
        const data = await portfolioService.getDashboardSummary(timeRange);
        setSummary(data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoadingSummary(false);
      }
    };

    fetchSummary();
  }, [transactions, timeRange]);

  // Dynamic Asset Allocation Breakdown for Donut Chart
  const assetAllocation = useMemo(() => {
    if (!positions || positions.length === 0) return [];
    const total = positions.reduce((sum, p) => sum + p.marketValue, 0);
    if (total === 0) return [];

    const classTotals: Record<string, number> = {};
    positions.forEach(p => {
      classTotals[p.type] = (classTotals[p.type] || 0) + p.marketValue;
    });

    const colorMap: Record<string, string> = {
      equity: '#3b82f6', // Vibrant Blue
      etf: '#a855f7',    // Vibrant Purple
      crypto: '#f59e0b', // Vibrant Gold / Orange
      cash: '#10b981'    // Vibrant Emerald Green
    };

    return Object.entries(classTotals).map(([type, val]) => {
      const typeLower = type.toLowerCase();
      let label = t('dashboard:equities');
      if (typeLower === 'etf') label = t('dashboard:etfs');
      if (typeLower === 'crypto') label = t('dashboard:crypto');
      if (typeLower === 'cash') label = t('dashboard:cash');

      return {
        name: label,
        type,
        value: val,
        percentage: (val / total) * 100,
        color: colorMap[typeLower] || '#3b82f6'
      };
    }).sort((a, b) => b.value - a.value);
  }, [positions, t]);

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
  const PerformerCard = ({ title, position, isWorst = false }: { title: string; position: Position | null; isWorst?: boolean }) => {
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
    let badgeBg = 'bg-accent-green/10 text-accent-green';
    let strokeColor = 'var(--color-accent-green, #10b981)';
    const gradientId = `sparkGradient-${position.id}-${isWorst ? 'worst' : 'best'}`;

    if (isWorst) {
      if (isPositive) {
        badgeBg = 'bg-amber-500/10 text-amber-500';
        strokeColor = '#f59e0b';
      } else {
        badgeBg = 'bg-accent-red/10 text-accent-red';
        strokeColor = 'var(--color-accent-red, #ef4444)';
      }
    } else {
      if (!isPositive) {
        badgeBg = 'bg-accent-red/10 text-accent-red';
        strokeColor = 'var(--color-accent-red, #ef4444)';
      }
    }

    // Sparkline trend data
    const sparklineData = Array.from({ length: 15 }, (_, i) => {
      const progress = i / 14;
      const base = position.avgCost + (position.lastPrice - position.avgCost) * progress;
      const noise = 1 + (Math.sin(i * 1.7) * 0.015);
      return { val: base * noise };
    });

    const TrendIcon = isPositive ? TrendingUp : TrendingDown;

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
          <span className="text-xl font-bold text-primary">{formatCurrency(position.marketValue, currency, locale)}</span>
          <span className={`text-xs font-semibold ${isPositive ? (isWorst ? 'text-amber-500' : 'text-accent-green') : 'text-accent-red'}`}>
            {isPositive ? '+' : ''}{formatCurrency(position.unrealizedPL, currency, locale)}
          </span>
        </div>

        {/* Mini Sparkline Chart */}
        <div className="h-16 w-full mt-2 -mx-6 -mb-6 z-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData}>
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
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  if (isContextLoading || isLoadingSummary || !summary) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
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
                  {formatCurrency(summary.totalValue, currency, locale)}
                </h1>
                <span className={`flex items-center text-xs font-bold px-2 py-1 rounded-md ${summary.plPercent >= 0 ? 'text-accent-green bg-accent-green/10' : 'text-accent-red bg-accent-red/10'}`}>
                  <ArrowUpRight size={14} className="mr-1" /> {summary.plPercent >= 0 ? '+' : ''}{summary.plPercent.toFixed(2)}%
                </span>
              </div>
              <p className="text-tertiary text-[10px] mt-1">{t('dashboard:realTimeEstimate')}</p>
            </div>

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

          {/* Main Chart Section with X-Axis Dates */}
          <div className="h-[300px] w-full mt-6 -mx-6 -mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary.chartData} margin={{ top: 10, right: 20, left: 20, bottom: 25 }}>
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
                  animationDuration={1000}
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
                  >
                    {assetAllocation.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
                <span className="text-xs font-bold text-primary truncate max-w-full">
                  {formatCurrency(summary.totalValue, currency, locale, { maximumFractionDigits: 0 })}
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
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Best Performer Card */}
        <PerformerCard
          title={t('dashboard:bestPerformer')}
          position={bestPerformer}
          isWorst={false}
        />

        {/* Worst Performer Card */}
        <PerformerCard
          title={t('dashboard:worstPerformer')}
          position={worstPerformer}
          isWorst={true}
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
            <p className="col-span-full text-sm text-tertiary text-center py-12 bg-subtle/30 rounded-2xl border-2 border-dashed border-border">{t('dashboard:noGoalsYet')}</p>
          )}

          {visibleGoals.map(goal => (
            <div key={goal.id} className="cursor-default">
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
            {achievements.slice(0, 4).map(ach => (
              <AchievementBadge
                key={ach.id}
                achievement={ach}
                compact
                onClick={() => navigate(`/progress?tab=achievements&openId=${ach.id}`)}
              />
            ))}
          </div>
        </div>

        {/* Weekly Progress */}
        <div className={`${cardStyle} flex flex-col justify-between`}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-primary">{t('dashboard:weeklyProgress')}</h3>
            <span className="text-xs font-bold text-tertiary px-3 py-1 bg-subtle rounded-full">{t('common:common.week')} 24</span>
          </div>

          <div className="flex justify-around items-end text-center flex-1 pb-4">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <p className="text-4xl font-black text-primary tracking-tighter">{transactions.length}</p>
                <div className="h-1.5 w-12 bg-primary/20 mt-2 rounded-full overflow-hidden">
                  <div className="h-full bg-primary w-[80%] rounded-full shadow-[0_0_8px_rgba(19,127,236,0.5)]"></div>
                </div>
              </div>
              <p className="text-[10px] text-tertiary font-bold uppercase tracking-widest">{t('dashboard:transactions')}</p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <p className="text-4xl font-black text-accent-red tracking-tighter">5</p>
                <div className="h-1.5 w-12 bg-accent-red/20 mt-2 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-red w-[20%] rounded-full shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
                </div>
              </div>
              <p className="text-[10px] text-tertiary font-bold uppercase tracking-widest">{t('dashboard:streak')}</p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <p className="text-4xl font-black text-accent-green tracking-tighter">500</p>
                <div className="h-1.5 w-12 bg-accent-green/20 mt-2 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-green w-[50%] rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
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
          <button className="text-xs font-bold text-primary hover:underline">{t('common:actions.viewHistory')}</button>
        </div>
        <div className="space-y-3">
          {alerts.slice(0, 2).map(alert => (
            <div key={alert.id} className={`flex items-center justify-between p-3 rounded-xl ${alert.type === 'warning' ? 'bg-yellow-500/5 ring-1 ring-yellow-500/20' : 'bg-accent-green/5 ring-1 ring-accent-green/20'}`}>
              <div className="flex items-center gap-3">
                <AlertTriangle size={18} className={alert.type === 'warning' ? 'text-yellow-500' : 'text-accent-green'} />
                <div>
                  <p className="font-bold text-xs text-primary">{alert.title}</p>
                  <p className="text-[10px] text-tertiary">{alert.message}</p>
                </div>
              </div>
              <Button size="sm" variant="ghost" className="text-[10px] font-bold">{t('common:actions.review')}</Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;