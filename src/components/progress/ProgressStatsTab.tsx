import React from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, CalendarDays, Flame, Layers, Medal, Sparkles, Target, Trophy, Zap, type LucideIcon } from 'lucide-react';
import type { ProgressStats } from '../../services/progressStatsService';
import WeeklyProgressCard from './WeeklyProgressCard';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { Reveal } from '../ui/Reveal';
import { useEntranceAnimation } from '../../hooks/useEntranceAnimation';

interface ProgressStatsTabProps {
  stats: ProgressStats;
  /** BCP 47 locale used to format the dates */
  locale: string;
}

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  /** The value: a number that counts up, a unit, a date… */
  children: React.ReactNode;
  toneClass: string;
  testId: string;
  active: boolean;
  index: number;
}

const StatTile: React.FC<StatTileProps> = ({ icon: Icon, label, children, toneClass, testId, active, index }) => (
  <Reveal active={active} index={index}>
    <div className="rounded-xl bg-card p-5 shadow-lg border border-border flex items-center gap-4" data-testid={testId}>
      <div className={`p-3 rounded-xl bg-subtle ${toneClass}`} aria-hidden="true">
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <dd className="text-2xl font-black text-primary tracking-tight truncate">{children}</dd>
        <dt className="text-[11px] text-tertiary font-bold uppercase tracking-widest">{label}</dt>
      </div>
    </div>
  </Reveal>
);

/** Stats tab of the Progress page: this week's figures, then the all-time figures. */
export const ProgressStatsTab: React.FC<ProgressStatsTabProps> = ({ stats, locale }) => {
  const { t } = useTranslation('gamification');
  const active = useEntranceAnimation();
  const { global } = stats;

  const since = global.trackingSince
    ? new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(global.trackingSince))
    : t('stats.noneYet');
  const num = (value: number): React.ReactNode => <AnimatedNumber value={value} locale={locale} />;
  const weeks = (count: number): React.ReactNode => <>{num(count)} {t('stats.weeksUnit', { count })}</>;
  const ofTotal = (done: number, total: number): React.ReactNode => <>{num(done)} / {total}</>;

  return (
    <div className="space-y-8">
      <section aria-label={t('stats.thisWeek')} className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-secondary">{t('stats.thisWeek')}</h2>
        <Reveal active={active}>
          <WeeklyProgressCard stats={stats.week} animated={active} />
        </Reveal>
      </section>

      <section aria-label={t('stats.allTime')} className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-secondary">{t('stats.allTime')}</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatTile active={active} index={1} testId="stat-transactions" icon={Activity} toneClass="text-brand" label={t('stats.totalTransactions')}>{num(global.totalTransactions)}</StatTile>
          <StatTile active={active} index={2} testId="stat-current-streak" icon={Flame} toneClass="text-warning" label={t('stats.currentStreak')}>{weeks(global.currentStreak)}</StatTile>
          <StatTile active={active} index={3} testId="stat-longest-streak" icon={Trophy} toneClass="text-warning" label={t('stats.bestStreak')}>{weeks(global.longestStreak)}</StatTile>
          <StatTile active={active} index={4} testId="stat-active-weeks" icon={CalendarDays} toneClass="text-secondary" label={t('stats.activeWeeks')}>{num(global.activeWeeks)}</StatTile>
          <StatTile active={active} index={5} testId="stat-total-xp" icon={Zap} toneClass="text-positive" label={t('stats.totalXp')}>{num(global.totalXp)}</StatTile>
          <StatTile active={active} index={6} testId="stat-level" icon={Sparkles} toneClass="text-brand" label={t('stats.level')}>{num(global.level)}</StatTile>
          <StatTile active={active} index={7} testId="stat-achievements" icon={Medal} toneClass="text-brand" label={t('stats.achievements')}>{ofTotal(global.achievementsUnlocked, global.achievementsTotal)}</StatTile>
          <StatTile active={active} index={8} testId="stat-goals" icon={Target} toneClass="text-positive" label={t('stats.goals')}>{ofTotal(global.goalsCompleted, global.goalsTotal)}</StatTile>
          <StatTile active={active} index={9} testId="stat-since" icon={Layers} toneClass="text-secondary" label={t('stats.trackingSince')}>{since}</StatTile>
        </dl>
      </section>
    </div>
  );
};

export default ProgressStatsTab;
