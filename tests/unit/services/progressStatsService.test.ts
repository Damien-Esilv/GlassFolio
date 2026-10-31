/**
 * Progress statistics: the weekly figures (dashboard) and the all-time figures (Stats tab).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import {
  computeWeeklyStats,
  computeProgressStats,
  progressStatsService,
  WEEKLY_TRANSACTIONS_GOAL,
  STREAK_GOAL_WEEKS,
  WEEKLY_XP_GOAL,
} from '../../../src/services/progressStatsService';
import { gamificationService } from '../../../src/services/gamificationService';
import { db } from '../../../src/services/db';
import { vaultService } from '../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../src/services/security/authService';
import type { Achievement, FinancialGoal, Transaction, XpEvent } from '../../../src/types';

// Local dates (as in date.test.ts) so nothing depends on the machine timezone
const NOW = new Date(2026, 9, 28, 12); // Wednesday 28 Oct 2026; the ISO week starts on Monday 26 Oct
const tx = (y: number, m: number, d: number, status: 'Completed' | 'Pending' = 'Completed'): Transaction =>
  ({ id: `${y}-${m}-${d}`, date: new Date(y, m, d, 10).toISOString(), status } as unknown as Transaction);
const xp = (y: number, m: number, d: number, amount: number): XpEvent =>
  ({ id: `xp-${y}-${m}-${d}`, date: new Date(y, m, d, 9).toISOString(), amount, source: 'achievement' });

describe('computeWeeklyStats', () => {
  it('counts only the completed transactions of the current week', () => {
    const txs = [
      tx(2026, 9, 26), tx(2026, 9, 28),               // this week
      tx(2026, 9, 25),                                // Sunday: last week
      tx(2026, 9, 27, 'Pending'), tx(2026, 10, 2),    // pending, future
    ];
    expect(computeWeeklyStats(txs, [], NOW).transactions).toBe(2);
  });

  it('is the ISO week of today, from its Monday', () => {
    const week = computeWeeklyStats([], [], NOW);
    expect(week.weekNumber).toBe(44);
    expect(new Date(week.weekStart).getTime()).toBe(new Date(2026, 9, 26).getTime());
  });

  it('takes the XP earned this week only, not the total', () => {
    const events = [xp(2026, 9, 26, 100), xp(2026, 9, 28, 50), xp(2026, 9, 20, 300), xp(2026, 8, 1, 1000)];
    expect(computeWeeklyStats([], events, NOW).xp).toBe(150);
    expect(computeWeeklyStats([], [], NOW).xp).toBe(0);
  });

  it('uses the CURRENT streak: consecutive weeks up to this one, whatever the older history', () => {
    const run = [tx(2026, 9, 27), tx(2026, 9, 21), tx(2026, 9, 14)];
    const longOldRun = Array.from({ length: 12 }, (_, i) => tx(2024, 0, 1 + i * 7));
    const week = computeWeeklyStats([...run, ...longOldRun], [], NOW);
    expect(week.streak).toBe(3);
    // an old run alone is no current streak
    expect(computeWeeklyStats(longOldRun, [], NOW).streak).toBe(0);
  });

  it('draws the bars against the weekly targets and caps them at 100%', () => {
    const many = Array.from({ length: 9 }, () => tx(2026, 9, 27));
    const week = computeWeeklyStats(many, [xp(2026, 9, 27, 5000)], NOW);
    expect(week.transactionsPercent).toBe(100);
    expect(week.xpPercent).toBe(100);
    const half = computeWeeklyStats([tx(2026, 9, 27), tx(2026, 9, 28)], [xp(2026, 9, 27, WEEKLY_XP_GOAL / 2)], NOW);
    expect(half.transactionsPercent).toBe(Math.round((2 / WEEKLY_TRANSACTIONS_GOAL) * 100));
    expect(half.xpPercent).toBe(50);
    expect(computeWeeklyStats([tx(2026, 9, 27)], [], NOW).streakPercent).toBe(Math.round((1 / STREAK_GOAL_WEEKS) * 100));
  });
});

describe('computeProgressStats (all time)', () => {
  const achievements = [{ unlocked: true }, { unlocked: false }, { unlocked: true }] as unknown as Achievement[];
  const goals = [{ currentAmount: 100, targetAmount: 100 }, { currentAmount: 10, targetAmount: 100 }, { targetAmount: 50 }] as unknown as FinancialGoal[];

  it('adds the global figures to the weekly ones', () => {
    const weekly = Array.from({ length: 8 }, (_, i) => tx(2024, 6, 1 + i * 7)); // 8 weeks in a row in 2024
    const recent = [tx(2026, 9, 27), tx(2026, 9, 21)];
    const stats = computeProgressStats({
      transactions: [...weekly, ...recent, tx(2026, 9, 28)], xpEvents: [xp(2026, 9, 27, 40)], xp: 1250, level: 4, achievements, goals,
    }, NOW);

    expect(stats.global).toMatchObject({
      totalTransactions: 11,
      activeWeeks: 10,     // 8 in 2024 + the 2 recent weeks (3 recent transactions, 2 weeks)
      currentStreak: 2,
      longestStreak: 8,
      totalXp: 1250,
      level: 4,
      achievementsUnlocked: 2,
      achievementsTotal: 3,
      goalsCompleted: 1,
      goalsTotal: 3,
    });
    expect(new Date(stats.global.trackingSince as string).getTime()).toBe(new Date(2024, 6, 1, 10).getTime());
    expect(stats.week).toMatchObject({ transactions: 2, streak: 2, xp: 40 });
  });

  it('is all zeros without any data, with no tracking date', () => {
    const stats = computeProgressStats({ transactions: [], xpEvents: [], xp: 0, level: 1, achievements: [], goals: [] }, NOW);
    expect(stats.global).toEqual({
      totalTransactions: 0, activeWeeks: 0, currentStreak: 0, longestStreak: 0, totalXp: 0, level: 1,
      achievementsUnlocked: 0, achievementsTotal: 0, goalsCompleted: 0, goalsTotal: 0, trackingSince: null,
    });
    expect(stats.week).toMatchObject({ transactions: 0, streak: 0, xp: 0 });
  });

  it('ignores invalid dates', () => {
    const stats = computeProgressStats({ transactions: [{ date: 'nope', status: 'Completed' } as unknown as Transaction], xpEvents: [], xp: 0, level: 1, achievements: [], goals: [] }, NOW);
    expect(stats.global.trackingSince).toBeNull();
    expect(stats.global.totalTransactions).toBe(1);
    expect(stats.global.activeWeeks).toBe(0);
  });
});

describe('progressStatsService.getStats and the XP events', () => {
  beforeEach(async () => {
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('stats@example.test', 'Stats-Test-Key-2026!#xx', 'Stats');
  });

  it('records dated XP gains, refuses a gain of nothing, and keeps them in order', async () => {
    const at = new Date(2026, 9, 27, 8);
    const first = await gamificationService.recordXp(120, 'achievement', 'ac1', at);
    expect(first).toMatchObject({ amount: 120, source: 'achievement', refId: 'ac1', date: at.toISOString() });
    await gamificationService.recordXp(50, 'quest', 'q1', new Date(2026, 9, 28, 8));
    expect(await gamificationService.recordXp(0, 'quest')).toBeNull();
    expect(await gamificationService.recordXp(Number.NaN, 'quest')).toBeNull();
    expect(await gamificationService.recordXp(-5, 'quest')).toBeNull();

    expect((await gamificationService.getXpEvents()).map(e => e.amount)).toEqual([120, 50]);
  });

  it('reads the user and the stored data: weekly XP comes from the events, total XP from the profile', async () => {
    await gamificationService.recordXp(70, 'quest', 'q1', new Date(2026, 9, 27, 8));
    await gamificationService.recordXp(900, 'achievement', 'ac2', new Date(2026, 8, 1, 8));
    db.saveTransactions([tx(2026, 9, 27), tx(2026, 9, 21)]);

    const stats = await progressStatsService.getStats(NOW);

    expect(stats.week).toMatchObject({ transactions: 1, streak: 2, xp: 70 });
    expect(stats.global).toMatchObject({ totalTransactions: 2, currentStreak: 2, level: 1 });
  });

  it('XP events are part of an export, wiped with the account data, and restored from a backup', async () => {
    await gamificationService.recordXp(70, 'quest', 'q1', new Date(2026, 9, 27, 8));
    const exported = db.exportAll({ persistedOnly: true }) as { xpEvents: XpEvent[] };
    expect(exported.xpEvents.map(e => e.amount)).toEqual([70]);

    db.resetAccountDataToZero();
    expect(db.getXpEvents()).toEqual([]);

    const { restoreBackupReset, mergeBackupData } = await import('../../../src/services/import/backupRestoreService');
    await restoreBackupReset({ xpEvents: exported.xpEvents } as never);
    expect(db.getXpEvents().map(e => e.amount)).toEqual([70]);
    await mergeBackupData({ xpEvents: [{ ...exported.xpEvents[0], id: 'xp-other', amount: 5 }] } as never);
    expect(db.getXpEvents().map(e => e.amount).sort((a, b) => a - b)).toEqual([5, 70]);
  });
});

describe('get_progress_stats AI tool', () => {
  it('is registered, read-only, and returns the weekly and all-time figures', async () => {
    const { aiToolRegistry } = await import('../../../src/services/ai/aiToolRegistry');
    await import('../../../src/services/ai/tools');
    const tool = aiToolRegistry.getTool('get_progress_stats');
    expect(tool).toBeDefined();
    expect(tool?.requiresConfirmation).toBeFalsy();

    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('tool@example.test', 'Tool-Test-Key-2026!#xx', 'Tool');
    const result = (await tool!.execute({})) as { week: object; global: object };
    expect(result.week).toHaveProperty('xp');
    expect(result.week).toHaveProperty('streak');
    expect(result.global).toHaveProperty('longestStreak');
    expect(result.global).toHaveProperty('totalTransactions');
  });
});
