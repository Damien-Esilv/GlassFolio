import { FinancialGoal, AssetGroup } from '../../types';
import { db, delay } from './db';
import { currencyService } from './currencyService';
import { isAssetClassMatch } from '../constants/assetClasses';

export const goalService = {
    getGoals: async (baseCurrency: string = 'EUR'): Promise<FinancialGoal[]> => {
        await delay(300);
        const goals = db.getGoals();
        const positions = db.getPositions(); // Need positions to calc progress
        const assetGroups = db.getAssetGroups();

        // Fetch FX exchange rates for position currencies to baseCurrency
        const uniqueCurrencies = positions.map(p => p.currency || 'EUR');
        const rates = await currencyService.getExchangeRates(uniqueCurrencies, baseCurrency);

        // Helper to get position market value converted to base currency
        const getPosValueInBase = (p: typeof positions[0]) => {
            return currencyService.convertAmount(p.marketValue, p.currency || 'EUR', baseCurrency, rates);
        };

        // Perform the heavy lifting "server-side"
        const processedGoals = goals.map(goal => {
            let currentAmount = 0;

            if (goal.method === 'dynamic' && goal.linkedAssets) {
                goal.linkedAssets.forEach(link => {
                    if (link.type === 'asset') {
                        const pos = positions.find(p => p.symbol === link.id);
                        if (pos) currentAmount += getPosValueInBase(pos) * (link.percentage / 100);
                    } else if (link.type === 'class') {
                        // Sum all assets of this class converted to base currency
                        const classTotal = positions
                            .filter(p => isAssetClassMatch(p.type, link.id))
                            .reduce((sum, p) => sum + getPosValueInBase(p), 0);
                        currentAmount += classTotal * (link.percentage / 100);
                    } else if (link.type === 'group') {
                        // Sum all assets in this group converted to base currency
                        const group = assetGroups.find(g => g.id === link.id);
                        if (group) {
                            const groupTotal = positions
                                .filter(p => group.symbols.includes(p.symbol))
                                .reduce((sum, p) => sum + getPosValueInBase(p), 0);
                            currentAmount += groupTotal * (link.percentage / 100);
                        }
                    }
                });
            } else {
                currentAmount = goal.manualAmount || 0;
            }

            return { ...goal, currentAmount };
        });

        return processedGoals;
    },

    saveGoal: async (goalData: FinancialGoal | Omit<FinancialGoal, 'id'>, baseCurrency: string = 'EUR'): Promise<FinancialGoal[]> => {
        await delay(200);
        const goals = db.getGoals();
        let updatedGoals;

        if ('id' in goalData) {
            updatedGoals = goals.map(g => g.id === goalData.id ? { ...g, ...goalData } as FinancialGoal : g);
        } else {
            const newGoal: FinancialGoal = {
                ...goalData,
                id: Math.random().toString(36).substr(2, 9),
                isPinned: false,
                currentAmount: 0
            } as FinancialGoal;
            updatedGoals = [...goals, newGoal];
        }

        db.saveGoals(updatedGoals);
        return goalService.getGoals(baseCurrency); // Return fresh with calculated amounts
    },

    deleteGoal: async (id: string): Promise<void> => {
        await delay(200);
        const goals = db.getGoals();
        db.saveGoals(goals.filter(g => g.id !== id));
    },

    toggleGoalPin: async (id: string): Promise<void> => {
        await delay(100);
        const goals = db.getGoals();
        db.saveGoals(goals.map(g => g.id === id ? { ...g, isPinned: !g.isPinned } : g));
    },

    // --- Asset Groups ---

    getAssetGroups: async (): Promise<AssetGroup[]> => {
        await delay(200);
        return db.getAssetGroups();
    },

    saveAssetGroup: async (group: AssetGroup): Promise<AssetGroup[]> => {
        await delay(200);
        const groups = db.getAssetGroups();
        const newGroups = [...groups, group];
        db.saveAssetGroups(newGroups);
        return newGroups;
    },

    updateAssetGroup: async (id: string, updates: Partial<AssetGroup>): Promise<AssetGroup[]> => {
        await delay(200);
        const groups = db.getAssetGroups();
        const newGroups = groups.map(g => g.id === id ? { ...g, ...updates } : g);
        db.saveAssetGroups(newGroups);
        return newGroups;
    },

    deleteAssetGroup: async (id: string): Promise<AssetGroup[]> => {
        await delay(200);
        const groups = db.getAssetGroups();
        const newGroups = groups.filter(g => g.id !== id);
        db.saveAssetGroups(newGroups);
        return newGroups;
    }
};
