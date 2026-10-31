import { Alert, AlertRule, AlertRuleMetric, NotificationCategory, UserPreferences, Position, FinancialGoal, GamificationQuest } from '../types/domain';
import { db, delay } from './db';
import { getEffectiveCalendar, getUserFiscalDeadline } from './fiscal/taxCalendarService';

function generateId(prefix: string = 'alrt'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(8);
  globalThis.crypto?.getRandomValues?.(bytes);
  return `${prefix}-${Date.now().toString(36)}-${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Dismissed alerts with a dedupKey stay as hidden tombstones, so the engine never re-creates them. */
const MAX_TOMBSTONES = 500;

const visibleAlerts = (alerts: Alert[]): Alert[] => alerts.filter((a) => !a.archived);

/** Hides `alerts` matching `shouldDismiss`: kept as a tombstone when the engine could re-create them. */
function dismissAlerts(alerts: Alert[], shouldDismiss: (a: Alert) => boolean): Alert[] {
  const kept = alerts.flatMap((a) => {
    if (!shouldDismiss(a)) return [a];
    return a.dedupKey ? [{ ...a, read: true, archived: true }] : [];
  });
  const tombstones = kept.filter((a) => a.archived);
  if (tombstones.length <= MAX_TOMBSTONES) return kept;
  const oldest = new Set(
    [...tombstones].sort((a, b) => a.date.localeCompare(b.date)).slice(0, tombstones.length - MAX_TOMBSTONES).map((a) => a.id)
  );
  return kept.filter((a) => !oldest.has(a.id));
}

export interface EvaluateAlertsParams {
  positions: Position[];
  totalPortfolioValue: number;
  taxZone?: string;
  preferences?: UserPreferences;
  goals?: FinancialGoal[];
  quests?: GamificationQuest[];
}

export const alertService = {
  /**
   * Retrieves all alerts with simulated latency.
   */
  getAlerts: async (): Promise<Alert[]> => {
    await delay(100);
    return visibleAlerts(db.getAlerts());
  },

  /**
   * Persists alerts array.
   */
  saveAlerts: async (alerts: Alert[]): Promise<void> => {
    await delay(100);
    db.saveAlerts(alerts);
  },

  /**
   * Marks a single alert as read.
   */
  markAlertAsRead: async (alertId: string): Promise<Alert[]> => {
    await delay(80);
    const alerts = db.getAlerts();
    const updated = alerts.map((a) => (a.id === alertId ? { ...a, read: true } : a));
    db.saveAlerts(updated);
    return visibleAlerts(updated);
  },

  /**
   * Marks all alerts as read.
   */
  markAllAlertsAsRead: async (): Promise<Alert[]> => {
    await delay(80);
    const alerts = db.getAlerts();
    const updated = alerts.map((a) => ({ ...a, read: true }));
    db.saveAlerts(updated);
    return visibleAlerts(updated);
  },

  /**
   * Deletes an alert by ID.
   */
  deleteAlert: async (alertId: string): Promise<Alert[]> => {
    await delay(80);
    const updated = dismissAlerts(db.getAlerts(), (a) => a.id === alertId);
    db.saveAlerts(updated);
    return visibleAlerts(updated);
  },

  /**
   * Clears all read alerts.
   */
  clearReadAlerts: async (): Promise<Alert[]> => {
    await delay(80);
    const updated = dismissAlerts(db.getAlerts(), (a) => Boolean(a.read) && !a.archived);
    db.saveAlerts(updated);
    return visibleAlerts(updated);
  },

  /**
   * Retrieves all custom alert rules.
   */
  getAlertRules: async (): Promise<AlertRule[]> => {
    await delay(100);
    return db.getAlertRules();
  },

  /**
   * Saves or creates a custom alert rule.
   */
  saveAlertRule: async (
    rule: Partial<AlertRule> & { name: string; metric: AlertRuleMetric; threshold: number }
  ): Promise<AlertRule> => {
    await delay(120);
    const rules = db.getAlertRules();
    const now = new Date().toISOString();

    if (rule.id) {
      const existingIdx = rules.findIndex((r) => r.id === rule.id);
      if (existingIdx !== -1) {
        const updatedRule: AlertRule = {
          ...rules[existingIdx],
          ...rule,
          id: rule.id,
        };
        rules[existingIdx] = updatedRule;
        db.saveAlertRules(rules);
        return updatedRule;
      }
    }

    const newRule: AlertRule = {
      id: rule.id || generateId('rule'),
      name: rule.name,
      metric: rule.metric,
      symbol: rule.symbol ? rule.symbol.toUpperCase().trim() : undefined,
      threshold: rule.threshold,
      enabled: rule.enabled ?? true,
      createdAt: now,
      lastTriggeredAt: rule.lastTriggeredAt,
    };

    const nextRules = [newRule, ...rules];
    db.saveAlertRules(nextRules);
    return newRule;
  },

  /**
   * Toggles the enabled state of an alert rule.
   */
  toggleAlertRule: async (id: string): Promise<AlertRule[]> => {
    await delay(80);
    const rules = db.getAlertRules();
    const updated = rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    db.saveAlertRules(updated);
    return updated;
  },

  /**
   * Deletes an alert rule by ID.
   */
  deleteAlertRule: async (id: string): Promise<AlertRule[]> => {
    await delay(80);
    const rules = db.getAlertRules();
    const updated = rules.filter((r) => r.id !== id);
    db.saveAlertRules(updated);
    return updated;
  },

  /**
   * Evaluates smart rules & custom user rules across portfolio, tax, goals, and quests.
   * Performs idempotent deduplication via dedupKey.
   */
  evaluateSmartAlerts: async (
    params: EvaluateAlertsParams
  ): Promise<{ newAlerts: Alert[]; allAlerts: Alert[] }> => {
    const { positions, totalPortfolioValue, preferences, goals, quests } = params;

    // Respect master notification switch
    const notifPrefs = preferences?.notificationPreferences;
    const isMasterEnabled = preferences?.notifications ?? true;
    if (!isMasterEnabled || notifPrefs?.masterEnabled === false) {
      const current = db.getAlerts();
      return { newAlerts: [], allAlerts: visibleAlerts(current) };
    }

    const categoryFlags = {
      portfolio: notifPrefs?.categories?.portfolio ?? true,
      fiscal: notifPrefs?.categories?.fiscal ?? true,
      goals: notifPrefs?.categories?.goals ?? true,
      security: notifPrefs?.categories?.security ?? true,
    };

    const dormantCashThreshold = notifPrefs?.dormantCashThresholdPercent ?? 25;
    const baseCurrency = preferences?.currency || 'EUR';

    const existingAlerts = db.getAlerts();
    const existingDedupKeys = new Set(
      existingAlerts.map((a) => a.dedupKey).filter((k): k is string => Boolean(k))
    );

    const generatedCandidates: Alert[] = [];
    const nowIso = new Date().toISOString();

    // 1. Portfolio Custom Rules Evaluation
    if (categoryFlags.portfolio) {
      const activeRules = db.getAlertRules().filter((r) => r.enabled);
      const triggeredRuleIds: string[] = [];

      for (const rule of activeRules) {
        let isTriggered = false;
        let alertTitle = rule.name;
        let alertMessage = '';
        let messageKey = '';
        let messageParams: Record<string, string | number> = {};
        let targetUrl = '/positions';

        if (rule.metric === 'cash_ratio_above') {
          const cashPos = positions.filter((p) => p.type === 'Cash');
          const cashValue = cashPos.reduce((sum, p) => sum + (p.marketValue || 0), 0);
          const ratio = totalPortfolioValue > 0 ? (cashValue / totalPortfolioValue) * 100 : 0;
          if (ratio >= rule.threshold) {
            isTriggered = true;
            alertTitle = rule.name;
            alertMessage = `Cash share (${ratio.toFixed(1)}%) is above your ${rule.threshold}% threshold.`;
            messageKey = 'notifications:engine.cashRatioAbove';
            messageParams = { ratio, threshold: rule.threshold };
            targetUrl = '/portfolio/summary';
          }
        } else if (rule.symbol) {
          const pos = positions.find((p) => p.symbol.toUpperCase() === rule.symbol!.toUpperCase());
          if (pos) {
            if (rule.metric === 'price_above' && pos.lastPrice >= rule.threshold) {
              isTriggered = true;
              alertMessage = `${pos.symbol} price (${pos.lastPrice.toFixed(2)}) reached your upper threshold of ${rule.threshold}.`;
              messageKey = 'notifications:engine.priceAbove';
            } else if (rule.metric === 'price_below' && pos.lastPrice <= rule.threshold) {
              isTriggered = true;
              alertMessage = `${pos.symbol} price (${pos.lastPrice.toFixed(2)}) fell below your lower threshold of ${rule.threshold}.`;
              messageKey = 'notifications:engine.priceBelow';
            } else if (rule.metric === 'pl_percent_above' && pos.unrealizedPLPercent >= rule.threshold) {
              isTriggered = true;
              alertMessage = `${pos.symbol} unrealised gain (+${pos.unrealizedPLPercent.toFixed(1)}%) is above ${rule.threshold}%.`;
              messageKey = 'notifications:engine.plAbove';
            } else if (rule.metric === 'pl_percent_below' && pos.unrealizedPLPercent <= rule.threshold) {
              isTriggered = true;
              alertMessage = `${pos.symbol} unrealised result (${pos.unrealizedPLPercent.toFixed(1)}%) is below ${rule.threshold}%.`;
              messageKey = 'notifications:engine.plBelow';
            }
            messageParams = { symbol: pos.symbol, price: pos.lastPrice, percent: pos.unrealizedPLPercent, threshold: rule.threshold };
          }
        }

        if (isTriggered) {
          triggeredRuleIds.push(rule.id);
          const dedupKey = `rule-${rule.id}-${rule.lastTriggeredAt ? rule.lastTriggeredAt.slice(0, 10) : nowIso.slice(0, 10)}`;
          generatedCandidates.push({
            id: generateId('rule-alert'),
            type: rule.metric.includes('below') ? 'warning' : 'info',
            category: 'portfolio',
            title: alertTitle,
            message: alertMessage,
            messageKey: messageKey || undefined,
            params: messageParams,
            date: nowIso,
            read: false,
            dedupKey,
            actionUrl: targetUrl,
            actionLabelKey: 'common:actions.review',
          });
        }
      }

      // Update lastTriggeredAt on rules
      if (triggeredRuleIds.length > 0) {
        const allRules = db.getAlertRules();
        const updatedRules = allRules.map((r) =>
          triggeredRuleIds.includes(r.id) ? { ...r, lastTriggeredAt: nowIso } : r
        );
        db.saveAlertRules(updatedRules);
      }

      // Built-in Smart Dormant Cash Check
      const cashPositions = positions.filter((p) => p.type === 'Cash');
      const totalCash = cashPositions.reduce((sum, p) => sum + (p.marketValue || 0), 0);
      const cashPct = totalPortfolioValue > 0 ? (totalCash / totalPortfolioValue) * 100 : 0;
      if (cashPct >= dormantCashThreshold && totalPortfolioValue > 1000) {
        generatedCandidates.push({
          id: generateId('cash-alert'),
          type: 'warning',
          category: 'portfolio',
          title: 'High idle cash',
          message: `${cashPct.toFixed(1)}% of your wealth (${Math.round(totalCash)} ${baseCurrency}) is not invested.`,
          titleKey: 'notifications:engine.dormantCashTitle',
          messageKey: 'notifications:engine.dormantCash',
          params: { percent: cashPct, amount: Math.round(totalCash), currency: baseCurrency },
          date: nowIso,
          read: false,
          dedupKey: `smart-dormant-cash-${nowIso.slice(0, 7)}`,
          actionUrl: '/portfolio/summary',
          actionLabelKey: 'common:actions.review',
        });
      }
    }

    // 2. Fiscal Smart Deadlines Check
    if (categoryFlags.fiscal) {
      const currentYear = new Date().getFullYear().toString();
      const calendar = getEffectiveCalendar(currentYear);
      const userDept = preferences?.fiscalProfile?.department || '75';
      const deadlineInfo = getUserFiscalDeadline(calendar, userDept);

      if (deadlineInfo.daysRemaining >= 0 && deadlineInfo.daysRemaining <= 30) {
        const urgency = deadlineInfo.daysRemaining <= 7 ? 'warning' : 'info';
        generatedCandidates.push({
          id: generateId('fiscal-alert'),
          type: urgency,
          category: 'fiscal',
          title: `Tax deadline: ${deadlineInfo.departmentName}`,
          message: `Online filing deadline ${deadlineInfo.userDeadline} (in ${deadlineInfo.daysRemaining} days).`,
          titleKey: 'notifications:engine.fiscalDeadlineTitle',
          messageKey: 'notifications:engine.fiscalDeadline',
          params: { department: deadlineInfo.departmentName, deadline: deadlineInfo.userDeadline, count: deadlineInfo.daysRemaining },
          date: nowIso,
          read: false,
          dedupKey: `smart-fiscal-${currentYear}-${deadlineInfo.userZone}`,
          actionUrl: '/tax/declaration',
          actionLabelKey: 'tax:deadlines.prepare',
        });
      }
    }

    // 3. Goals & Gamification Smart Checks
    if (categoryFlags.goals && goals) {
      for (const goal of goals) {
        const current = goal.currentAmount || 0;
        const target = goal.targetAmount || 1;
        const pct = (current / target) * 100;
        if (pct >= 100) {
          generatedCandidates.push({
            id: generateId('goal-alert'),
            type: 'info',
            category: 'goals',
            title: `Goal reached: ${goal.title}`,
            message: `You reached your goal of ${target} ${baseCurrency}.`,
            titleKey: 'notifications:engine.goalReachedTitle',
            messageKey: 'notifications:engine.goalReached',
            params: { goal: goal.title, target, currency: baseCurrency },
            date: nowIso,
            read: false,
            dedupKey: `smart-goal-reached-${goal.id}`,
            actionUrl: '/progress?tab=goals',
            actionLabelKey: 'common:actions.review',
          });
        }
      }
    }

    if (categoryFlags.goals && quests) {
      const unclaimedQuests = quests.filter((q) => q.completed && !q.claimed);
      for (const quest of unclaimedQuests) {
        generatedCandidates.push({
          id: generateId('quest-alert'),
          type: 'info',
          category: 'goals',
          title: 'Quest reward available',
          message: `Your quest is complete: claim your +${quest.rewardXp} XP.`,
          titleKey: 'notifications:engine.questRewardTitle',
          messageKey: 'notifications:engine.questReward',
          params: { xp: quest.rewardXp },
          date: nowIso,
          read: false,
          // One reminder per quest and period: next month's completion deserves its own
          dedupKey: `smart-quest-unclaimed-${quest.id}${quest.periodKey ? `-${quest.periodKey}` : ''}`,
          actionUrl: '/progress?tab=quests',
          actionLabelKey: 'gamification:quests.claimReward',
        });
      }
    }

    // Filter out candidates that already exist via dedupKey
    const trulyNewAlerts = generatedCandidates.filter(
      (c) => c.dedupKey && !existingDedupKeys.has(c.dedupKey)
    );

    if (trulyNewAlerts.length > 0) {
      const mergedAlerts = [...trulyNewAlerts, ...existingAlerts];
      db.saveAlerts(mergedAlerts);
      return { newAlerts: trulyNewAlerts, allAlerts: visibleAlerts(mergedAlerts) };
    }

    return { newAlerts: [], allAlerts: visibleAlerts(existingAlerts) };
  },
};
