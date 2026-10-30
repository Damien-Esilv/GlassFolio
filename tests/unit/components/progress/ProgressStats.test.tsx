import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '../../../../src/i18n';
import i18n from '../../../../src/i18n';
import { WeeklyProgressCard } from '../../../../src/components/progress/WeeklyProgressCard';
import { ProgressStatsTab } from '../../../../src/components/progress/ProgressStatsTab';
import type { ProgressStats, WeeklyStats } from '../../../../src/services/progressStatsService';

const week: WeeklyStats = {
  weekNumber: 44, weekStart: new Date(2026, 9, 26).toISOString(),
  transactions: 3, streak: 4, xp: 150, transactionsPercent: 60, streakPercent: 40, xpPercent: 30,
};
const stats: ProgressStats = {
  week,
  global: {
    totalTransactions: 42, activeWeeks: 12, currentStreak: 4, longestStreak: 9, totalXp: 2150, level: 5,
    achievementsUnlocked: 6, achievementsTotal: 20, goalsCompleted: 1, goalsTotal: 3,
    trackingSince: new Date(2024, 6, 5, 10).toISOString(),
  },
};

describe('WeeklyProgressCard', () => {
  it('shows the week number and the three figures of the week', () => {
    render(<WeeklyProgressCard stats={week} />);
    expect(screen.getByText(/Week 44/)).toBeDefined();
    expect(within(screen.getByTestId('weekly-transactions')).getByText('3')).toBeDefined();
    expect(within(screen.getByTestId('weekly-streak')).getByText('4')).toBeDefined();
    expect(within(screen.getByTestId('weekly-xp')).getByText('150')).toBeDefined();
  });

  it('draws the bars at their percentage, or empty before the entrance animation', () => {
    const { container, rerender } = render(<WeeklyProgressCard stats={week} animated />);
    const widths = () => Array.from(container.querySelectorAll<HTMLElement>('[style*="width"]')).map(el => el.style.width);
    expect(widths()).toEqual(['60%', '40%', '30%']);
    rerender(<WeeklyProgressCard stats={week} animated={false} />);
    expect(widths()).toEqual(['0%', '0%', '0%']);
  });
});

describe('ProgressStatsTab', () => {
  it('shows the same weekly figures, then the all-time ones', () => {
    render(<ProgressStatsTab stats={stats} locale="en-US" />);

    expect(screen.getByTestId('weekly-progress')).toBeDefined();
    const text = (id: string) => screen.getByTestId(id).textContent;
    expect(text('stat-transactions')).toContain('42');
    expect(text('stat-current-streak')).toContain('4 weeks');
    expect(text('stat-longest-streak')).toContain('9 weeks');
    expect(text('stat-active-weeks')).toContain('12');
    expect(text('stat-total-xp')).toContain('2150');
    expect(text('stat-level')).toContain('5');
    expect(text('stat-achievements')).toContain('6 / 20');
    expect(text('stat-goals')).toContain('1 / 3');
    expect(text('stat-since')).toContain('July 5, 2024');
  });

  it('uses the singular for a single week and says so when nothing is tracked yet', () => {
    const empty: ProgressStats = {
      week: { ...week, transactions: 0, streak: 1, xp: 0 },
      global: { ...stats.global, currentStreak: 1, longestStreak: 1, trackingSince: null },
    };
    render(<ProgressStatsTab stats={empty} locale="en-US" />);
    expect(screen.getByTestId('stat-current-streak').textContent).toContain('1 week');
    expect(screen.getByTestId('stat-current-streak').textContent).not.toContain('1 weeks');
    expect(screen.getByTestId('stat-since').textContent).toContain('Nothing yet');
  });

  it('follows the language of the interface', async () => {
    await i18n.changeLanguage('fr');
    try {
      render(<ProgressStatsTab stats={stats} locale="fr-FR" />);
      expect(screen.getByTestId('stat-current-streak').textContent).toContain('4 semaines');
      expect(screen.getByTestId('stat-longest-streak').textContent).toContain('Meilleure série');
      expect(screen.getByTestId('stat-since').textContent).toContain('juillet 2024');
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});
