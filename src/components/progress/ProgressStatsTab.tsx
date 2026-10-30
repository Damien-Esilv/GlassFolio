import React from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, CalendarDays, Flame, Layers, Medal, Sparkles, Target, Trophy, Zap, type LucideIcon } from 'lucide-react';
import type { ProgressStats } from '../../services/progressStatsService';
import WeeklyProgressCard from './WeeklyProgressCard';

interface ProgressStatsTabProps {
  stats: ProgressStats;
  /** BCP 47 locale used to format the dates */
  locale: string;
}

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: string;
  toneClass: string;
  testId: string;
}

const StatTile: React.FC<StatTileProps> = ({ icon: Icon, label, value, toneClass, testId }) => (
  <div className="rounded-xl bg-card p-5 shadow-lg border border-border flex items-center gap-4" data-testid={testId}>
    <div className={`p-3 rounded-xl bg-subtle ${toneClass}`} aria-hidden="true">
      <Icon size={22} />
    </div>
    <div className="min-w-0">
      <dd className="text-2xl font-black text-primary tracking-tight truncate">{value}</dd>
      <dt className="text-[11px] text-tertiary font-bold uppercase tracking-widest">{label}</dt>
    </div>
  </div>
);

/** Stats tab of the Progress page: this week's figures, then the all-time figures. */
export const ProgressStatsTab: React.FC<ProgressStatsTabProps> = ({ stats, locale }) => {
  const { t } = useTranslation('gamification');
  const { global } = stats;

  const since = global.trackingSince
    ? new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(global.trackingSince))
    : t('stats.noneYet');

  return (
    <div className="space-y-8 animate-fade-in">
      <section aria-label={t('stats.thisWeek')} className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-secondary">{t('stats.thisWeek')}</h2>
        <WeeklyProgressCard stats={stats.week} />
      </section>

      <section aria-label={t('stats.allTime')} className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-secondary">{t('stats.allTime')}</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatTile testId="stat-transactions" icon={Activity} toneClass="text-brand" label={t('stats.totalTransactions')} value={String(global.totalTransactions)} />
          <StatTile testId="stat-current-streak" icon={Flame} toneClass="text-warning" label={t('stats.currentStreak')} value={t('stats.weeksValue', { count: global.currentStreak })} />
          <StatTile testId="stat-longest-streak" icon={Trophy} toneClass="text-warning" label={t('stats.bestStreak')} value={t('stats.weeksValue', { count: global.longestStreak })} />
          <StatTile testId="stat-active-weeks" icon={CalendarDays} toneClass="text-secondary" label={t('stats.activeWeeks')} value={String(global.activeWeeks)} />
          <StatTile testId="stat-total-xp" icon={Zap} toneClass="text-positive" label={t('stats.totalXp')} value={String(global.totalXp)} />
          <StatTile testId="stat-level" icon={Sparkles} toneClass="text-brand" label={t('stats.level')} value={String(global.level)} />
          <StatTile testId="stat-achievements" icon={Medal} toneClass="text-brand" label={t('stats.achievements')} value={t('stats.ofTotal', { done: global.achievementsUnlocked, total: global.achievementsTotal })} />
          <StatTile testId="stat-goals" icon={Target} toneClass="text-positive" label={t('stats.goals')} value={t('stats.ofTotal', { done: global.goalsCompleted, total: global.goalsTotal })} />
          <StatTile testId="stat-since" icon={Layers} toneClass="text-secondary" label={t('stats.trackingSince')} value={since} />
        </dl>
      </section>
    </div>
  );
};

export default ProgressStatsTab;
