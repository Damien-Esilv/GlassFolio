import { AIToolDefinition } from '../types';
import { achievementService } from '../../achievementService';
import { gamificationService } from '../../gamificationService';
import { db } from '../../db';

export const getGamificationStatusTool: AIToolDefinition<
  Record<string, never>,
  {
    level: number;
    xp: number;
    rank: {
      id: string;
      titleKey: string;
      levelMin: number;
      levelMax: number;
    };
    progress: {
      xpInCurrentLevel: number;
      levelRange: number;
      progressPercent: number;
    };
    unlockedBadgesCount: number;
    totalBadgesCount: number;
    pinnedBadges: string[];
  }
> = {
  name: 'get_gamification_status',
  description:
    'Retrieve user gamification profile: current level, total XP, investor rank title, level progress percentage, and unlocked achievements count.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    const achData = await achievementService.getAchievements();
    const achievements = achData.achievements;
    const pinnedBadges = await gamificationService.getPinnedBadges();

    // Sum total XP or derive from level
    const user = {
      xp: achievements.reduce((acc, a) => {
        const unlockedLvl = a.levels.filter(l => l.level <= a.currentLevel);
        return acc + unlockedLvl.reduce((s, l) => s + l.xpReward, 0);
      }, 0)
    };

    const level = gamificationService.calculateLevel(user.xp);
    const rank = gamificationService.getInvestorRank(level);
    const progress = gamificationService.calculateLevelProgress(user.xp);
    const unlockedCount = achievements.filter(a => a.unlocked).length;

    return {
      level,
      xp: user.xp,
      rank: {
        id: rank.rankId,
        titleKey: rank.titleKey,
        levelMin: rank.levelMin,
        levelMax: rank.levelMax,
      },
      progress: {
        xpInCurrentLevel: progress.xpInCurrentLevel,
        levelRange: progress.levelRange,
        progressPercent: progress.progressPercent,
      },
      unlockedBadgesCount: unlockedCount,
      totalBadgesCount: achievements.length,
      pinnedBadges,
    };
  },
};

export const suggestNextMilestoneTool: AIToolDefinition<
  Record<string, never>,
  {
    nextMilestone: {
      badgeTitle: string;
      currentValue: number;
      targetValue: number;
      progressPercent: number;
      xpReward: number;
      description: string;
      recommendation: string;
    } | null;
  }
> = {
  name: 'suggest_next_milestone',
  description:
    'Analyzes incomplete or partially unlocked achievements and recommends the closest financial milestone within reach with actionable advice.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    const achData = await achievementService.getAchievements();
    const achievements = achData.achievements;

    // Find the achievement with the highest percentage towards its next level
    let bestCandidate: {
      badgeTitle: string;
      currentValue: number;
      targetValue: number;
      progressPercent: number;
      xpReward: number;
      description: string;
      recommendation: string;
    } | null = null;
    let highestPct = -1;

    for (const ach of achievements) {
      const nextLvl = ach.levels.find(l => l.level === ach.currentLevel + 1);
      if (nextLvl) {
        const currentVal = ach.currentValue || 0;
        const targetVal = nextLvl.targetValue;
        const pct = Math.min(99, Math.round((currentVal / targetVal) * 100));

        if (pct > highestPct) {
          highestPct = pct;

          let advice = `Continue regular investment tracking to reach ${targetVal}.`;
          if (ach.conditionType === 'dca_streak') {
            advice = `Execute a deposit or buy order this month to keep your consecutive monthly DCA streak alive!`;
          } else if (ach.conditionType === 'emergency_fund') {
            advice = `Boost your liquid cash reserves to reach ${targetVal}€ for peace of mind.`;
          } else if (ach.conditionType === 'asset_count') {
            advice = `Consider diversifying into another asset class to balance risk.`;
          } else if (ach.conditionType === 'goal_completed') {
            advice = `Review your active financial goals and make an incremental contribution.`;
          }

          bestCandidate = {
            badgeTitle: ach.title,
            currentValue: currentVal,
            targetValue: targetVal,
            progressPercent: pct,
            xpReward: nextLvl.xpReward,
            description: nextLvl.description,
            recommendation: advice,
          };
        }
      }
    }

    return {
      nextMilestone: bestCandidate,
    };
  },
};

export const listQuestsTool: AIToolDefinition<
  Record<string, never>,
  Array<{
    id: string;
    titleKey: string;
    rewardXp: number;
    frequency: string;
    completed: boolean;
    progress: number;
    target: number;
  }>
> = {
  name: 'list_quests',
  description: 'List active periodic gamification missions and progress towards completion.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    const quests = await gamificationService.getQuests();
    return quests.map(q => ({
      id: q.id,
      titleKey: q.titleKey,
      rewardXp: q.rewardXp,
      frequency: q.frequency,
      completed: q.completed,
      progress: q.progress,
      target: q.target,
    }));
  },
};
