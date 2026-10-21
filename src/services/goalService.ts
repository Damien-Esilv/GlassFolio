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

        // BOLT OPTIMIZATION:
        // Pre-compute base currency market values for all positions ONCE before goals loop
        // to avoid redundant O(Goals * Links * Positions) FX conversions and currencyService calls.
        const positionBaseValues = positions.map(p => ({
            pos: p,
            baseValue: currencyService.convertAmount(p.marketValue, p.currency || 'EUR', baseCurrency, rates)
        }));

        // Stack-scoped O(1) Map lookups for positions and asset groups to eliminate repeated linear searches.
        const posBySymbolMap = new Map(positionBaseValues.map(item => [item.pos.symbol, item]));
        const assetGroupMap = new Map(
            assetGroups.map(g => [g.id, { group: g, symbolSet: new Set(g.symbols) }])
        );

        // Perform the heavy lifting "server-side"
        const processedGoals = goals.map(goal => {
            let currentAmount = 0;

            if (goal.method === 'dynamic' && goal.linkedAssets) {
                goal.linkedAssets.forEach(link => {
                    if (link.type === 'asset') {
                        const item = posBySymbolMap.get(link.id);
                        if (item) {
                            currentAmount += item.baseValue * (link.percentage / 100);
                        }
                    } else if (link.type === 'class') {
                        // Sum pre-computed base values of matching asset class
                        let classTotal = 0;
                        for (let i = 0; i < positionBaseValues.length; i++) {
                            const item = positionBaseValues[i];
                            if (isAssetClassMatch(item.pos.type, link.id)) {
                                classTotal += item.baseValue;
                            }
                        }
                        currentAmount += classTotal * (link.percentage / 100);
                    } else if (link.type === 'group') {
                        // Sum pre-computed base values of positions matching asset group
                        const groupEntry = assetGroupMap.get(link.id);
                        if (groupEntry) {
                            let groupTotal = 0;
                            for (let i = 0; i < positionBaseValues.length; i++) {
                                const item = positionBaseValues[i];
                                if (groupEntry.symbolSet.has(item.pos.symbol)) {
                                    groupTotal += item.baseValue;
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
