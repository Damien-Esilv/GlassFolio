import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Transaction, Position, Alert, AlertRule, AlertRuleMetric, FinancialGoal, Achievement, AssetGroup, GamificationQuest } from '../types';
import { useAuth } from './AuthContext';
import { transactionService } from '../src/services/transactionService';
import { portfolioService } from '../src/services/portfolioService';
import { alertService } from '../src/services/alertService';
import { goalService } from '../src/services/goalService';
import { achievementService } from '../src/services/achievementService';
import { gamificationService } from '../src/services/gamificationService';
import { getLastPriceFetchTime, clearPriceCache } from '../src/services/priceService';
import { db } from '../src/services/db';
import CelebrationModal, { CelebrationData } from '../components/CelebrationModal';

interface DataContextType {
  transactions: Transaction[];
  positions: Position[];
  alerts: Alert[];
  unreadAlertsCount: number;
  alertRules: AlertRule[];
  activeToasts: Alert[];
  goals: FinancialGoal[];
  achievements: Achievement[];
  assetGroups: AssetGroup[];
  quests: GamificationQuest[];
  pinnedBadges: string[];
  isLoading: boolean;
  error: string | null;
  /** ISO timestamp of the last successful Yahoo Finance price fetch. Null if never fetched or offline. */
  lastPriceRefresh: string | null;
  /** Force-clears the price cache and triggers a fresh fetch on next data load. */
  forceRefreshPrices: () => Promise<void>;
  addTransactions: (newTxs: Transaction[]) => Promise<void>;
  saveGoal: (goal: FinancialGoal | Omit<FinancialGoal, 'id'>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  toggleGoalPin: (id: string) => Promise<void>;
  addAssetGroup: (group: AssetGroup) => Promise<void>;
  updateAssetGroup: (id: string, updates: Partial<AssetGroup>) => Promise<void>;
  deleteAssetGroup: (id: string) => Promise<void>;
  togglePinBadge: (badgeId: string) => Promise<void>;
  claimQuest: (questId: string) => Promise<void>;
  markAlertAsRead: (alertId: string) => Promise<void>;
  markAllAlertsAsRead: () => Promise<void>;
  deleteAlert: (alertId: string) => Promise<void>;
  clearReadAlerts: () => Promise<void>;
  saveAlertRule: (rule: Partial<AlertRule> & { name: string; metric: AlertRuleMetric; threshold: number }) => Promise<void>;
  toggleAlertRule: (id: string) => Promise<void>;
  deleteAlertRule: (id: string) => Promise<void>;
  dismissToast: (id: string) => void;
  activeCelebration: CelebrationData | null;
  dismissCelebration: () => void;
  triggerCelebration: (data: CelebrationData) => void;
  refreshData: () => Promise<void>;
  /** Reset all data to seed/mock data (wipes localStorage). Useful for dev/testing. */
  resetToSeedData: () => Promise<void>;
}

const DataContext = createContext<DataContextType>({} as DataContextType);

export const useData = () => useContext(DataContext);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const { user, updateProfile } = useAuth();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [activeToasts, setActiveToasts] = useState<Alert[]>([]);
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [assetGroups, setAssetGroups] = useState<AssetGroup[]>([]);
  const [quests, setQuests] = useState<GamificationQuest[]>([]);
  const [pinnedBadges, setPinnedBadges] = useState<string[]>(['ac4', 'ac3', 'ac1']);
  const [activeCelebration, setActiveCelebration] = useState<CelebrationData | null>(null);
  const [lastPriceRefresh, setLastPriceRefresh] = useState<string | null>(() => getLastPriceFetchTime());

  const unreadAlertsCount = useMemo(() => alerts.filter(a => !a.read).length, [alerts]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<null | string>(null);

  const dismissCelebration = useCallback(() => {
    setActiveCelebration(null);
  }, []);

  const triggerCelebration = useCallback((data: CelebrationData) => {
    setActiveCelebration(data);
  }, []);

  const refreshData = useCallback(async () => {
    try {
      setIsLoading(true);
      const baseCurr = user?.preferences?.currency || 'EUR';
      const [txs, pos, alrts, rules, gls, achData, grps, activeQuests, pinned] = await Promise.all([
        transactionService.getTransactions(),
        portfolioService.getPositions(),
        alertService.getAlerts(),
        alertService.getAlertRules(),
        goalService.getGoals(baseCurr),
        achievementService.getAchievements(),
        goalService.getAssetGroups(),
        gamificationService.getQuests(),
        gamificationService.getPinnedBadges()
      ]);

      setTransactions(txs);
      setPositions(pos);
      setAlertRules(rules);
      setGoals(gls);
      setAchievements(achData.achievements);
      setAssetGroups(grps);
      setQuests(activeQuests);
      setPinnedBadges(pinned);

      // Evaluate Smart Alerts (Multi-Domain Engine)
      const totalPortfolioValue = pos.reduce((sum, p) => sum + (p.marketValue || 0), 0);
      const evalResult = await alertService.evaluateSmartAlerts({
        positions: pos,
        totalPortfolioValue,
        taxZone: user?.preferences?.fiscalProfile?.taxZone,
        preferences: user?.preferences,
        goals: gls,
        quests: activeQuests,
      });

      setAlerts(evalResult.allAlerts);

      // Trigger toasts if fresh alerts detected and toasts not disabled in preferences
      const notifPrefs = user?.preferences?.notificationPreferences;
      const toastsEnabled = user?.preferences?.notifications !== false && notifPrefs?.inAppToasts !== false;
      if (evalResult.newAlerts.length > 0 && toastsEnabled) {
        setActiveToasts(prev => [...evalResult.newAlerts, ...prev].slice(0, 3));
      }

      // Update XP if gained (Game Engine Logic)
      if (user && achData.xpGained > 0) {
        const newXp = (user.xp || 0) + achData.xpGained;
        const oldLevel = user.level || 1;
        const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;
        updateProfile({ xp: newXp, level: newLevel });

        if (newLevel > oldLevel) {
          setActiveCelebration({
            type: 'level_up',
            title: `Level Up!`,
            level: newLevel,
            xpGained: achData.xpGained
          });
        } else if (achData.unlockedEvents && achData.unlockedEvents.length > 0) {
          const topEvent = achData.unlockedEvents[0];
          setActiveCelebration({
            type: 'achievement',
            title: topEvent.title,
            level: topEvent.level,
            xpGained: topEvent.xpReward,
            iconType: topEvent.iconType,
            color: topEvent.color
          });
        }
      }

      // Update price refresh timestamp after positions are loaded
      setLastPriceRefresh(getLastPriceFetchTime());

    } catch (err) {
      console.error("Failed to fetch data", err);
      setError(t('common:errors.failedToLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [user, updateProfile, t]);

  /** Clears the 15-min price cache and triggers a full data reload with fresh prices. */
  const forceRefreshPrices = useCallback(async () => {
    clearPriceCache();
    await refreshData();
  }, [refreshData]);

  // Initial fetch
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const addTransactions = useCallback(async (newTxs: Transaction[]) => {
    await transactionService.addTransactions(newTxs);
    await refreshData();
  }, [refreshData]);

  const saveGoal = useCallback(async (goal: FinancialGoal | Omit<FinancialGoal, 'id'>) => {
    await goalService.saveGoal(goal);
    await refreshData();
  }, [refreshData]);

  const deleteGoal = useCallback(async (id: string) => {
    await goalService.deleteGoal(id);
    setGoals(prev => prev.filter(g => g.id !== id));
  }, []);

  const toggleGoalPin = useCallback(async (id: string) => {
    await goalService.toggleGoalPin(id);
    setGoals(prev => prev.map(g => g.id === id ? { ...g, isPinned: !g.isPinned } : g));
  }, []);

  const addAssetGroup = useCallback(async (group: AssetGroup) => {
    setAssetGroups(prev => [...prev, group]);
    await goalService.saveAssetGroup(group);
    await refreshData();
  }, [refreshData]);

  const updateAssetGroup = useCallback(async (id: string, updates: Partial<AssetGroup>) => {
    setAssetGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
    await goalService.updateAssetGroup(id, updates);
    await refreshData();
  }, [refreshData]);

  const deleteAssetGroup = useCallback(async (id: string) => {
    setAssetGroups(prev => prev.filter(g => g.id !== id));
    await goalService.deleteAssetGroup(id);
    await refreshData();
  }, [refreshData]);

  const togglePinBadge = useCallback(async (badgeId: string) => {
    const isCurrentlyPinned = pinnedBadges.includes(badgeId);
    let updated: string[];
    if (isCurrentlyPinned) {
      updated = pinnedBadges.filter(id => id !== badgeId);
    } else {
      if (pinnedBadges.length >= 3) {
        updated = [pinnedBadges[1], pinnedBadges[2], badgeId];
      } else {
        updated = [...pinnedBadges, badgeId];
      }
    }
    setPinnedBadges(updated);
    await gamificationService.setPinnedBadges(updated);
  }, [pinnedBadges]);

  const claimQuest = useCallback(async (questId: string) => {
    const res = await gamificationService.claimQuestReward(questId);
    if (res.success && res.xpReward > 0 && user) {
      const newXp = (user.xp || 0) + res.xpReward;
      const oldLevel = user.level || 1;
      const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;
      updateProfile({ xp: newXp, level: newLevel });
      if (newLevel > oldLevel) {
        setActiveCelebration({
          type: 'level_up',
          title: 'Level Up!',
          level: newLevel,
          xpGained: res.xpReward
        });
      } else {
        setActiveCelebration({
          type: 'rank',
          title: `+${res.xpReward} XP !`,
          subtitle: 'Mission accomplie',
          xpGained: res.xpReward
        });
      }
      setQuests(prev => prev.map(q => q.id === questId ? { ...q, completed: true, claimed: true } : q));
    }
  }, [user, updateProfile]);

  const markAlertAsRead = useCallback(async (alertId: string) => {
    const updated = await alertService.markAlertAsRead(alertId);
    setAlerts(updated);
  }, []);

  const markAllAlertsAsRead = useCallback(async () => {
    const updated = await alertService.markAllAlertsAsRead();
    setAlerts(updated);
  }, []);

  const deleteAlert = useCallback(async (alertId: string) => {
    const updated = await alertService.deleteAlert(alertId);
    setAlerts(updated);
  }, []);

  const clearReadAlerts = useCallback(async () => {
    const updated = await alertService.clearReadAlerts();
    setAlerts(updated);
  }, []);

  const saveAlertRule = useCallback(async (rule: Partial<AlertRule> & { name: string; metric: AlertRuleMetric; threshold: number }) => {
    await alertService.saveAlertRule(rule);
    const updatedRules = await alertService.getAlertRules();
    setAlertRules(updatedRules);
  }, []);

  const toggleAlertRule = useCallback(async (id: string) => {
    const updatedRules = await alertService.toggleAlertRule(id);
    setAlertRules(updatedRules);
  }, []);

  const deleteAlertRule = useCallback(async (id: string) => {
    const updatedRules = await alertService.deleteAlertRule(id);
    setAlertRules(updatedRules);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setActiveToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const resetToSeedData = useCallback(async () => {
    clearPriceCache();
    db.resetToInitialData();
    await refreshData();
  }, [refreshData]);

  return (
    <DataContext.Provider value={{
      transactions,
      positions,
      alerts,
      unreadAlertsCount,
      alertRules,
      activeToasts,
      goals,
      achievements,
      assetGroups,
      quests,
      pinnedBadges,
      isLoading,
      error,
      lastPriceRefresh,
      forceRefreshPrices,
      addTransactions,
      saveGoal,
      deleteGoal,
      toggleGoalPin,
      addAssetGroup,
      updateAssetGroup,
      deleteAssetGroup,
      togglePinBadge,
      claimQuest,
      markAlertAsRead,
      markAllAlertsAsRead,
      deleteAlert,
      clearReadAlerts,
      saveAlertRule,
      toggleAlertRule,
      deleteAlertRule,
      dismissToast,
      activeCelebration,
      dismissCelebration,
      triggerCelebration,
      refreshData,
      resetToSeedData
    }}>
      {children}
      <CelebrationModal 
        isOpen={!!activeCelebration} 
        onClose={dismissCelebration} 
        data={activeCelebration} 
      />
    </DataContext.Provider>
  );
};