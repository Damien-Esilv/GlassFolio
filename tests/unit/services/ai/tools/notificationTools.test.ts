/**
 * Unit Tests — notificationTools.ts (TGLA-073)
 *
 * Covers:
 *   - Metadata & human-in-the-loop verification (AGENTS.md compliance)
 *   - aiToolRegistry registration & lookup
 *   - list_notifications execution with filtering (category, unreadOnly, limit)
 *   - manage_notifications execution (mark_read, mark_all_read, delete, clear_read) and errors
 *   - list_alert_rules & create_alert_rule execution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listNotificationsTool,
  manageNotificationsTool,
  listAlertRulesTool,
  createAlertRuleTool,
} from '../../../../../src/services/ai/tools/notificationTools';
import { aiToolRegistry } from '../../../../../src/services/ai/aiToolRegistry';
import '../../../../../src/services/ai/tools';
import { alertService } from '../../../../../src/services/alertService';
import type { Alert, AlertRule } from '../../../../../src/types/domain';

vi.mock('../../../../../src/services/alertService', () => ({
  alertService: {
    getAlerts: vi.fn(),
    markAlertAsRead: vi.fn(),
    markAllAlertsAsRead: vi.fn(),
    deleteAlert: vi.fn(),
    clearReadAlerts: vi.fn(),
    getAlertRules: vi.fn(),
    saveAlertRule: vi.fn(),
  },
}));

const mockAlertService = alertService as unknown as {
  getAlerts: ReturnType<typeof vi.fn>;
  markAlertAsRead: ReturnType<typeof vi.fn>;
  markAllAlertsAsRead: ReturnType<typeof vi.fn>;
  deleteAlert: ReturnType<typeof vi.fn>;
  clearReadAlerts: ReturnType<typeof vi.fn>;
  getAlertRules: ReturnType<typeof vi.fn>;
  saveAlertRule: ReturnType<typeof vi.fn>;
};

describe('notificationTools (AI & MCP)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AGENTS.md Compliance & Security Metadata', () => {
    it('declares exact human-in-the-loop confirmation requirement for mutations', () => {
      // Read-only tools must not require confirmation
      expect(listNotificationsTool.requiresConfirmation).toBe(false);
      expect(listAlertRulesTool.requiresConfirmation).toBe(false);

      // Mutating tools altering financial/notification data MUST require explicit confirmation
      expect(manageNotificationsTool.requiresConfirmation).toBe(true);
      expect(createAlertRuleTool.requiresConfirmation).toBe(true);
    });

    it('is registered and discoverable in aiToolRegistry', () => {
      expect(aiToolRegistry.getTool('list_notifications')).toBeDefined();
      expect(aiToolRegistry.getTool('manage_notifications')).toBeDefined();
      expect(aiToolRegistry.getTool('list_alert_rules')).toBeDefined();
      expect(aiToolRegistry.getTool('create_alert_rule')).toBeDefined();
    });
  });

  describe('list_notifications execution', () => {
    const sampleAlerts: Alert[] = [
      {
        id: 'a1',
        type: 'warning',
        category: 'fiscal',
        title: 'Échéance fiscale',
        message: 'Dans 10 jours',
        date: '2026-05-01',
        read: false,
      },
      {
        id: 'a2',
        type: 'info',
        category: 'portfolio',
        title: 'Dividende AAPL',
        message: '+45.20 €',
        date: '2026-05-02',
        read: true,
      },
      {
        id: 'a3',
        type: 'info',
        category: 'portfolio',
        title: 'Dividende MSFT',
        message: '+12.50 €',
        date: '2026-05-03',
        read: false,
      },
    ];

    it('lists all notifications with unread count', async () => {
      mockAlertService.getAlerts.mockResolvedValueOnce(sampleAlerts);

      const res = await listNotificationsTool.execute({}, {});
      expect(res.total).toBe(3);
      expect(res.unreadCount).toBe(2);
      expect(res.notifications).toHaveLength(3);
    });

    it('filters by category and unreadOnly', async () => {
      mockAlertService.getAlerts.mockResolvedValueOnce(sampleAlerts);

      const res = await listNotificationsTool.execute(
        { category: 'portfolio', unreadOnly: true },
        {}
      );
      expect(res.total).toBe(1);
      expect(res.unreadCount).toBe(2); // total unread in whole system
      expect(res.notifications[0].id).toBe('a3');
    });

    it('respects custom limit', async () => {
      mockAlertService.getAlerts.mockResolvedValueOnce(sampleAlerts);

      const res = await listNotificationsTool.execute({ limit: 2 }, {});
      expect(res.notifications).toHaveLength(2);
    });
  });

  describe('manage_notifications execution', () => {
    it('executes mark_read action', async () => {
      mockAlertService.markAlertAsRead.mockResolvedValueOnce([
        { id: 'a1', type: 'info', title: 'T', message: 'M', date: '2026-05-01', read: true },
      ]);

      const res = await manageNotificationsTool.execute(
        { action: 'mark_read', alertId: 'a1' },
        {}
      );
      expect(mockAlertService.markAlertAsRead).toHaveBeenCalledWith('a1');
      expect(res.success).toBe(true);
      expect(res.unreadCount).toBe(0);
    });

    it('throws error when alertId is missing for mark_read or delete', async () => {
      await expect(
        manageNotificationsTool.execute({ action: 'mark_read' }, {})
      ).rejects.toThrow('alertId is required');

      await expect(
        manageNotificationsTool.execute({ action: 'delete' }, {})
      ).rejects.toThrow('alertId is required');
    });

    it('executes mark_all_read action', async () => {
      mockAlertService.markAllAlertsAsRead.mockResolvedValueOnce([
        { id: 'a1', type: 'info', title: 'T', message: 'M', date: '2026-05-01', read: true },
        { id: 'a2', type: 'info', title: 'T', message: 'M', date: '2026-05-01', read: true },
      ]);

      const res = await manageNotificationsTool.execute({ action: 'mark_all_read' }, {});
      expect(mockAlertService.markAllAlertsAsRead).toHaveBeenCalled();
      expect(res.success).toBe(true);
      expect(res.unreadCount).toBe(0);
    });

    it('executes clear_read action', async () => {
      mockAlertService.clearReadAlerts.mockResolvedValueOnce([
        { id: 'a1', type: 'info', title: 'T', message: 'M', date: '2026-05-01', read: false },
      ]);

      const res = await manageNotificationsTool.execute({ action: 'clear_read' }, {});
      expect(mockAlertService.clearReadAlerts).toHaveBeenCalled();
      expect(res.remainingCount).toBe(1);
    });
  });

  describe('list_alert_rules & create_alert_rule execution', () => {
    it('list_alert_rules returns custom rules', async () => {
      const mockRules: AlertRule[] = [
        {
          id: 'r1',
          name: 'BTC High',
          metric: 'price_above',
          symbol: 'BTC',
          threshold: 70000,
          enabled: true,
          createdAt: '2026-05-01',
        },
      ];
      mockAlertService.getAlertRules.mockResolvedValueOnce(mockRules);

      const res = await listAlertRulesTool.execute({}, {});
      expect(res.count).toBe(1);
      expect(res.rules[0].name).toBe('BTC High');
    });

    it('create_alert_rule saves new rule', async () => {
      const createdRule: AlertRule = {
        id: 'r-new',
        name: 'AAPL Target',
        metric: 'price_above',
        symbol: 'AAPL',
        threshold: 200,
        enabled: true,
        createdAt: '2026-05-01',
      };
      mockAlertService.saveAlertRule.mockResolvedValueOnce(createdRule);

      const res = await createAlertRuleTool.execute(
        {
          name: 'AAPL Target',
          metric: 'price_above',
          threshold: 200,
          symbol: 'AAPL',
        },
        {}
      );

      expect(res.success).toBe(true);
      expect(res.rule.symbol).toBe('AAPL');
      expect(mockAlertService.saveAlertRule).toHaveBeenCalledWith({
        name: 'AAPL Target',
        metric: 'price_above',
        threshold: 200,
        symbol: 'AAPL',
        enabled: true,
      });
    });
  });
});
