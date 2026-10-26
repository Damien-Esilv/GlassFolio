import { Achievement, Position, Transaction } from '../types';
import { db, delay } from './db';

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

/**
 * Calculates active tracking streak (distinct active weeks from transactions).
 */
export function calculateWeeklyTrackingStreak(transactions: Transaction[]): number {
    if (transactions.length === 0) return 0;
    const weekSet = new Set<string>();
    transactions.forEach(t => {
        const d = new Date(t.date);
        if (!isNaN(d.getTime())) {
            const year = d.getFullYear();
            const oneJan = new Date(year, 0, 1);
            const numberOfDays = Math.floor((d.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
            const week = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
            weekSet.add(`${year}-W${week}`);
        }
    });
    return Math.max(1, weekSet.size);
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
        const activeWeeks = calculateWeeklyTrackingStreak(transactions);

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
