import { FinancialGoal, AssetGroup } from '../types';
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

        // Pre-compute position market values in base currency and O(1) lookup maps
        const valueBySymbol = new Map<string, number>();
        const valueById = new Map<string, number>();
        const posValues = positions.map(p => {
            const val = currencyService.convertAmount(p.marketValue, p.currency || 'EUR', baseCurrency, rates);
            valueBySymbol.set(p.symbol, (valueBySymbol.get(p.symbol) ?? 0) + val);
            valueById.set(p.id, (valueById.get(p.id) ?? 0) + val);
            return { symbol: p.symbol, id: p.id, type: p.type, val };
        });

        const valueByClass = new Map<string, number>();
        const getClassValue = (classId: string): number => {
            const cached = valueByClass.get(classId);
            if (cached !== undefined) return cached;
            let sum = 0;
            for (const p of posValues) {
                if (isAssetClassMatch(p.type, classId)) sum += p.val;
            }
            valueByClass.set(classId, sum);
            return sum;
        };

        const groupSymbolSets = new Map<string, Set<string>>();
        for (const g of assetGroups) {
            groupSymbolSets.set(g.id, new Set(g.symbols));
        }

        // Perform the heavy lifting "server-side"
        const processedGoals = goals.map(goal => {
            let currentAmount = 0;

            if (goal.method === 'dynamic' && goal.linkedAssets) {
                goal.linkedAssets.forEach(link => {
                    if (link.type === 'asset') {
                        // Linked by symbol (position ids change on every recalculation; older goals
                        // stored one); the same asset held on several accounts counts in full.
                        const assetValue = valueBySymbol.get(link.id) ?? valueById.get(link.id) ?? 0;
                        currentAmount += assetValue * (link.percentage / 100);
                    } else if (link.type === 'class') {
                        // Sum all assets of this class converted to base currency
                        const classTotal = getClassValue(link.id);
                        currentAmount += classTotal * (link.percentage / 100);
                    } else if (link.type === 'group') {
                        // Sum all assets in this group converted to base currency
                        const symbolSet = groupSymbolSets.get(link.id);
                        if (symbolSet) {
                            let groupTotal = 0;
                            for (const p of posValues) {
                                if (symbolSet.has(p.symbol)) groupTotal += p.val;
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
                id: crypto.randomUUID(),
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
