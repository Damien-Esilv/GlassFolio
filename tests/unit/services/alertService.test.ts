/**
 * Unit Tests — alertService.ts (TGLA-070 & TGLA-071)
 *
 * Covers:
 *   - CRUD alerts (getAlerts, markAlertAsRead, markAllAlertsAsRead, deleteAlert, clearReadAlerts)
 *   - CRUD alert rules (getAlertRules, saveAlertRule, toggleAlertRule, deleteAlertRule)
 *   - evaluateSmartAlerts (multi-domain smart engine: portfolio rules, dormant cash, fiscal deadlines, goal achievement, unclaimed quests, and deduplication)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Alert, AlertRule, Position, FinancialGoal, GamificationQuest } from '../../../types';

vi.mock('../../../src/services/db', () => {
  let inMemoryAlerts: Alert[] = [];
  let inMemoryRules: AlertRule[] = [];

  return {
    db: {
      getAlerts: vi.fn(() => [...inMemoryAlerts]),
      saveAlerts: vi.fn((alerts: Alert[]) => {
        inMemoryAlerts = [...alerts];
      }),
      getAlertRules: vi.fn(() => [...inMemoryRules]),
      saveAlertRules: vi.fn((rules: AlertRule[]) => {
        inMemoryRules = [...rules];
      }),
      // Helper for test setup
      __setMockState: (alerts: Alert[], rules: AlertRule[]) => {
        inMemoryAlerts = [...alerts];
        inMemoryRules = [...rules];
      },
    },
    delay: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../../src/services/fiscal/taxCalendarService', () => ({
  getEffectiveCalendar: vi.fn().mockReturnValue({}),
  getUserFiscalDeadline: vi.fn().mockReturnValue({
    departmentName: 'Paris (75)',
    userDeadline: '05/06/2026',
    daysRemaining: 14,
    userZone: 'zone_3',
  }),
}));

import { alertService } from '../../../src/services/alertService';
import { db } from '../../../src/services/db';

const mockDb = db as unknown as {
  getAlerts: ReturnType<typeof vi.fn>;
  saveAlerts: ReturnType<typeof vi.fn>;
  getAlertRules: ReturnType<typeof vi.fn>;
  saveAlertRules: ReturnType<typeof vi.fn>;
  __setMockState: (alerts: Alert[], rules: AlertRule[]) => void;
};

describe('alertService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.__setMockState([], []);
  });

  describe('Alert CRUD operations', () => {
    it('retrieves alerts from db', async () => {
      const sample: Alert[] = [
        {
          id: 'a1',
          type: 'warning',
          category: 'portfolio',
          title: 'Alerte Test',
          message: 'Message test',
          date: '2026-05-01T10:00:00.000Z',
          read: false,
        },
      ];
      mockDb.__setMockState(sample, []);

      const result = await alertService.getAlerts();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1');
    });

    it('marks a single alert as read', async () => {
      const sample: Alert[] = [
        { id: 'a1', type: 'info', title: 'T1', message: 'M1', date: '2026-05-01T10:00:00.000Z', read: false },
        { id: 'a2', type: 'info', title: 'T2', message: 'M2', date: '2026-05-01T10:00:00.000Z', read: false },
      ];
      mockDb.__setMockState(sample, []);

      const updated = await alertService.markAlertAsRead('a1');
      expect(updated.find((a) => a.id === 'a1')?.read).toBe(true);
      expect(updated.find((a) => a.id === 'a2')?.read).toBe(false);
    });

    it('marks all alerts as read', async () => {
      const sample: Alert[] = [
        { id: 'a1', type: 'info', title: 'T1', message: 'M1', date: '2026-05-01T10:00:00.000Z', read: false },
        { id: 'a2', type: 'info', title: 'T2', message: 'M2', date: '2026-05-01T10:00:00.000Z', read: false },
      ];
      mockDb.__setMockState(sample, []);

      const updated = await alertService.markAllAlertsAsRead();
      expect(updated.every((a) => a.read)).toBe(true);
    });

    it('deletes an alert by ID', async () => {
      const sample: Alert[] = [
        { id: 'a1', type: 'info', title: 'T1', message: 'M1', date: '2026-05-01T10:00:00.000Z', read: false },
        { id: 'a2', type: 'info', title: 'T2', message: 'M2', date: '2026-05-01T10:00:00.000Z', read: false },
      ];
      mockDb.__setMockState(sample, []);

      const updated = await alertService.deleteAlert('a1');
      expect(updated).toHaveLength(1);
      expect(updated[0].id).toBe('a2');
    });

    it('clears all read alerts', async () => {
      const sample: Alert[] = [
        { id: 'a1', type: 'info', title: 'T1', message: 'M1', date: '2026-05-01T10:00:00.000Z', read: true },
        { id: 'a2', type: 'info', title: 'T2', message: 'M2', date: '2026-05-01T10:00:00.000Z', read: false },
      ];
      mockDb.__setMockState(sample, []);

      const updated = await alertService.clearReadAlerts();
      expect(updated).toHaveLength(1);
      expect(updated[0].id).toBe('a2');
    });
  });

  describe('Alert Rules CRUD operations', () => {
    it('creates a new alert rule', async () => {
      const saved = await alertService.saveAlertRule({
        name: 'BTC > $65,000',
        metric: 'price_above',
        symbol: 'BTC',
        threshold: 65000,
      });

      expect(saved.id).toBeDefined();
      expect(saved.name).toBe('BTC > $65,000');
      expect(saved.enabled).toBe(true);

      const rules = await alertService.getAlertRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].threshold).toBe(65000);
    });

    it('updates an existing alert rule', async () => {
      const initial = await alertService.saveAlertRule({
        name: 'BTC > $65,000',
        metric: 'price_above',
        symbol: 'BTC',
        threshold: 65000,
      });

      await alertService.saveAlertRule({
        id: initial.id,
        name: 'BTC > $70,000',
        metric: 'price_above',
        symbol: 'BTC',
        threshold: 70000,
      });

      const rules = await alertService.getAlertRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe('BTC > $70,000');
      expect(rules[0].threshold).toBe(70000);
    });

    it('toggles rule enabled state', async () => {
      const initial = await alertService.saveAlertRule({
        name: 'AAPL < 150',
        metric: 'price_below',
        symbol: 'AAPL',
        threshold: 150,
      });

      const updated1 = await alertService.toggleAlertRule(initial.id);
      expect(updated1.find((r) => r.id === initial.id)?.enabled).toBe(false);

      const updated2 = await alertService.toggleAlertRule(initial.id);
      expect(updated2.find((r) => r.id === initial.id)?.enabled).toBe(true);
    });

    it('deletes an alert rule', async () => {
      const r1 = await alertService.saveAlertRule({
        name: 'Rule 1',
        metric: 'cash_ratio_above',
        threshold: 20,
      });
      await alertService.saveAlertRule({
        name: 'Rule 2',
        metric: 'price_above',
        symbol: 'ETH',
        threshold: 4000,
      });

      const remaining = await alertService.deleteAlertRule(r1.id);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].name).toBe('Rule 2');
    });
  });

  describe('evaluateSmartAlerts (Smart Multi-Domain Engine)', () => {
    const mockPositions: Position[] = [
      {
        id: 'p1',
        symbol: 'BTC',
        instrument: 'Bitcoin',
        type: 'Crypto',
        quantity: 1,
        avgCost: 40000,
        lastPrice: 65000,
        marketValue: 65000,
        unrealizedPL: 25000,
        unrealizedPLPercent: 62.5,
        currency: 'EUR',
      },
      {
        id: 'p2',
        symbol: 'EUR',
        instrument: 'Cash Reserve',
        type: 'Cash',
        quantity: 35000,
        avgCost: 1,
        lastPrice: 1,
        marketValue: 35000,
        unrealizedPL: 0,
        unrealizedPLPercent: 0,
        currency: 'EUR',
      },
    ];

    it('evaluates custom portfolio price and PL rules', async () => {
      const rule: AlertRule = {
        id: 'rule-btc',
        name: 'BTC Target Reached',
        metric: 'price_above',
        symbol: 'BTC',
        threshold: 60000,
        enabled: true,
        createdAt: '2026-05-01T00:00:00.000Z',
      };
      mockDb.__setMockState([], [rule]);

      const res = await alertService.evaluateSmartAlerts({
        positions: mockPositions,
        totalPortfolioValue: 100000,
      });

      expect(res.newAlerts.some((a) => a.title === 'BTC Target Reached')).toBe(true);
    });

    it('triggers dormant cash alert when cash ratio exceeds threshold', async () => {
      // 35,000 cash out of 100,000 = 35% > default 25%
      mockDb.__setMockState([], []);

      const res = await alertService.evaluateSmartAlerts({
        positions: mockPositions,
        totalPortfolioValue: 100000,
      });

      const cashAlert = res.newAlerts.find((a) => a.category === 'portfolio' && a.title.includes('Liquidités'));
      expect(Boolean(cashAlert)).toBe(true);
      expect(cashAlert?.message).toContain('35.0%');
    });

    it('triggers fiscal deadline alert when within 30 days', async () => {
      mockDb.__setMockState([], []);

      const res = await alertService.evaluateSmartAlerts({
        positions: mockPositions,
        totalPortfolioValue: 100000,
      });

      const fiscalAlert = res.newAlerts.find((a) => a.category === 'fiscal');
      expect(Boolean(fiscalAlert)).toBe(true);
      expect(fiscalAlert?.title).toContain('Échéance fiscale');
    });

    it('triggers goal completion alert when goal reaches 100%', async () => {
      mockDb.__setMockState([], []);
      const goals: FinancialGoal[] = [
        {
          id: 'g1',
          title: 'Fonds d’urgence',
          targetAmount: 20000,
          currentAmount: 22000,
          isPinned: true,
          iconType: 'emergency',
          color: 'blue',
          method: 'manual',
        },
      ];

      const res = await alertService.evaluateSmartAlerts({
        positions: mockPositions,
        totalPortfolioValue: 100000,
        goals,
      });

      const goalAlert = res.newAlerts.find((a) => a.category === 'goals');
      expect(Boolean(goalAlert)).toBe(true);
      expect(goalAlert?.title).toContain('Objectif atteint à 100%');
    });

    it('triggers unclaimed quest reward alert', async () => {
      mockDb.__setMockState([], []);
      const quests: GamificationQuest[] = [
        {
          id: 'q1',
          titleKey: 'quests.first_trade.title',
          descriptionKey: 'quests.first_trade.desc',
          rewardXp: 50,
          target: 1,
          progress: 1,
          frequency: 'monthly',
          completed: true,
          claimed: false,
        },
      ];

      const res = await alertService.evaluateSmartAlerts({
        positions: mockPositions,
        totalPortfolioValue: 100000,
        quests,
      });

      const questAlert = res.newAlerts.find((a) => a.dedupKey === 'smart-quest-unclaimed-q1');
      expect(Boolean(questAlert)).toBe(true);
      expect(questAlert?.actionLabelKey).toBe('gamification:quests.claimReward');
      expect(questAlert?.actionUrl).toBe('/progress?tab=quests');
    });

    it('deduplicates alerts and avoids inserting existing dedupKey', async () => {
      const existing: Alert = {
        id: 'existing-cash',
        type: 'warning',
        category: 'portfolio',
        title: 'Liquidités dormantes élevées',
        message: 'Already warned',
        date: new Date().toISOString(),
        read: false,
        dedupKey: `smart-dormant-cash-${new Date().toISOString().slice(0, 7)}`,
      };
      mockDb.__setMockState([existing], []);

      const res = await alertService.evaluateSmartAlerts({
        positions: mockPositions,
        totalPortfolioValue: 100000,
      });

      // Cash alert should NOT be in newAlerts because dedupKey already exists in db
      const duplicateCashAlert = res.newAlerts.find((a) => a.dedupKey === existing.dedupKey);
      expect(duplicateCashAlert).toBeUndefined();
    });

    it('respects notification category flags when category is disabled', async () => {
      mockDb.__setMockState([], []);

      const res = await alertService.evaluateSmartAlerts({
        positions: mockPositions,
        totalPortfolioValue: 100000,
        preferences: {
          theme: 'dark',
          currency: 'EUR',
          notifications: true,
          notificationPreferences: {
            masterEnabled: true,
            inAppToasts: true,
            categories: {
              portfolio: false, // Disabled!
              fiscal: false,    // Disabled!
              goals: false,     // Disabled!
              security: false,
              system: false,
            },
            dormantCashThresholdPercent: 25,
            volatilityThresholdPercent: 10,
          },
        },
      });

      expect(res.newAlerts).toHaveLength(0);
    });
  });
});
