import { InvestorRank, GamificationQuest, ThemeReward } from '../types';
import { db, delay, isRealUserVaultActive } from './db';

export const INVESTOR_RANKS: InvestorRank[] = [
    {
        rankId: 'novice',
        levelMin: 1,
        levelMax: 5,
        titleKey: 'gamification:ranks.novice.title',
        descriptionKey: 'gamification:ranks.novice.description',
        color: 'emerald'
    },
    {
        rankId: 'prudent',
        levelMin: 6,
        levelMax: 10,
        titleKey: 'gamification:ranks.prudent.title',
        descriptionKey: 'gamification:ranks.prudent.description',
        color: 'blue'
    },
    {
        rankId: 'navigator',
        levelMin: 11,
        levelMax: 15,
        titleKey: 'gamification:ranks.navigator.title',
        descriptionKey: 'gamification:ranks.navigator.description',
        color: 'indigo'
    },
    {
        rankId: 'alchemist',
        levelMin: 16,
        levelMax: 20,
        titleKey: 'gamification:ranks.alchemist.title',
        descriptionKey: 'gamification:ranks.alchemist.description',
        color: 'orange'
    },
    {
        rankId: 'sovereign',
        levelMin: 21,
        levelMax: 999,
        titleKey: 'gamification:ranks.sovereign.title',
        descriptionKey: 'gamification:ranks.sovereign.description',
        color: 'rose'
    }
];

export const THEME_REWARDS: ThemeReward[] = [
    {
        id: 'theme_light',
        themeKey: 'light',
        nameKey: 'settings:preferences.light',
        requiredLevel: 1,
        unlocked: true,
        previewColors: ['var(--bg-card)', 'var(--color-primary)']
    },
    {
        id: 'theme_night',
        themeKey: 'night',
        nameKey: 'settings:preferences.night',
        requiredLevel: 1,
        unlocked: true,
        previewColors: ['var(--bg-subtle)', 'var(--color-accent-indigo)']
    },
    {
        id: 'theme_dark',
        themeKey: 'dark',
        nameKey: 'settings:preferences.dark',
        requiredLevel: 2,
        unlocked: false,
        previewColors: ['var(--bg-canvas)', 'var(--color-primary)']
    },
    {
        id: 'theme_emerald',
        themeKey: 'emerald',
        nameKey: 'gamification:themes.emeraldPrestige',
        requiredLevel: 6,
        unlocked: false,
        previewColors: ['var(--color-positive)', 'var(--color-brand)']
    },
    {
        id: 'theme_cyber',
        themeKey: 'cyber',
        nameKey: 'gamification:themes.cyberNeon',
        requiredLevel: 15,
        unlocked: false,
        previewColors: ['var(--color-accent-cyan)', 'var(--color-accent-purple)']
    }
];

const INITIAL_QUESTS: GamificationQuest[] = [
    {
        id: 'quest_monthly_review',
        titleKey: 'gamification:quests.monthlyReview.title',
        descriptionKey: 'gamification:quests.monthlyReview.description',
        rewardXp: 150,
        frequency: 'monthly',
        completed: true,
        claimed: false,
        progress: 1,
        target: 1,
        expiryDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString()
    },
    {
        id: 'quest_dca_habit',
        titleKey: 'gamification:quests.dcaHabit.title',
        descriptionKey: 'gamification:quests.dcaHabit.description',
        rewardXp: 200,
        frequency: 'monthly',
        completed: true,
        claimed: false,
        progress: 2,
        target: 2,
        expiryDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString()
    },
    {
        id: 'quest_allocation_audit',
        titleKey: 'gamification:quests.allocationAudit.title',
        descriptionKey: 'gamification:quests.allocationAudit.description',
        rewardXp: 200,
        frequency: 'quarterly',
        completed: false,
        claimed: false,
        progress: 2,
        target: 3,
        expiryDate: new Date(new Date().getFullYear(), new Date().getMonth() + 3, 0).toISOString()
    }
];

export const gamificationService = {
    /**
     * Returns the user's investor rank based on current level.
     */
    getInvestorRank: (level: number): InvestorRank => {
        const found = INVESTOR_RANKS.find(r => level >= r.levelMin && level <= r.levelMax);
        return found || INVESTOR_RANKS[0];
    },

    /**
     * Calculates the level given total XP. Formula: floor(sqrt(xp / 100)) + 1
     */
    calculateLevel: (xp: number): number => {
        return Math.floor(Math.sqrt((xp || 0) / 100)) + 1;
    },

    /**
     * Calculates total XP required to reach a specific level.
     */
    calculateXpForLevel: (level: number): number => {
        if (level <= 1) return 0;
        return Math.pow(level - 1, 2) * 100;
    },

    /**
     * Returns progress details within the current level:
     * - currentLevelXp: XP accumulated in this level
     * - neededLevelXp: Total XP required to pass to next level
     * - progressPercent: 0 to 100
     */
    calculateLevelProgress: (xp: number) => {
        const currentLevel = Math.floor(Math.sqrt((xp || 0) / 100)) + 1;
        const currentLevelBaseXp = Math.pow(currentLevel - 1, 2) * 100;
        const nextLevelBaseXp = Math.pow(currentLevel, 2) * 100;
        const levelRange = nextLevelBaseXp - currentLevelBaseXp;
        const xpInCurrentLevel = Math.max(0, (xp || 0) - currentLevelBaseXp);
        const progressPercent = Math.min(100, Math.round((xpInCurrentLevel / levelRange) * 100));

        return {
            level: currentLevel,
            currentLevelBaseXp,
            nextLevelBaseXp,
            xpInCurrentLevel,
            levelRange,
            progressPercent
        };
    },

    /**
     * Returns all unlockable theme rewards with unlocked status evaluated against level.
     */
    getThemeRewards: async (userLevel: number): Promise<ThemeReward[]> => {
        await delay(150);
        return THEME_REWARDS.map(theme => ({
            ...theme,
            unlocked: userLevel >= theme.requiredLevel
        }));
    },

    /**
     * Retrieves active quests.
     */
    getQuests: async (): Promise<GamificationQuest[]> => {
        await delay(200);
        const stored = db.getQuests();
        if (stored.length === 0) {
            const defaultQuests = isRealUserVaultActive()
                ? INITIAL_QUESTS.map(q => ({ ...q, completed: false, claimed: false, progress: 0 }))
                : INITIAL_QUESTS;
            db.saveQuests(defaultQuests);
            return defaultQuests;
        }
        return stored;
    },

    /**
     * Claims reward for a completed quest and persists its claimed status.
     */
    claimQuestReward: async (questId: string): Promise<{ success: boolean; xpReward: number }> => {
        await delay(200);
        let quests = db.getQuests();
        if (quests.length === 0) {
            quests = isRealUserVaultActive()
                ? INITIAL_QUESTS.map(q => ({ ...q, completed: false, claimed: false, progress: 0 }))
                : [...INITIAL_QUESTS];
        }
        const questIndex = quests.findIndex(q => q.id === questId);
        if (questIndex === -1) {
            return { success: false, xpReward: 0 };
        }
        const quest = quests[questIndex];
        if (!quest.completed || quest.claimed) {
            return { success: false, xpReward: 0 };
        }
        const updatedQuests = [...quests];
        updatedQuests[questIndex] = { ...quest, claimed: true };
        db.saveQuests(updatedQuests);
        return { success: true, xpReward: quest.rewardXp };
    },

    /**
     * Gets pinned badge IDs (max 3).
     */
    getPinnedBadges: async (): Promise<string[]> => {
        await delay(100);
        return db.getPinnedBadges();
    },

    /**
     * Saves pinned badge IDs.
     */
    setPinnedBadges: async (badgeIds: string[]): Promise<string[]> => {
        await delay(100);
        const trimmed = badgeIds.slice(0, 3);
        db.savePinnedBadges(trimmed);
        return trimmed;
    }
};
