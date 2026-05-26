import React, { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';
import { ArrowUpRight, Home, Plane, Trophy, Wallet, AlertTriangle, Star, BarChart3, Car, Shield, PlusCircle } from 'lucide-react';
import { useData } from '../context/DataContext';
import Button from '../components/Button';
import GoalCard from '../components/GoalCard';
import { FinancialGoal, Achievement, DashboardSummary } from '../types';
import { useNavigate } from 'react-router-dom';
import { portfolioService } from '../src/services/portfolioService';
import { useTranslation } from 'react-i18next';

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { transactions, alerts, goals, achievements, isLoading: isContextLoading } = useData();
  const [timeRange, setTimeRange] = useState('1Y');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);

  // Fetch Dashboard Summary
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setIsLoadingSummary(true);
        const data = await portfolioService.getDashboardSummary();
        setSummary(data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoadingSummary(false);
      }
    };

    // Reload summary when transactions change (context updates usually mean data changed)
    // A better way would be if DataContext exposed a "lastUpdated" timestamp
    fetchSummary();
  }, [transactions]); // Re-fetch if transactions change locally contexts

  // Display pinned goals first, then others, max 3
  const visibleGoals = useMemo(() => {
    const pinned = goals.filter(g => g.isPinned);
    const others = goals.filter(g => !g.isPinned);
    return [...pinned, ...others].slice(0, 3);
  }, [goals]);



  // Helper component for Achievement Icons
  const AchievementIcon = ({ type, unlocked, color }: { type: Achievement['iconType'], unlocked: boolean, color: string }) => {
    const Icon = type === 'rocket' ? Trophy :
      type === 'diamond' ? Wallet :
        type === 'chart' ? BarChart3 :
          type === 'trophy' ? Trophy :
            type === 'star' ? ArrowUpRight : Star;

    let colorClass = 'text-slate-500';
    if (unlocked) {
      if (color === 'indigo') colorClass = 'text-indigo-500';
      else if (color === 'blue') colorClass = 'text-blue-500';
      else if (color === 'emerald') colorClass = 'text-accent-green';
      else if (color === 'orange') colorClass = 'text-orange-500';
    }

    return <Icon className={`${colorClass} mb-1`} size={24} />;
  };

  const cardStyle = "rounded-xl bg-card p-6 shadow-lg border border-border";

  if (isContextLoading || isLoadingSummary || !summary) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Portfolio Overview Section */}
      <div className="grid grid-cols-1 gap-6">
        <div className={`${cardStyle} relative overflow-hidden flex flex-col`}>
          {/* Header of the card */}
          <div className="flex justify-between items-start z-10">
            <div>
              <h3 className="text-secondary text-sm font-medium">{t('dashboard:totalPortfolioValue')}</h3>
              <div className="flex items-center gap-3 mt-1">
                <h1 className="text-4xl font-bold text-primary">
                  ${summary.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

          {/* Main Chart Section */}
          <div className="h-[300px] w-full mt-6 -mx-6 -mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary.chartData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-card)', border: 'none', borderRadius: '12px', color: 'var(--text-primary)' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
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

      {/* Row 2: Financial Goals (Full Width) */}
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

          {visibleGoals.length > 0 && (
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

      {/* Row 3: Achievements & Progress (Pairs) */}
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
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-4 gap-3">
            {achievements.slice(0, 8).map(ach => {
              let bgClass = 'bg-subtle';
              if (ach.unlocked) {
                if (ach.color === 'indigo') bgClass = 'bg-indigo-500/10';
                else if (ach.color === 'blue') bgClass = 'bg-blue-500/10';
                else if (ach.color === 'emerald') bgClass = 'bg-accent-green/10';
                else if (ach.color === 'orange') bgClass = 'bg-orange-500/10';
              }

              return (
                <button
                  key={ach.id}
                  onClick={() => navigate(`/progress?tab=achievements&openId=${ach.id}`)}
                  className={`aspect-square rounded-2xl flex flex-col items-center justify-center p-2 text-center transition-all hover:scale-105 active:scale-95 ${ach.unlocked ? bgClass : 'bg-subtle opacity-40 grayscale'}`}
                >
                  <AchievementIcon type={ach.iconType} unlocked={ach.unlocked} color={ach.color} />
                  <span className={`text-[10px] font-bold leading-tight mt-1 truncate w-full ${ach.unlocked ? 'text-primary' : 'text-tertiary'}`}>
                    {ach.title}
                  </span>
                  <span className="text-[8px] text-tertiary font-mono mt-0.5">{t('common:common.lvl')} {ach.currentLevel}</span>
                </button>
              )
            })}
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

      {/* Bottom Grid: Asset Distribution and Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="grid grid-cols-3 gap-4">
          {['Equities', 'ETFs', 'Crypto'].map((asset, idx) => (
            <div key={asset} className={`${cardStyle}`}>
              <p className="text-secondary text-[10px] font-bold uppercase tracking-wider">{asset}</p>
              <h4 className="text-xl font-black text-primary mt-1">
                {idx === 0 ? '50%' : idx === 1 ? '33%' : '17%'}
              </h4>
              <div className="w-full bg-subtle/50 h-1 rounded-full overflow-hidden mt-3">
                <div className={`h-full ${idx === 0 ? 'bg-primary' : idx === 1 ? 'bg-indigo-500' : 'bg-purple-500'}`} style={{ width: idx === 0 ? '50%' : idx === 1 ? '33%' : '17%' }}></div>
              </div>
            </div>
          ))}
        </div>

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
    </div>
  );
};

export default Dashboard;