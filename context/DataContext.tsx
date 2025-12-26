import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Transaction, Position, Alert, FinancialGoal, Achievement, AssetGroup } from '../types';
import { useAuth } from './AuthContext';
import { transactionService } from '../src/services/transactionService';
import { portfolioService } from '../src/services/portfolioService';
import { alertService } from '../src/services/alertService';
import { goalService } from '../src/services/goalService';
import { achievementService } from '../src/services/achievementService';

interface DataContextType {
  transactions: Transaction[];
  positions: Position[];
  alerts: Alert[];
  goals: FinancialGoal[];
  achievements: Achievement[];
  assetGroups: AssetGroup[];
  isLoading: boolean;
  error: string | null;
  addTransactions: (newTxs: Transaction[]) => Promise<void>;
  saveGoal: (goal: FinancialGoal | Omit<FinancialGoal, 'id'>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  toggleGoalPin: (id: string) => Promise<void>;
  addAssetGroup: (group: AssetGroup) => Promise<void>;
  updateAssetGroup: (id: string, updates: Partial<AssetGroup>) => Promise<void>;
  deleteAssetGroup: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType>({} as DataContextType);

export const useData = () => useContext(DataContext);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, updateProfile } = useAuth();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [assetGroups, setAssetGroups] = useState<AssetGroup[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<null | string>(null);

  const refreshData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [txs, pos, alrts, gls, achData, grps] = await Promise.all([
        transactionService.getTransactions(),
        portfolioService.getPositions(),
        alertService.getAlerts(),
        goalService.getGoals(),
        achievementService.getAchievements(),
        goalService.getAssetGroups()
      ]);

      setTransactions(txs);
      setPositions(pos);
      setAlerts(alrts);
      setGoals(gls);
      setAchievements(achData.achievements);
      setAssetGroups(grps);

      // Update XP if gained (Game Engine Logic)
      if (user && achData.xpGained > 0) {
        const newXp = (user.xp || 0) + achData.xpGained;
        const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;
        updateProfile({ xp: newXp, level: newLevel });
      }

    } catch (err) {
      console.error("Failed to fetch data", err);
      setError("Failed to load data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [user, updateProfile]);

  // Initial Load
  useEffect(() => {
    refreshData();
  }, [refreshData]);


  // --- Actions ---

  const addTransactions = useCallback(async (newTxs: Transaction[]) => {
    await transactionService.addTransactions(newTxs);
    await refreshData();
  }, [refreshData]);

  const saveGoal = useCallback(async (goalData: FinancialGoal | Omit<FinancialGoal, 'id'>) => {
    await goalService.saveGoal(goalData);
    await refreshData();
  }, [refreshData]);

  const deleteGoal = useCallback(async (id: string) => {
    await goalService.deleteGoal(id);
    setGoals(prev => prev.filter(g => g.id !== id)); // Optimistic
  }, []);

  const toggleGoalPin = useCallback(async (id: string) => {
    await goalService.toggleGoalPin(id);
    setGoals(prev => prev.map(g => g.id === id ? { ...g, isPinned: !g.isPinned } : g)); // Optimistic
  }, []);

  const addAssetGroup = useCallback(async (group: AssetGroup) => {
    // Optimistic update
    setAssetGroups(prev => [...prev, group]);
    // Persist via Service
    await goalService.saveAssetGroup(group);
    // No need to full refresh if we just added it, but if other things depend on it (like goal calcs), we might want to.
    // goalService.saveAssetGroup returns the new list, but doesn't re-calc goals.
    // However, since goals depend on groups, we SHOULD refresh goals if a group is added/changed.
    // But usually adding a group doesn't change a goal until we link it.
    // So simple optimistic update is fine for now, or just refresh.
    // Let's stick to refreshData to be safe and consistent.
    await refreshData();
  }, [refreshData]);

  const updateAssetGroup = useCallback(async (id: string, updates: Partial<AssetGroup>) => {
    setAssetGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g)); // Optimistic
    await goalService.updateAssetGroup(id, updates);
    await refreshData(); // Refresh to update derived goal amounts if group members changed
  }, [refreshData]);

  const deleteAssetGroup = useCallback(async (id: string) => {
    setAssetGroups(prev => prev.filter(g => g.id !== id)); // Optimistic
    await goalService.deleteAssetGroup(id);
    await refreshData();
  }, [refreshData]);

  return (
    <DataContext.Provider value={{
      transactions,
      positions,
      alerts,
      goals,
      achievements,
      assetGroups,
      isLoading,
      error,
      addTransactions,
      saveGoal,
      deleteGoal,
      toggleGoalPin,
      addAssetGroup,
      updateAssetGroup,
      deleteAssetGroup,
      refreshData
    }}>
      {children}
    </DataContext.Provider>
  );
};