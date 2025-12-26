import {
    transactions as initialTransactions,
    positions as initialPositions,
    alerts as initialAlerts,
    financialGoals as initialGoals,
    achievements as initialAchievements,
    assetGroups as initialAssetGroups
} from '../../mockData';
import { Transaction, Position, Alert, FinancialGoal, Achievement, AssetGroup } from '../../types';

// Backend entity types and mock data
import {
    Institute,
    Account,
    ImportBatch,
    UnifiedTransaction,
    MappingTemplate
} from '../types';
import {
    institutes as initialInstitutes,
    accounts as initialAccounts,
    importBatches as initialImportBatches,
    unifiedTransactions as initialUnifiedTransactions,
    mappingTemplates as initialMappingTemplates
} from '../mockData.backend';

const STORAGE_KEYS = {
    // Legacy keys (existing functionality)
    TRANSACTIONS: 'glassfolio_transactions',
    POSITIONS: 'glassfolio_positions',
    ALERTS: 'glassfolio_alerts',
    GOALS: 'glassfolio_goals',
    ACHIEVEMENTS: 'glassfolio_achievements',
    ASSET_GROUPS: 'glassfolio_asset_groups',
    // New multi-asset architecture keys
    INSTITUTES: 'glassfolio_institutes',
    ACCOUNTS: 'glassfolio_accounts',
    IMPORT_BATCHES: 'glassfolio_import_batches',
    UNIFIED_TRANSACTIONS: 'glassfolio_unified_transactions',
    MAPPING_TEMPLATES: 'glassfolio_mapping_templates'
};

// Helper: Simulate network delay
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class MockDB {
    // =========================================================================
    // LEGACY METHODS (Existing Functionality)
    // =========================================================================

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

    // =========================================================================
    // NEW MULTI-ASSET ARCHITECTURE METHODS
    // =========================================================================

    // --- Institutes ---
    getInstitutes(): Institute[] {
        const stored = localStorage.getItem(STORAGE_KEYS.INSTITUTES);
        return stored ? JSON.parse(stored) : initialInstitutes;
    }

    saveInstitutes(data: Institute[]) {
        localStorage.setItem(STORAGE_KEYS.INSTITUTES, JSON.stringify(data));
    }

    // --- Accounts ---
    getAccounts(): Account[] {
        const stored = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
        return stored ? JSON.parse(stored) : initialAccounts;
    }

    saveAccounts(data: Account[]) {
        localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(data));
    }

    getAccountsByInstitute(instituteId: string): Account[] {
        return this.getAccounts().filter(acc => acc.instituteId === instituteId);
    }

    // --- Import Batches ---
    getImportBatches(): ImportBatch[] {
        const stored = localStorage.getItem(STORAGE_KEYS.IMPORT_BATCHES);
        return stored ? JSON.parse(stored) : initialImportBatches;
    }

    saveImportBatches(data: ImportBatch[]) {
        localStorage.setItem(STORAGE_KEYS.IMPORT_BATCHES, JSON.stringify(data));
    }

    getImportBatchesByAccount(accountId: string): ImportBatch[] {
        return this.getImportBatches().filter(batch => batch.accountId === accountId);
    }

    // --- Unified Transactions ---
    getUnifiedTransactions(): UnifiedTransaction[] {
        const stored = localStorage.getItem(STORAGE_KEYS.UNIFIED_TRANSACTIONS);
        return stored ? JSON.parse(stored) : initialUnifiedTransactions;
    }

    saveUnifiedTransactions(data: UnifiedTransaction[]) {
        localStorage.setItem(STORAGE_KEYS.UNIFIED_TRANSACTIONS, JSON.stringify(data));
    }

    getUnifiedTransactionsByBatch(batchId: string): UnifiedTransaction[] {
        return this.getUnifiedTransactions().filter(tx => tx.batchId === batchId);
    }

    /**
     * Delete all transactions associated with a batch (for rollback)
     */
    deleteTransactionsByBatch(batchId: string): number {
        const allTxs = this.getUnifiedTransactions();
        const remaining = allTxs.filter(tx => tx.batchId !== batchId);
        const deletedCount = allTxs.length - remaining.length;
        this.saveUnifiedTransactions(remaining);
        return deletedCount;
    }

    // --- Mapping Templates ---
    getMappingTemplates(): MappingTemplate[] {
        const stored = localStorage.getItem(STORAGE_KEYS.MAPPING_TEMPLATES);
        return stored ? JSON.parse(stored) : initialMappingTemplates;
    }

    saveMappingTemplates(data: MappingTemplate[]) {
        localStorage.setItem(STORAGE_KEYS.MAPPING_TEMPLATES, JSON.stringify(data));
    }
}

export const db = new MockDB();
