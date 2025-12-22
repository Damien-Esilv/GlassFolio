import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { Transaction, Position, Alert, FinancialGoal, Achievement, AssetGroup } from '../types';
import { useAuth } from './AuthContext';
import { 
  transactions as initialTransactions, 
  positions as initialPositions, 
  alerts as initialAlerts,
  financialGoals as initialGoals,
  achievements as initialAchievements,
  assetGroups as initialAssetGroups
} from '../mockData';

interface DataContextType {
  transactions: Transaction[];
  positions: Position[];
  alerts: Alert[];
  goals: FinancialGoal[];
  achievements: Achievement[];
  assetGroups: AssetGroup[];
  addTransactions: (newTxs: Transaction[]) => void;
  saveGoal: (goal: FinancialGoal | Omit<FinancialGoal, 'id'>) => void;
  deleteGoal: (id: string) => void;
  toggleGoalPin: (id: string) => void;
  addAssetGroup: (group: AssetGroup) => void;
  updateAssetGroup: (id: string, updates: Partial<AssetGroup>) => void;
  deleteAssetGroup: (id: string) => void;
}

const DataContext = createContext<DataContextType>({} as DataContextType);

export const useData = () => useContext(DataContext);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, updateProfile } = useAuth();
  
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [positions, setPositions] = useState<Position[]>(initialPositions);
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts);
  const [rawGoals, setGoals] = useState<FinancialGoal[]>(initialGoals);
  const [achievements, setAchievements] = useState<Achievement[]>(initialAchievements);
  const [assetGroups, setAssetGroups] = useState<AssetGroup[]>(initialAssetGroups);

  // --- Derived Goals with Advanced Linking Logic ---
  const goals = useMemo(() => {
     return rawGoals.map(goal => {
        let currentAmount = 0;
        
        if (goal.method === 'dynamic' && goal.linkedAssets) {
           goal.linkedAssets.forEach(link => {
              if (link.type === 'asset') {
                  const pos = positions.find(p => p.symbol === link.id);
                  if (pos) currentAmount += pos.marketValue * (link.percentage / 100);
              } else if (link.type === 'class') {
                  // Sum all assets of this class
                  const classTotal = positions
                    .filter(p => p.type === link.id)
                    .reduce((sum, p) => sum + p.marketValue, 0);
                  currentAmount += classTotal * (link.percentage / 100);
              } else if (link.type === 'group') {
                  // Sum all assets in this group
                  const group = assetGroups.find(g => g.id === link.id);
                  if (group) {
                      const groupTotal = positions
                        .filter(p => group.symbols.includes(p.symbol))
                        .reduce((sum, p) => sum + p.marketValue, 0);
                      currentAmount += groupTotal * (link.percentage / 100);
                  }
              }
           });
        } else {
           currentAmount = goal.manualAmount || 0;
        }

        return { ...goal, currentAmount };
     });
  }, [rawGoals, positions, assetGroups]);

  // --- Achievement Engine (Multi-Level) ---
  useEffect(() => {
     const totalValue = positions.reduce((acc, p) => acc + p.marketValue, 0);
     const txCount = transactions.length;
     const assetTypes = new Set(positions.map(p => p.type)).size;
     
     let xpGained = 0;
     let hasChanges = false;

     const updatedAchievements = achievements.map(ach => {
        let currentValue = 0;
        switch(ach.conditionType) {
            case 'total_value': currentValue = totalValue; break;
            case 'transaction_count': currentValue = txCount; break;
            case 'asset_count': currentValue = assetTypes; break;
            default: currentValue = 0;
        }

        // Check Levels
        let newLevel = ach.currentLevel;
        // Check next level
        const nextLevelIdx = ach.levels.findIndex(l => l.level === ach.currentLevel + 1);
        if (nextLevelIdx !== -1) {
            const nextLevel = ach.levels[nextLevelIdx];
            if (currentValue >= nextLevel.targetValue) {
                newLevel = nextLevel.level;
                xpGained += nextLevel.xpReward;
                hasChanges = true;
            }
        } else if (ach.currentLevel === 0 && ach.levels.length > 0) {
             // Check first level
             if (currentValue >= ach.levels[0].targetValue) {
                 newLevel = 1;
                 xpGained += ach.levels[0].xpReward;
                 hasChanges = true;
             }
        }

        return { 
            ...ach, 
            currentValue, 
            currentLevel: newLevel,
            unlocked: newLevel > 0 
        };
     });

     if (hasChanges) {
         setAchievements(updatedAchievements);
         // Update User XP
         if (user && xpGained > 0) {
             const newXp = (user.xp || 0) + xpGained;
             // Simple Level calculation: Level = sqrt(XP / 100)
             const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;
             updateProfile({ xp: newXp, level: newLevel });
         }
     }

  }, [positions, transactions]);


  // --- Actions ---

  const saveGoal = useCallback((goalData: FinancialGoal | Omit<FinancialGoal, 'id'>) => {
    setGoals(prev => {
        if ('id' in goalData) {
            return prev.map(g => g.id === goalData.id ? { ...g, ...goalData } as FinancialGoal : g);
        } else {
            const newGoal: FinancialGoal = {
                ...goalData,
                id: Math.random().toString(36).substr(2, 9),
                isPinned: false,
                currentAmount: 0 
            } as FinancialGoal;
            return [...prev, newGoal];
        }
    });
  }, []);

  const deleteGoal = useCallback((id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));
  }, []);

  const toggleGoalPin = useCallback((id: string) => {
      setGoals(prev => prev.map(g => g.id === id ? { ...g, isPinned: !g.isPinned } : g));
  }, []);

  const addAssetGroup = useCallback((group: AssetGroup) => {
      setAssetGroups(prev => [...prev, group]);
  }, []);

  const updateAssetGroup = useCallback((id: string, updates: Partial<AssetGroup>) => {
      setAssetGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
  }, []);

  const deleteAssetGroup = useCallback((id: string) => {
      setAssetGroups(prev => prev.filter(g => g.id !== id));
  }, []);

  const addTransactions = (newTxs: Transaction[]) => {
    const updatedTransactions = [...newTxs, ...transactions];
    updatedTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setTransactions(updatedTransactions);

    // Update Positions
    const newPositions = [...positions];

    newTxs.forEach(tx => {
       const isBuy = tx.type === 'Buy' || tx.type === 'Deposit';
       const isSell = tx.type === 'Sell' || tx.type === 'Withdrawal';
       if (!isBuy && !isSell) return;

       // Find existing position matching symbol AND (if cash) bank/account
       const existingIdx = newPositions.findIndex(p => {
           if (p.type === 'Cash' && tx.assetClass === 'Cash') {
               // Strict match for cash accounts
               return p.symbol === tx.symbol && p.bankName === tx.bankName && p.accountName === tx.accountName;
           }
           return p.symbol === tx.symbol;
       });

       const qtyChange = isBuy ? tx.amount : -tx.amount;
       
       if (existingIdx >= 0) {
          const pos = newPositions[existingIdx];
          const newQty = Math.max(0, pos.quantity + qtyChange);
          let newAvgCost = pos.avgCost;
          if (isBuy && newQty > 0) {
             const totalCost = (pos.quantity * pos.avgCost) + (tx.amount * tx.price);
             newAvgCost = totalCost / (pos.quantity + tx.amount);
          }
          
          if (newQty === 0) {
            newPositions.splice(existingIdx, 1);
          } else {
            newPositions[existingIdx] = {
               ...pos,
               quantity: newQty,
               avgCost: newAvgCost,
               marketValue: newQty * tx.price, 
               unrealizedPL: (tx.price - newAvgCost) * newQty,
               unrealizedPLPercent: newAvgCost > 0 ? ((tx.price - newAvgCost) / newAvgCost) * 100 : 0
            };
          }
       } else if (isBuy) {
          let type: Position['type'] = 'Equity';
          if (tx.assetClass) type = tx.assetClass;
          else if (['BTC', 'ETH', 'SOL'].some(c => tx.symbol.includes(c))) type = 'Crypto';
          else if (tx.symbol === 'USD' || tx.symbol === 'EUR' || tx.type === 'Deposit') type = 'Cash';

          newPositions.push({
             id: Math.random().toString(36).substr(2, 9),
             symbol: tx.symbol,
             instrument: tx.instrument || tx.symbol,
             quantity: tx.amount,
             avgCost: tx.price,
             lastPrice: tx.price,
             marketValue: tx.amount * tx.price,
             unrealizedPL: 0,
             unrealizedPLPercent: 0,
             currency: tx.currency,
             type: type,
             source: tx.source,
             bankName: tx.bankName,
             accountName: tx.accountName
          });
       }
    });

    setPositions(newPositions);
  };

  return (
    <DataContext.Provider value={{ 
      transactions, 
      positions, 
      alerts, 
      goals, 
      achievements, 
      assetGroups,
      addTransactions,
      saveGoal,
      deleteGoal,
      toggleGoalPin,
      addAssetGroup,
      updateAssetGroup,
      deleteAssetGroup
    }}>
      {children}
    </DataContext.Provider>
  );
};