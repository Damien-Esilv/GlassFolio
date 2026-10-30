/**
 * Progress statistics: the weekly figures of the dashboard and the all-time figures of the Stats tab.
 *
 * - transactions: completed transactions dated in the current ISO week
 * - streak: the CURRENT streak of consecutive active weeks (see achievementService)
 * - xp: experience points earned during the current week (from the dated XP events)
 * The pure `compute*` functions take their data as arguments so the screens can use them reactively.
 */

import type { Achievement, FinancialGoal, Transaction, XpEvent } from '../types';
import { db, delay } from './db';
import { userRepository } from './repositories';
import { getISOWeekNumber, getStartOfCurrentWeek } from '../utils/date';
import {
    calculateLongestWeeklyStreak,
    calculateWeeklyTrackingStreak,
    collectActiveWeeks,
} from './achievementService';

/** Targets the weekly progress bars are drawn against. */
export const WEEKLY_TRANSACTIONS_GOAL = 5;
export const STREAK_GOAL_WEEKS = 10;
export const WEEKLY_XP_GOAL = 500;

export interface WeeklyStats {
    /** ISO week number */
    weekNumber: number;
    /** ISO 8601 date-time of Monday 00:00 of the week */
    weekStart: string;
    transactions: number;
    /** Current streak, in weeks */
    streak: number;
    /** XP earned this week */
    xp: number;
    transactionsPercent: number;
    streakPercent: number;
    xpPercent: number;
}

export interface GlobalStats {
    totalTransactions: number;
    /** Weeks with at least one transaction, consecutive or not */
    activeWeeks: number;
    currentStreak: number;
    longestStreak: number;
    totalXp: number;
    level: number;
    achievementsUnlocked: number;
    achievementsTotal: number;
    goalsCompleted: number;
    goalsTotal: number;
    /** ISO 8601 date of the oldest transaction, null without any */
    trackingSince: string | null;
}

export interface ProgressStats {
    week: WeeklyStats;
    global: GlobalStats;
}

export interface ProgressStatsInput {
    transactions: Transaction[];
    xpEvents: XpEvent[];
    /** Total XP and level of the user */
    xp: number;
    level: number;
    achievements: Achievement[];
    goals: FinancialGoal[];
}

const percentOf = (value: number, goal: number): number => Math.min(100, Math.round((value / goal) * 100));

export function computeWeeklyStats(transactions: Transaction[], xpEvents: XpEvent[], now: Date = new Date()): WeeklyStats {
    const start = getStartOfCurrentWeek(now);
    const startTime = start.getTime();

    const weekTransactions = transactions.filter(tx => {
        if (tx.status === 'Pending') return false;
        const time = new Date(tx.date).getTime();
        return !isNaN(time) && time >= startTime && time <= now.getTime();
    }).length;

    const xp = xpEvents.reduce((sum, event) => {
        const time = new Date(event.date).getTime();
        return !isNaN(time) && time >= startTime && time <= now.getTime() ? sum + event.amount : sum;
    }, 0);
    const streak = calculateWeeklyTrackingStreak(transactions, now);

    return {
        weekNumber: getISOWeekNumber(now),
        weekStart: start.toISOString(),
        transactions: weekTransactions,
        streak,
        xp,
        transactionsPercent: percentOf(weekTransactions, WEEKLY_TRANSACTIONS_GOAL),
        streakPercent: percentOf(streak, STREAK_GOAL_WEEKS),
        xpPercent: percentOf(xp, WEEKLY_XP_GOAL),
    };
}

export function computeProgressStats(input: ProgressStatsInput, now: Date = new Date()): ProgressStats {
    const { transactions, achievements, goals } = input;

    const dates = transactions
        .map(tx => new Date(tx.date).getTime())
        .filter(time => !isNaN(time));
    const oldest = dates.length > 0 ? Math.min(...dates) : null;

    return {
        week: computeWeeklyStats(transactions, input.xpEvents, now),
        global: {
            totalTransactions: transactions.length,
            activeWeeks: collectActiveWeeks(transactions, now).size,
            currentStreak: calculateWeeklyTrackingStreak(transactions, now),
            longestStreak: calculateLongestWeeklyStreak(transactions, now),
            totalXp: input.xp,
            level: input.level,
            achievementsUnlocked: achievements.filter(a => a.unlocked).length,
            achievementsTotal: achievements.length,
            goalsCompleted: goals.filter(g => (g.currentAmount || 0) >= g.targetAmount).length,
            goalsTotal: goals.length,
            trackingSince: oldest === null ? null : new Date(oldest).toISOString(),
        },
    };
}

export const progressStatsService = {
    /** The weekly and all-time statistics of the signed-in user, read from the local store. */
    getStats: async (now: Date = new Date()): Promise<ProgressStats> => {
        await delay(100);
        const user = await userRepository.getUser();
        return computeProgressStats({
            transactions: db.getTransactions(),
            xpEvents: db.getXpEvents(),
            xp: user?.xp ?? 0,
            level: user?.level ?? 1,
            achievements: db.getAchievements(),
            goals: db.getGoals(),
        }, now);
    },
};
