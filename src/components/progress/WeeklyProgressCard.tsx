import React from 'react';
import { useTranslation } from 'react-i18next';
import { ANIMATION_DURATION_MS, ANIMATION_EASING } from '../../constants/animations';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import type { WeeklyStats } from '../../services/progressStatsService';

interface WeeklyProgressCardProps {
  stats: WeeklyStats;
  /** False keeps the bars empty (the dashboard fills them once its entrance animation starts). */
  animated?: boolean;
  className?: string;
}

interface Tile {
  key: 'transactions' | 'streak' | 'xp';
  value: number;
  percent: number;
  labelKey: string;
  valueClass: string;
  trackClass: string;
  barClass: string;
}

/** This week's figures: transactions of the week, current streak, XP earned this week. */
export const WeeklyProgressCard: React.FC<WeeklyProgressCardProps> = ({ stats, animated = true, className = '' }) => {
  const { t, i18n } = useTranslation();

  const tiles: Tile[] = [
    { key: 'transactions', value: stats.transactions, percent: stats.transactionsPercent, labelKey: 'dashboard:transactions', valueClass: 'text-primary', trackClass: 'bg-primary/20', barClass: 'bg-primary' },
    { key: 'streak', value: stats.streak, percent: stats.streakPercent, labelKey: 'dashboard:streak', valueClass: 'text-warning', trackClass: 'bg-warning/20', barClass: 'bg-warning' },
    { key: 'xp', value: stats.xp, percent: stats.xpPercent, labelKey: 'dashboard:xpEarned', valueClass: 'text-positive', trackClass: 'bg-positive/20', barClass: 'bg-positive' },
  ];

  return (
    <div className={`rounded-xl bg-card p-6 shadow-lg border border-border flex flex-col justify-between ${className}`} data-testid="weekly-progress">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-primary">{t('dashboard:weeklyProgress')}</h3>
        <span className="text-xs font-bold text-tertiary px-3 py-1 bg-subtle rounded-full">
          {t('common:common.week')} {stats.weekNumber}
        </span>
      </div>

      <div className="flex justify-around items-end text-center flex-1 pb-4">
        {tiles.map(tile => (
          <div key={tile.key} className="flex flex-col items-center gap-3" data-testid={`weekly-${tile.key}`}>
            <div className="relative">
              <p className={`text-4xl font-black tracking-tighter ${tile.valueClass}`}>
                <AnimatedNumber value={tile.value} locale={i18n.language} />
              </p>
              <div className={`h-1.5 w-12 mt-2 rounded-full overflow-hidden ${tile.trackClass}`}>
                <div
                  className={`h-full rounded-full shadow-sm transition-all ${tile.barClass}`}
                  style={{
                    width: animated ? `${tile.percent}%` : '0%',
                    transitionDuration: `${ANIMATION_DURATION_MS}ms`,
                    transitionTimingFunction: ANIMATION_EASING,
                  }}
                />
              </div>
            </div>
            <p className="text-[10px] text-tertiary font-bold uppercase tracking-widest">{t(tile.labelKey)}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WeeklyProgressCard;
