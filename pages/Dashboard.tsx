import React, { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';
import { ArrowUpRight, Home, Plane, Trophy, Wallet, AlertTriangle, Star, BarChart3, Car, Shield, PlusCircle } from 'lucide-react';
import { useData } from '../context/DataContext';
import Button from '../components/Button';
import { FinancialGoal, Achievement, DashboardSummary } from '../types';
import { useNavigate } from 'react-router-dom';
import { portfolioService } from '../src/services/portfolioService';

const Dashboard: React.FC = () => {
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

  // Helper component for Goal Icons
  const GoalIcon = ({ type }: { type: FinancialGoal['iconType'] }) => {
    const className = "p-2 bg-opacity-10 rounded-lg";
    switch (type) {
      case 'home': return <div className={`${className} bg-blue-500 text-blue-400`}><Home size={18} /></div>;
      case 'plane': return <div className={`${className} bg-indigo-500 text-indigo-400`}><Plane size={18} /></div>;
      case 'car': return <div className={`${className} bg-orange-500 text-orange-400`}><Car size={18} /></div>;
      case 'emergency': return <div className={`${className} bg-emerald-500 text-emerald-400`}><Shield size={18} /></div>;
      default: return <div className={`${className} bg-slate-500 text-slate-400`}><Wallet size={18} /></div>;
    }
  };

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

  const cardStyle = "rounded-xl bg-white/5 dark:bg-black/20 p-6 shadow-lg ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-lg border border-black/5 dark:border-white/5";

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
              <h3 className="text-black/60 dark:text-white/60 text-sm font-medium">Total Portfolio Value</h3>
              <div className="flex items-center gap-3 mt-1">
                <h1 className="text-4xl font-bold text-black dark:text-white">
                  ${summary.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h1>
                <span className={`flex items-center text-xs font-bold px-2 py-1 rounded-md ${summary.plPercent >= 0 ? 'text-accent-green bg-accent-green/10' : 'text-accent-red bg-accent-red/10'}`}>
                  <ArrowUpRight size={14} className="mr-1" /> {summary.plPercent >= 0 ? '+' : ''}{summary.plPercent.toFixed(2)}%
                </span>
              </div>
              <p className="text-black/40 dark:text-white/40 text-[10px] mt-1">Real-time Estimate</p>
            </div>

            {/* Time Range Selector */}
            <div className="flex gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-lg">
              {['1D', '1W', '1M', '1Y', 'ALL'].map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-[10px] rounded-md font-bold transition-all ${timeRange === range ? 'bg-black/10 dark:bg-white/10 text-black dark:text-white shadow-sm' : 'text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70'}`}
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
                    <stop offset="5%" stopColor="#137fec" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#137fec" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(16, 25, 34, 0.9)', border: 'none', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                  cursor={{ stroke: '#137fec', strokeWidth: 1, strokeDasharray: '5 5' }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#137fec"
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

      {/* Second Row: Goals, Achievements, Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Financial Goals */}
        <div className={`${cardStyle}`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-black dark:text-white">Financial Goals</h3>
            <button
              onClick={() => navigate('/progress')}
              className="text-xs font-bold text-primary hover:underline"
            >
              See All
            </button>
          </div>

          <div className="space-y-3">
            {visibleGoals.length === 0 && (
              <p className="text-sm text-black/40 dark:text-white/40 text-center py-8">No goals set yet.</p>
            )}

            {visibleGoals.map(goal => {
              // Ensure currentAmount is defined
              const safeAmount = goal.currentAmount || 0;
              const progress = Math.min((safeAmount / goal.targetAmount) * 100, 100);
              let barColor = 'bg-primary';
              if (goal.color === 'indigo') barColor = 'bg-indigo-500';
              if (goal.color === 'emerald') barColor = 'bg-accent-green';
              if (goal.color === 'orange') barColor = 'bg-orange-500';
              if (goal.color === 'rose') barColor = 'bg-accent-red';

              return (
                <div key={goal.id} className="bg-black/5 dark:bg-white/5 p-4 rounded-xl border border-black/5 dark:border-white/5 group hover:bg-black/10 dark:hover:bg-white/10 transition-colors relative">
                  {goal.isPinned && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" title="Pinned"></div>}
                  <div className="flex items-center gap-3 mb-3">
                    <GoalIcon type={goal.iconType} />
                    <p className="text-sm font-bold text-black dark:text-white">{goal.title}</p>
                  </div>
                  <div className="w-full bg-black/10 dark:bg-white/10 h-1.5 rounded-full overflow-hidden mb-2">
                    <div className={`${barColor} h-full rounded-full transition-all duration-1000`} style={{ width: `${progress}%` }}></div>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-black/50 dark:text-white/50">
                    <span>${safeAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} / ${goal.targetAmount.toLocaleString()}</span>
                    <span>{progress.toFixed(0)}% Complete</span>
                  </div>
                </div>
              );
            })}

            <button
              onClick={() => navigate('/progress?action=new')}
              className="w-full mt-2 py-3 rounded-xl border-2 border-dashed border-black/10 dark:border-white/10 text-black/40 dark:text-white/40 hover:text-primary hover:border-primary transition-all flex items-center justify-center gap-2 font-bold text-sm"
            >
              <PlusCircle size={18} />
              Add New Goal
            </button>
          </div>
        </div>

        {/* Achievements */}
        <div className={`${cardStyle}`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-black dark:text-white">Achievements</h3>
            <button onClick={() => navigate('/progress?tab=achievements')} className="text-xs font-bold text-primary hover:underline">View Badges</button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {achievements.slice(0, 8).map(ach => {
              let bgClass = 'bg-black/5 dark:bg-white/5';
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
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center p-2 text-center transition-transform hover:scale-105 ${ach.unlocked ? bgClass : 'bg-black/5 dark:bg-white/5 opacity-40 grayscale'}`}
                >
                  <AchievementIcon type={ach.iconType} unlocked={ach.unlocked} color={ach.color} />
                  <span className={`text-[9px] font-bold leading-tight mt-1 truncate w-full ${ach.unlocked ? 'text-black/80 dark:text-white/80' : 'text-black/40 dark:text-white/40'}`}>
                    {ach.title}
                  </span>
                  <span className="text-[8px] text-black/40 dark:text-white/40 font-mono mt-0.5">Lvl {ach.currentLevel}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Weekly Progress */}
        <div className={`${cardStyle} flex flex-col justify-between`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-black dark:text-white">Weekly Progress</h3>
            <span className="text-xs font-bold text-black/40 dark:text-white/40">Week 24</span>
          </div>

          <div className="flex justify-between text-center mb-6 px-2">
            <div>
              <p className="text-3xl font-black text-primary">{transactions.length}</p>
              <p className="text-[10px] text-black/50 dark:text-white/50 font-bold uppercase tracking-wider">Transactions</p>
              <div className="h-1 w-12 bg-primary/20 mx-auto mt-2 rounded-full overflow-hidden">
                <div className="h-full bg-primary w-[80%]"></div>
              </div>
            </div>
            <div>
              <p className="text-3xl font-black text-accent-red">5</p>
              <p className="text-[10px] text-black/50 dark:text-white/50 font-bold uppercase tracking-wider">Streak</p>
              <div className="h-1 w-12 bg-accent-red/20 mx-auto mt-2 rounded-full overflow-hidden">
                <div className="h-full bg-accent-red w-[20%]"></div>
              </div>
            </div>
            <div>
              <p className="text-3xl font-black text-primary">500</p>
              <p className="text-[10px] text-black/50 dark:text-white/50 font-bold uppercase tracking-wider">XP Earned</p>
              <div className="h-1 w-12 bg-primary/20 mx-auto mt-2 rounded-full overflow-hidden">
                <div className="h-full bg-primary w-[50%]"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Asset Distribution and Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="grid grid-cols-3 gap-4">
          {['Equities', 'ETFs', 'Crypto'].map((asset, idx) => (
            <div key={asset} className={`${cardStyle}`}>
              <p className="text-black/60 dark:text-white/60 text-[10px] font-bold uppercase tracking-wider">{asset}</p>
              <h4 className="text-xl font-black text-black dark:text-white mt-1">
                {idx === 0 ? '50%' : idx === 1 ? '33%' : '17%'}
              </h4>
              <div className="w-full bg-black/10 dark:bg-white/10 h-1 rounded-full overflow-hidden mt-3">
                <div className={`h-full ${idx === 0 ? 'bg-primary' : idx === 1 ? 'bg-indigo-500' : 'bg-purple-500'}`} style={{ width: idx === 0 ? '50%' : idx === 1 ? '33%' : '17%' }}></div>
              </div>
            </div>
          ))}
        </div>

        <div className={`${cardStyle}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-black dark:text-white">Recent Alerts</h3>
            <button className="text-xs font-bold text-primary hover:underline">View History</button>
          </div>
          <div className="space-y-3">
            {alerts.slice(0, 2).map(alert => (
              <div key={alert.id} className={`flex items-center justify-between p-3 rounded-xl ${alert.type === 'warning' ? 'bg-yellow-500/5 ring-1 ring-yellow-500/20' : 'bg-accent-green/5 ring-1 ring-accent-green/20'}`}>
                <div className="flex items-center gap-3">
                  <AlertTriangle size={18} className={alert.type === 'warning' ? 'text-yellow-500' : 'text-accent-green'} />
                  <div>
                    <p className="font-bold text-xs text-black dark:text-white">{alert.title}</p>
                    <p className="text-[10px] text-black/50 dark:text-white/50">{alert.message}</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="text-[10px] font-bold">Review</Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;