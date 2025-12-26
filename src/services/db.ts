import {
    transactions as initialTransactions,
    positions as initialPositions,
    alerts as initialAlerts,
    financialGoals as initialGoals,
    achievements as initialAchievements,
    assetGroups as initialAssetGroups
} from '../../mockData';
import { Transaction, Position, Alert, FinancialGoal, Achievement, AssetGroup } from '../../types';

const STORAGE_KEYS = {
    TRANSACTIONS: 'glassfolio_transactions',
    POSITIONS: 'glassfolio_positions',
    ALERTS: 'glassfolio_alerts',
    GOALS: 'glassfolio_goals',
    ACHIEVEMENTS: 'glassfolio_achievements',
    ASSET_GROUPS: 'glassfolio_asset_groups'
};

// Helper: Simulate network delay
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class MockDB {
    getTransactions(): Transaction[] {
        const stored = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
        return stored ? JSON.parse(stored) : initialTransactions;
    }

    saveTransactions(data: Transaction[]) {
        localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(data));
    }

    getPositions(): Position[] {
        const stored = localStorage.getItem(STORAGE_KEYS.POSITIONS);
        return stored ? JSON.parse(stored) : initialPositions;
    }

    savePositions(data: Position[]) {
        localStorage.setItem(STORAGE_KEYS.POSITIONS, JSON.stringify(data));
    }

    getGoals(): FinancialGoal[] {
        const stored = localStorage.getItem(STORAGE_KEYS.GOALS);
        return stored ? JSON.parse(stored) : initialGoals;
    }

    saveGoals(data: FinancialGoal[]) {
        localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(data));
    }

    getAchievements(): Achievement[] {
        const stored = localStorage.getItem(STORAGE_KEYS.ACHIEVEMENTS);
        return stored ? JSON.parse(stored) : initialAchievements;
    }

    saveAchievements(data: Achievement[]) {
        localStorage.setItem(STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(data));
    }

    getAlerts(): Alert[] {
        const stored = localStorage.getItem(STORAGE_KEYS.ALERTS);
        return stored ? JSON.parse(stored) : initialAlerts;
    }

    saveAlerts(data: Alert[]) {
        localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(data));
    }

    getAssetGroups(): AssetGroup[] {
        const stored = localStorage.getItem(STORAGE_KEYS.ASSET_GROUPS);
        return stored ? JSON.parse(stored) : initialAssetGroups;
    }

    saveAssetGroups(data: AssetGroup[]) {
        localStorage.setItem(STORAGE_KEYS.ASSET_GROUPS, JSON.stringify(data));
    }
}

export const db = new MockDB();
