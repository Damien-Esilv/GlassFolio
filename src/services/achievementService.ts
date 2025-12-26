import { Achievement } from '../../types';
import { db, delay } from './db';

// This simulates the "Game Engine" running on the server
export const achievementService = {
    getAchievements: async (): Promise<{ achievements: Achievement[], xpGained: number }> => {
        await delay(300);
        const achievements = db.getAchievements();
        const positions = db.getPositions();
        const transactions = db.getTransactions();

        const totalValue = positions.reduce((acc, p) => acc + p.marketValue, 0);
        const txCount = transactions.length;
        const assetTypes = new Set(positions.map(p => p.type)).size;

        let xpGained = 0;
        let hasChanges = false;

        const updatedAchievements = achievements.map(ach => {
            let currentValue = 0;
            switch (ach.conditionType) {
                case 'total_value': currentValue = totalValue; break;
                case 'transaction_count': currentValue = txCount; break;
                case 'asset_count': currentValue = assetTypes; break;
                default: currentValue = 0;
            }

            // Check Levels
            let newLevel = ach.currentLevel;
            // Check next level
            const nextLevelIdx = ach.levels.findIndex(l => l.level === ach.currentLevel + 1);
            if (nextLevelIdx !== -1) {
                const nextLevel = ach.levels[nextLevelIdx];
                if (currentValue >= nextLevel.targetValue) {
                    newLevel = nextLevel.level;
                    xpGained += nextLevel.xpReward;
                    hasChanges = true;
                }
            } else if (ach.currentLevel === 0 && ach.levels.length > 0) {
                // Check first level
                if (currentValue >= ach.levels[0].targetValue) {
                    newLevel = 1;
                    xpGained += ach.levels[0].xpReward;
                    hasChanges = true;
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

        // We assume the caller handles updating the User profile (XP/Levels) via AuthContext
        // In a real app, this returned xpGained would be applied to the user in the DB here.

        return {
            achievements: hasChanges ? updatedAchievements : achievements,
            xpGained
        };
    }
};
