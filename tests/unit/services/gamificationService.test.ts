import { describe, it, expect, beforeEach } from 'vitest';
import { gamificationService, INVESTOR_RANKS } from '../../../src/services/gamificationService';
import { achievementService } from '../../../src/services/achievementService';
import { 
  getGamificationStatusTool, 
  suggestNextMilestoneTool, 
  listQuestsTool 
} from '../../../src/services/ai/tools/gamificationTools';
import { db } from '../../../src/services/db';

describe('GamificationService', () => {
  describe('Level and XP Calculations', () => {
    it('calculates level 1 for 0 XP', () => {
      expect(gamificationService.calculateLevel(0)).toBe(1);
    });

    it('calculates level 2 for 100 XP', () => {
      expect(gamificationService.calculateLevel(100)).toBe(2);
    });

    it('calculates level 3 for 400 XP', () => {
      expect(gamificationService.calculateLevel(400)).toBe(3);
    });

    it('calculates level 4 for 900 XP', () => {
      expect(gamificationService.calculateLevel(900)).toBe(4);
    });

    it('calculates correct level progress percentage', () => {
      // Level 1 goes from 0 to 100 XP
      const prog50 = gamificationService.calculateLevelProgress(50);
      expect(prog50.level).toBe(1);
      expect(prog50.progressPercent).toBe(50);

      // Level 2 goes from 100 to 400 XP (range: 300)
      const prog250 = gamificationService.calculateLevelProgress(250);
      expect(prog250.level).toBe(2);
      expect(prog250.xpInCurrentLevel).toBe(150);
      expect(prog250.progressPercent).toBe(50);
    });
  });

  describe('Investor Ranks', () => {
    it('assigns Apprentice Saver (Novice) for levels 1-5', () => {
      const rank = gamificationService.getInvestorRank(3);
      expect(rank.rankId).toBe('novice');
      expect(rank.levelMin).toBe(1);
      expect(rank.levelMax).toBe(5);
    });

    it('assigns Prudent Allocator for levels 6-10', () => {
      const rank = gamificationService.getInvestorRank(7);
      expect(rank.rankId).toBe('prudent');
    });

    it('assigns Market Navigator for levels 11-15', () => {
      const rank = gamificationService.getInvestorRank(12);
      expect(rank.rankId).toBe('navigator');
    });

    it('assigns Compound Interest Alchemist for levels 16-20', () => {
      const rank = gamificationService.getInvestorRank(18);
      expect(rank.rankId).toBe('alchemist');
    });

    it('assigns Financial Sovereign for levels 21+', () => {
      const rank = gamificationService.getInvestorRank(25);
      expect(rank.rankId).toBe('sovereign');
    });
  });

  describe('Theme Rewards', () => {
    it('unlocks light and night themes at level 1 and locks advanced themes', async () => {
      const themesLvl1 = await gamificationService.getThemeRewards(1);
      const lightTheme = themesLvl1.find(t => t.themeKey === 'light');
      const nightTheme = themesLvl1.find(t => t.themeKey === 'night');
      const darkTheme = themesLvl1.find(t => t.themeKey === 'dark');
      const emeraldTheme = themesLvl1.find(t => t.themeKey === 'emerald');

      expect(lightTheme?.unlocked).toBe(true);
      expect(nightTheme?.unlocked).toBe(true);
      expect(darkTheme?.unlocked).toBe(false);
      expect(emeraldTheme?.unlocked).toBe(false);
    });

    it('unlocks dark theme at level 2+', async () => {
      const themesLvl2 = await gamificationService.getThemeRewards(2);
      expect(themesLvl2.find(t => t.themeKey === 'dark')?.unlocked).toBe(true);
      expect(themesLvl2.find(t => t.themeKey === 'emerald')?.unlocked).toBe(false);
    });

    it('unlocks Emerald Prestige at level 6+ and Cyber Neon at level 15+', async () => {
      const themesLvl6 = await gamificationService.getThemeRewards(6);
      expect(themesLvl6.find(t => t.themeKey === 'emerald')?.unlocked).toBe(true);
      expect(themesLvl6.find(t => t.themeKey === 'cyber')?.unlocked).toBe(false);

      const themesLvl15 = await gamificationService.getThemeRewards(15);
      expect(themesLvl15.find(t => t.themeKey === 'cyber')?.unlocked).toBe(true);
    });

    it('allows demo user to reach level 6 and unlock emerald theme upon claiming 2 quests', async () => {
      const initialDemoXp = 2200;
      const initialLevel = gamificationService.calculateLevel(initialDemoXp);
      expect(initialLevel).toBe(5);

      const quests = await gamificationService.getQuests();
      const quest1 = quests[0];
      const quest2 = quests[1];

      expect(quest1.completed).toBe(true);
      expect(quest2.completed).toBe(true);

      const totalClaimedXp = initialDemoXp + quest1.rewardXp + quest2.rewardXp;
      expect(totalClaimedXp).toBe(2550); // 2200 + 150 + 200

      const newLevel = gamificationService.calculateLevel(totalClaimedXp);
      expect(newLevel).toBe(6);

      const themesAfterClaim = await gamificationService.getThemeRewards(newLevel);
      expect(themesAfterClaim.find(t => t.themeKey === 'emerald')?.unlocked).toBe(true);
    });
  });

  describe('Quests and Pinned Badges', () => {
    it('fetches initial quests list', async () => {
      const quests = await gamificationService.getQuests();
      expect(quests.length).toBeGreaterThan(0);
      expect(quests[0]).toHaveProperty('titleKey');
      expect(quests[0]).toHaveProperty('rewardXp');
    });

    it('claims completed quest, prevents double-claiming, and persists claimed state', async () => {
      // Ensure quest_monthly_review exists and is completed
      const initialQuests = await gamificationService.getQuests();
      const targetQuest = initialQuests.find(q => q.id === 'quest_monthly_review');
      expect(targetQuest).toBeDefined();

      // First claim should succeed
      const firstClaim = await gamificationService.claimQuestReward('quest_monthly_review');
      expect(firstClaim.success).toBe(true);
      expect(firstClaim.xpReward).toBe(150);

      // Second claim should be rejected
      const secondClaim = await gamificationService.claimQuestReward('quest_monthly_review');
      expect(secondClaim.success).toBe(false);
      expect(secondClaim.xpReward).toBe(0);

      // Verify persisted state
      const reloadedQuests = await gamificationService.getQuests();
      const updatedTarget = reloadedQuests.find(q => q.id === 'quest_monthly_review');
      expect(updatedTarget?.claimed).toBe(true);
    });

    it('pins max 3 badges cleanly', async () => {
      const pinned = await gamificationService.setPinnedBadges(['ac1', 'ac2', 'ac3', 'ac4']);
      expect(pinned.length).toBe(3);
      expect(pinned).toEqual(['ac1', 'ac2', 'ac3']);
    });
  });
});

describe('AchievementService Engine', () => {
  it('retrieves achievements and evaluates dynamic progress', async () => {
    const result = await achievementService.getAchievements();
    expect(result.achievements).toBeDefined();
    expect(result.achievements.length).toBeGreaterThanOrEqual(3);

    // Verify presence of newly added financial discipline badges
    const dcaBadge = result.achievements.find(a => a.conditionType === 'dca_streak');
    expect(dcaBadge).toBeDefined();

    const emergencyBadge = result.achievements.find(a => a.conditionType === 'emergency_fund');
    expect(emergencyBadge).toBeDefined();
  });
});

describe('AI & MCP Gamification Tools', () => {
  const mockContext = { userId: 'user-demo', language: 'fr' as const, currency: 'EUR' };

  it('executes get_gamification_status tool correctly', async () => {
    const status = await getGamificationStatusTool.execute({}, mockContext);
    expect(status).toHaveProperty('level');
    expect(status).toHaveProperty('xp');
    expect(status).toHaveProperty('rank');
    expect(status).toHaveProperty('progress');
    expect(status.totalBadgesCount).toBeGreaterThan(0);
  });

  it('executes suggest_next_milestone tool correctly', async () => {
    const suggestion = await suggestNextMilestoneTool.execute({}, mockContext);
    expect(suggestion).toHaveProperty('nextMilestone');
    if (suggestion.nextMilestone) {
      expect(suggestion.nextMilestone).toHaveProperty('badgeTitle');
      expect(suggestion.nextMilestone).toHaveProperty('recommendation');
    }
  });

  it('executes list_quests tool correctly', async () => {
    const quests = await listQuestsTool.execute({}, mockContext);
    expect(Array.isArray(quests)).toBe(true);
    expect(quests.length).toBeGreaterThan(0);
  });
});
