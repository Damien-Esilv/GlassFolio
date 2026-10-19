/**
 * AI Notification & Alert Tools for GlassFolio Assistant & MCP (TGLA-073).
 *
 * Implements:
 *   - list_notifications (read-only): inspect all in-app notifications and alerts.
 *   - manage_notifications (mutation, requiresConfirmation: true): mark read or delete alerts.
 *   - list_alert_rules (read-only): inspect active custom rules.
 *   - create_alert_rule (mutation, requiresConfirmation: true): create a new threshold rule.
 */

import { AIToolDefinition } from '../types';
import { alertService } from '../../alertService';
import { Alert, AlertRule, AlertRuleMetric, NotificationCategory } from '../../../types/domain';

export const listNotificationsTool: AIToolDefinition<
  {
    category?: NotificationCategory;
    unreadOnly?: boolean;
    limit?: number;
  },
  {
    total: number;
    unreadCount: number;
    notifications: Alert[];
  }
> = {
  name: 'list_notifications',
  description:
    'List all notifications and alerts with optional category filter (portfolio, fiscal, goals, security, system), read filter, and limit.',
  requiresConfirmation: false,
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['portfolio', 'fiscal', 'goals', 'security', 'system'],
        description: 'Optional category to filter notifications by.',
      },
      unreadOnly: {
        type: 'boolean',
        description: 'When true, only returns unread notifications. Defaults to false.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of notifications to return. Defaults to 20.',
      },
    },
  },
  execute: async (params) => {
    const allAlerts = await alertService.getAlerts();
    const unreadCount = allAlerts.filter((a) => !a.read).length;

    let filtered = allAlerts;
    if (params.category) {
      filtered = filtered.filter((a) => a.category === params.category);
    }
    if (params.unreadOnly) {
      filtered = filtered.filter((a) => !a.read);
    }

    const limit = params.limit ?? 20;
    const paginated = filtered.slice(0, limit);

    return {
      total: filtered.length,
      unreadCount,
      notifications: paginated,
    };
  },
};

export const manageNotificationsTool: AIToolDefinition<
  {
    action: 'mark_read' | 'mark_all_read' | 'delete' | 'clear_read';
    alertId?: string;
  },
  {
    success: boolean;
    action: string;
    remainingCount: number;
    unreadCount: number;
  }
> = {
  name: 'manage_notifications',
  description:
    'Perform management actions on notifications (mark single as read, mark all read, delete single, or clear all read). Requires user confirmation.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['mark_read', 'mark_all_read', 'delete', 'clear_read'],
        description: 'Action to perform on notifications.',
      },
      alertId: {
        type: 'string',
        description: 'Notification ID required when action is mark_read or delete.',
      },
    },
  },
  execute: async (params) => {
    let updatedAlerts: Alert[];

    switch (params.action) {
      case 'mark_read':
        if (!params.alertId) {
          throw new Error('alertId is required for mark_read action');
        }
        updatedAlerts = await alertService.markAlertAsRead(params.alertId);
        break;

      case 'mark_all_read':
        updatedAlerts = await alertService.markAllAlertsAsRead();
        break;

      case 'delete':
        if (!params.alertId) {
          throw new Error('alertId is required for delete action');
        }
        updatedAlerts = await alertService.deleteAlert(params.alertId);
        break;

      case 'clear_read':
        updatedAlerts = await alertService.clearReadAlerts();
        break;

      default:
        throw new Error(`Unsupported action: ${(params as { action: string }).action}`);
    }

    return {
      success: true,
      action: params.action,
      remainingCount: updatedAlerts.length,
      unreadCount: updatedAlerts.filter((a) => !a.read).length,
    };
  },
};

export const listAlertRulesTool: AIToolDefinition<
  Record<string, never>,
  {
    count: number;
    rules: AlertRule[];
  }
> = {
  name: 'list_alert_rules',
  description:
    'List all custom user-defined alert rules (price threshold, P&L %, cash ratio) with their trigger history and enabled state.',
  requiresConfirmation: false,
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    const rules = await alertService.getAlertRules();
    return {
      count: rules.length,
      rules,
    };
  },
};

export const createAlertRuleTool: AIToolDefinition<
  {
    name: string;
    metric: AlertRuleMetric;
    threshold: number;
    symbol?: string;
  },
  {
    success: boolean;
    rule: AlertRule;
  }
> = {
  name: 'create_alert_rule',
  description:
    'Create a new custom alert rule for real-time portfolio monitoring (e.g. price threshold, P&L %, cash ratio). Requires user confirmation.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    required: ['name', 'metric', 'threshold'],
    properties: {
      name: {
        type: 'string',
        description: 'Human-readable rule name (e.g. "BTC > $70,000" or "Dormant Cash > 20%").',
      },
      metric: {
        type: 'string',
        enum: [
          'price_above',
          'price_below',
          'pl_percent_above',
          'pl_percent_below',
          'cash_ratio_above',
        ],
        description: 'Metric to monitor against threshold.',
      },
      threshold: {
        type: 'number',
        description: 'Numerical threshold trigger value.',
      },
      symbol: {
        type: 'string',
        description: 'Asset symbol (e.g. "BTC", "AAPL") required for price and P&L metrics.',
      },
    },
  },
  execute: async (params) => {
    const saved = await alertService.saveAlertRule({
      name: params.name,
      metric: params.metric,
      threshold: params.threshold,
      symbol: params.symbol,
      enabled: true,
    });

    return {
      success: true,
      rule: saved,
    };
  },
};
