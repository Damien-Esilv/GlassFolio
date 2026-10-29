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
    return db.getAlerts();
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
    return updated;
  },

  /**
   * Marks all alerts as read.
   */
  markAllAlertsAsRead: async (): Promise<Alert[]> => {
    await delay(80);
    const alerts = db.getAlerts();
    const updated = alerts.map((a) => ({ ...a, read: true }));
    db.saveAlerts(updated);
    return updated;
  },

  /**
   * Deletes an alert by ID.
   */
  deleteAlert: async (alertId: string): Promise<Alert[]> => {
    await delay(80);
    const alerts = db.getAlerts();
    const updated = alerts.filter((a) => a.id !== alertId);
    db.saveAlerts(updated);
    return updated;
  },

  /**
   * Clears all read alerts.
   */
  clearReadAlerts: async (): Promise<Alert[]> => {
    await delay(80);
    const alerts = db.getAlerts();
    const updated = alerts.filter((a) => !a.read);
    db.saveAlerts(updated);
    return updated;
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
      return { newAlerts: [], allAlerts: current };
    }

    const categoryFlags = {
      portfolio: notifPrefs?.categories?.portfolio ?? true,
      fiscal: notifPrefs?.categories?.fiscal ?? true,
      goals: notifPrefs?.categories?.goals ?? true,
      security: notifPrefs?.categories?.security ?? true,
    };

    const dormantCashThreshold = notifPrefs?.dormantCashThresholdPercent ?? 25;

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
        let targetUrl = '/positions';

        if (rule.metric === 'cash_ratio_above') {
          const cashPos = positions.filter((p) => p.type === 'Cash');
          const cashValue = cashPos.reduce((sum, p) => sum + (p.marketValue || 0), 0);
          const ratio = totalPortfolioValue > 0 ? (cashValue / totalPortfolioValue) * 100 : 0;
          if (ratio >= rule.threshold) {
            isTriggered = true;
            alertTitle = rule.name;
            alertMessage = `La part de liquidités (${ratio.toFixed(1)}%) dépasse votre seuil de ${rule.threshold}%.`;
            targetUrl = '/portfolio/summary';
          }
        } else if (rule.symbol) {
          const pos = positions.find((p) => p.symbol.toUpperCase() === rule.symbol!.toUpperCase());
          if (pos) {
            if (rule.metric === 'price_above' && pos.lastPrice >= rule.threshold) {
              isTriggered = true;
              alertMessage = `Le cours de ${pos.symbol} (${pos.lastPrice.toFixed(2)}) a atteint votre seuil haut de ${rule.threshold}.`;
            } else if (rule.metric === 'price_below' && pos.lastPrice <= rule.threshold) {
              isTriggered = true;
              alertMessage = `Le cours de ${pos.symbol} (${pos.lastPrice.toFixed(2)}) est passé sous votre seuil bas de ${rule.threshold}.`;
            } else if (rule.metric === 'pl_percent_above' && pos.unrealizedPLPercent >= rule.threshold) {
              isTriggered = true;
              alertMessage = `La plus-value latente de ${pos.symbol} (+${pos.unrealizedPLPercent.toFixed(1)}%) dépasse ${rule.threshold}%.`;
            } else if (rule.metric === 'pl_percent_below' && pos.unrealizedPLPercent <= rule.threshold) {
              isTriggered = true;
              alertMessage = `La moins-value latente de ${pos.symbol} (${pos.unrealizedPLPercent.toFixed(1)}%) est sous le seuil de ${rule.threshold}%.`;
            }
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
          title: 'Liquidités dormantes élevées',
          message: `${cashPct.toFixed(1)}% de votre patrimoine (${Math.round(totalCash).toLocaleString()} €) est non investi. Pensez à déployer selon votre allocation cible.`,
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
          title: `Échéance fiscale : ${deadlineInfo.departmentName}`,
          message: `Date limite de télédéclaration le ${deadlineInfo.userDeadline} (dans ${deadlineInfo.daysRemaining} jour${deadlineInfo.daysRemaining > 1 ? 's' : ''}).`,
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
            title: `Objectif atteint à 100% : ${goal.title}`,
            message: `Félicitations ! Vous avez atteint votre objectif patrimonial de ${target.toLocaleString()} €.`,
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
          title: 'Récompense de quête disponible',
          message: `Votre quête est complétée ! Réclamez vos +${quest.rewardXp} XP pour progresser.`,
          date: nowIso,
          read: false,
          dedupKey: `smart-quest-unclaimed-${quest.id}`,
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
      return { newAlerts: trulyNewAlerts, allAlerts: mergedAlerts };
    }

    return { newAlerts: [], allAlerts: existingAlerts };
  },
};
