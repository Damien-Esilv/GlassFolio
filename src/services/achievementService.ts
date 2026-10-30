import { Achievement, Position, Transaction } from '../types';
import { db, delay } from './db';
import { getStartOfCurrentWeek } from '../utils/date';

export interface AchievementUnlockEvent {
    achievementId: string;
    title: string;
    level: number;
    xpReward: number;
    badgeKey?: string;
    iconType: string;
    color: string;
}

/**
 * Calculates consecutive monthly DCA investing streaks.
 * Returns the highest streak achieved or current active streak.
 */
function calculateDcaStreak(transactions: Transaction[]): number {
    const buyTxs = transactions.filter(t =>
        (t.type === 'Buy' || t.type === 'Deposit') &&
        t.status === 'Completed' &&
        t.date
    );
    if (buyTxs.length === 0) return 0;

    const monthSet = new Set<string>();
    buyTxs.forEach(t => {
        try {
            const d = new Date(t.date);
            if (!isNaN(d.getTime())) {
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                monthSet.add(`${yyyy}-${mm}`);
            }
        } catch {
            // Ignore invalid date strings
        }
    });

    const months = Array.from(monthSet).sort();
    if (months.length === 0) return 0;

    let maxStreak = 1;
    let currentStreak = 1;

    for (let i = 1; i < months.length; i++) {
        const [prevY, prevM] = months[i - 1].split('-').map(Number);
        const [currY, currM] = months[i].split('-').map(Number);
        const diffMonths = (currY - prevY) * 12 + (currM - prevM);

        if (diffMonths === 1) {
            currentStreak += 1;
            if (currentStreak > maxStreak) maxStreak = currentStreak;
        } else if (diffMonths > 1) {
            currentStreak = 1;
        }
    }

    return maxStreak;
}

/**
 * Calculates holding duration in months across active positions.
 */
function calculateMaxHoldingDurationMonths(positions: Position[], transactions: Transaction[]): number {
    const activeSymbols = new Set(positions.filter(p => p.quantity > 0).map(p => p.symbol));
    if (activeSymbols.size === 0) return 0;

    let maxMonths = 0;
    const now = Date.now();

    activeSymbols.forEach(sym => {
        const symTxs = transactions.filter(t => t.symbol === sym && (t.type === 'Buy' || t.type === 'Deposit'));
        symTxs.forEach(t => {
            const txTime = new Date(t.date).getTime();
            if (!isNaN(txTime) && txTime <= now) {
                const months = Math.floor((now - txTime) / (1000 * 60 * 60 * 24 * 30.4375));
                if (months > maxMonths) maxMonths = months;
            }
        });
    });

    return maxMonths;
}

/** Local calendar day of a date, as a stable key (no DST arithmetic on timestamps). */
const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/**
 * Calculates the tracking streak: the number of consecutive ISO weeks (Monday to Sunday, local time)
 * with at least one completed transaction, ending this week or, if nothing happened yet this week,
 * last week. Weeks without activity break it; future-dated and pending transactions do not count.
 */
export function calculateWeeklyTrackingStreak(transactions: Transaction[], now: Date = new Date()): number {
    const activeWeeks = new Set<string>();
    transactions.forEach(t => {
        if (t.status === 'Pending') return;
        const d = new Date(t.date);
        if (isNaN(d.getTime()) || d.getTime() > now.getTime()) return;
        activeWeeks.add(dayKey(getStartOfCurrentWeek(d)));
    });
    if (activeWeeks.size === 0) return 0;

    const cursor = getStartOfCurrentWeek(now);
    if (!activeWeeks.has(dayKey(cursor))) {
        cursor.setDate(cursor.getDate() - 7);
        if (!activeWeeks.has(dayKey(cursor))) return 0;
    }
    let streak = 0;
    while (activeWeeks.has(dayKey(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 7);
    }
    return streak;
}

/**
 * The longest tracking streak in the whole history: consecutive ISO weeks with a completed transaction,
 * wherever they are on the calendar. It comes from the transaction dates (when the user traded), not from
 * when they were imported, so importing years of history gives the streak those years earned.
 */
export function calculateLongestWeeklyStreak(transactions: Transaction[], now: Date = new Date()): number {
    const weeks = new Map<string, Date>();
    transactions.forEach(t => {
        if (t.status === 'Pending') return;
        const d = new Date(t.date);
        if (isNaN(d.getTime()) || d.getTime() > now.getTime()) return;
        const monday = getStartOfCurrentWeek(d);
        weeks.set(dayKey(monday), monday);
    });

    let longest = 0;
    for (const monday of weeks.values()) {
        const before = new Date(monday);
        before.setDate(before.getDate() - 7);
        if (weeks.has(dayKey(before))) continue; // not the first week of a run

        let run = 0;
        const cursor = new Date(monday);
        while (weeks.has(dayKey(cursor))) {
            run += 1;
            cursor.setDate(cursor.getDate() + 7);
        }
        longest = Math.max(longest, run);
    }
    return longest;
}

// This simulates the "Game Engine" running on the server
export const achievementService = {
    getAchievements: async (): Promise<{
        achievements: Achievement[];
        xpGained: number;
        unlockedEvents: AchievementUnlockEvent[];
    }> => {
        await delay(300);
        const achievements = db.getAchievements();
        const positions = db.getPositions();
        const transactions = db.getTransactions();
        const goals = db.getGoals();

        const totalValue = positions.reduce((acc, p) => acc + p.marketValue, 0);
        const txCount = transactions.length;
        const assetTypes = new Set(positions.map(p => p.type)).size;
        const dcaStreak = calculateDcaStreak(transactions);
        const emergencyCash = positions
            .filter(p => p.type === 'Cash' || p.symbol === 'EUR' || p.symbol === 'USD' || p.symbol === 'USDC' || p.symbol === 'USDT')
            .reduce((sum, p) => sum + p.marketValue, 0);
        const hodlMonths = calculateMaxHoldingDurationMonths(positions, transactions);
        const goalsCompleted = goals.filter(g => (g.currentAmount || 0) >= g.targetAmount).length;
        const activeWeeks = calculateLongestWeeklyStreak(transactions);

        let xpGained = 0;
        let hasChanges = false;
        const unlockedEvents: AchievementUnlockEvent[] = [];

        const updatedAchievements = achievements.map(ach => {
            let currentValue = 0;
            switch (ach.conditionType) {
                case 'total_value': currentValue = totalValue; break;
                case 'transaction_count': currentValue = txCount; break;
                case 'asset_count': currentValue = assetTypes; break;
                case 'dca_streak': currentValue = dcaStreak; break;
                case 'emergency_fund': currentValue = emergencyCash; break;
                case 'hodl_duration': currentValue = hodlMonths; break;
                case 'goal_completed': currentValue = goalsCompleted; break;
                case 'streak': currentValue = activeWeeks; break;
                default: currentValue = 0;
            }

            let newLevel = ach.currentLevel;
            const sortedLevels = [...ach.levels].sort((a, b) => a.level - b.level);

            for (const lvl of sortedLevels) {
                if (currentValue >= lvl.targetValue) {
                    if (lvl.level > newLevel) {
                        newLevel = lvl.level;
                    }
                    if (lvl.level > ach.currentLevel) {
                        xpGained += lvl.xpReward;
                        hasChanges = true;
                        unlockedEvents.push({
                            achievementId: ach.id,
                            title: ach.title,
                            level: lvl.level,
                            xpReward: lvl.xpReward,
                            badgeKey: ach.badgeKey,
                            iconType: ach.iconType,
                            color: ach.color
                        });
                    }
                }
            }

            return {
                ...ach,
                currentValue,
                currentLevel: newLevel,
                unlocked: newLevel > 0
            };
        });

        if (hasChanges) {
            db.saveAchievements(updatedAchievements);
        }

        return {
            achievements: hasChanges ? updatedAchievements : achievements,
            xpGained,
            unlockedEvents
        };
    }
};
