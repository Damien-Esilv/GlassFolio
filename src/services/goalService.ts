import { FinancialGoal, AssetGroup } from '../../types';
import { delay } from './db';
import { currencyService } from './currencyService';
import { isAssetClassMatch } from '../constants/assetClasses';
import { goalRepository, portfolioRepository } from './repositories';

export const goalService = {
    getGoals: async (baseCurrency: string = 'EUR'): Promise<FinancialGoal[]> => {
        await delay(300);
        const goals = await goalRepository.getGoals();
        const positions = await portfolioRepository.getPositions(); // Need positions to calc progress
        const assetGroups = await goalRepository.getAssetGroups();

        // Fetch FX exchange rates for position currencies to baseCurrency
        const uniqueCurrencies = positions.map(p => p.currency || 'EUR');
        const rates = await currencyService.getExchangeRates(uniqueCurrencies, baseCurrency);

        // ⚡ OPTIMIZATION: Pre-calculate base-currency market value for each position in a single O(P) pass,
        // and pre-index lookups using stack-scoped O(1) Maps to replace repeated O(P) linear searches
        // (find/filter) inside the goal processing loops.
        const positionsWithBaseValue = positions.map(p => ({
            ...p,
            baseValue: currencyService.convertAmount(p.marketValue, p.currency || 'EUR', baseCurrency, rates)
        }));

        const positionsBySymbol = new Map<string, typeof positionsWithBaseValue[0]>();
        for (const pos of positionsWithBaseValue) {
            positionsBySymbol.set(pos.symbol, pos);
        }

        const assetGroupsById = new Map<string, AssetGroup>();
        for (const group of assetGroups) {
            assetGroupsById.set(group.id, group);
        }

        // Perform the heavy lifting "server-side"
        const processedGoals = goals.map(goal => {
            let currentAmount = 0;

            if (goal.method === 'dynamic' && goal.linkedAssets) {
                goal.linkedAssets.forEach(link => {
                    if (link.type === 'asset') {
                        // O(1) Map lookup replacing linear Array.find()
                        const pos = positionsBySymbol.get(link.id);
                        if (pos) currentAmount += pos.baseValue * (link.percentage / 100);
                    } else if (link.type === 'class') {
                        // Sum pre-calculated baseValues for assets matching this class
                        let classTotal = 0;
                        for (const pos of positionsWithBaseValue) {
                            if (isAssetClassMatch(pos.type, link.id)) {
                                classTotal += pos.baseValue;
                            }
                        }
                        currentAmount += classTotal * (link.percentage / 100);
                    } else if (link.type === 'group') {
                        // O(1) group lookup and Set lookup for symbols
                        const group = assetGroupsById.get(link.id);
                        if (group) {
                            const symbolSet = new Set(group.symbols);
                            let groupTotal = 0;
                            for (const pos of positionsWithBaseValue) {
                                if (symbolSet.has(pos.symbol)) {
                                    groupTotal += pos.baseValue;
                                }
                            }
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
        const goals = await goalRepository.getGoals();
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

        await goalRepository.saveGoals(updatedGoals);
        return goalService.getGoals(baseCurrency); // Return fresh with calculated amounts
    },

    deleteGoal: async (id: string): Promise<void> => {
        await delay(200);
        await goalRepository.deleteGoal(id);
    },

    toggleGoalPin: async (id: string): Promise<void> => {
        await delay(100);
        const goals = await goalRepository.getGoals();
        await goalRepository.saveGoals(goals.map(g => g.id === id ? { ...g, isPinned: !g.isPinned } : g));
    },

    // --- Asset Groups ---

    getAssetGroups: async (): Promise<AssetGroup[]> => {
        await delay(200);
        return goalRepository.getAssetGroups();
    },

    saveAssetGroup: async (group: AssetGroup): Promise<AssetGroup[]> => {
        await delay(200);
        const groups = await goalRepository.getAssetGroups();
        const newGroups = [...groups, group];
        await goalRepository.saveAssetGroups(newGroups);
        return newGroups;
    },

    updateAssetGroup: async (id: string, updates: Partial<AssetGroup>): Promise<AssetGroup[]> => {
        await delay(200);
        const groups = await goalRepository.getAssetGroups();
        const newGroups = groups.map(g => g.id === id ? { ...g, ...updates } : g);
        await goalRepository.saveAssetGroups(newGroups);
        return newGroups;
    },

    deleteAssetGroup: async (id: string): Promise<AssetGroup[]> => {
        await delay(200);
        const groups = await goalRepository.getAssetGroups();
        const newGroups = groups.filter(g => g.id !== id);
        await goalRepository.saveAssetGroups(newGroups);
        return newGroups;
    }
};
