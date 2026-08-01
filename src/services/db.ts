/**
 * Database Layer - Mock DB with localStorage
 * 
 * This module provides the data access layer for all entities.
 * Designed for easy migration to InstantDB in production.
 */

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
    MappingTemplate,
    AssetPosition,
    Instrument
} from '../types';
import {
    institutes as initialInstitutes,
    accounts as initialAccounts,
    importBatches as initialImportBatches,
    unifiedTransactions as initialUnifiedTransactions,
    mappingTemplates as initialMappingTemplates,
    instruments as initialInstruments
} from './mockData.backend';

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
    MAPPING_TEMPLATES: 'glassfolio_mapping_templates',
    ASSET_POSITIONS: 'glassfolio_asset_positions',
    INSTRUMENTS: 'glassfolio_instruments'
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

    getInstituteById(id: string): Institute | undefined {
        return this.getInstitutes().find(i => i.id === id);
    }

    // --- Accounts ---
    getAccounts(): Account[] {
        const stored = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
        return stored ? JSON.parse(stored) : initialAccounts;
    }

    saveAccounts(data: Account[]) {
        localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(data));
    }

    getAccountById(id: string): Account | undefined {
        return this.getAccounts().find(a => a.id === id);
    }

    getAccountsByInstitute(instituteId: string): Account[] {
        return this.getAccounts().filter(acc => acc.instituteId === instituteId);
    }

    // --- Import Batches ---
    getImportBatches(): ImportBatch[] {
        const stored = localStorage.getItem(STORAGE_KEYS.IMPORT_BATCHES);
        if (!stored) return initialImportBatches;

        // Migrate old batches to new schema if needed
        const batches = JSON.parse(stored) as ImportBatch[];
        return batches.map(b => ({
            ...b,
            ownerId: b.ownerId || 'default-user',
            fileHash: b.fileHash || '',
            skippedCount: b.skippedCount || 0,
            importedBy: b.importedBy || 'default-user',
            engineVersion: b.engineVersion || '1.0.0'
        }));
    }

    saveImportBatches(data: ImportBatch[]) {
        localStorage.setItem(STORAGE_KEYS.IMPORT_BATCHES, JSON.stringify(data));
    }

    getImportBatchById(id: string): ImportBatch | undefined {
        return this.getImportBatches().find(b => b.id === id);
    }

    getImportBatchesByAccount(accountId: string): ImportBatch[] {
        return this.getImportBatches().filter(batch => batch.accountId === accountId);
    }

    getImportBatchByFileHash(fileHash: string): ImportBatch | undefined {
        return this.getImportBatches().find(b => b.fileHash === fileHash && b.status === 'completed');
    }

    // --- Unified Transactions ---
    getUnifiedTransactions(): UnifiedTransaction[] {
        const stored = localStorage.getItem(STORAGE_KEYS.UNIFIED_TRANSACTIONS);
        if (!stored) return initialUnifiedTransactions;

        // Migrate old transactions to new schema if needed
        const transactions = JSON.parse(stored) as UnifiedTransaction[];
        return transactions.map(tx => ({
            ...tx,
            ownerId: tx.ownerId || 'default-user',
            rowHash: tx.rowHash || '',
            sourceOrigin: tx.sourceOrigin || 'FILE',
            isSynthetic: tx.isSynthetic ?? false,
            isFiscal: tx.isFiscal ?? true,
            sourceMode: tx.sourceMode || 'history',
            createdAt: tx.createdAt || new Date().toISOString(),
            updatedAt: tx.updatedAt || new Date().toISOString(),
            version: tx.version || 1
        }));
    }

    saveUnifiedTransactions(data: UnifiedTransaction[]) {
        localStorage.setItem(STORAGE_KEYS.UNIFIED_TRANSACTIONS, JSON.stringify(data));
    }

    getUnifiedTransactionsByBatch(batchId: string): UnifiedTransaction[] {
        return this.getUnifiedTransactions().filter(tx => tx.batchId === batchId);
    }

    getUnifiedTransactionsByAccount(accountId: string): UnifiedTransaction[] {
        return this.getUnifiedTransactions().filter(tx => tx.accountId === accountId);
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
        if (!stored) return initialMappingTemplates;

        const templates = JSON.parse(stored) as MappingTemplate[];
        return templates.map(t => ({
            ...t,
            ownerId: t.ownerId || 'default-user',
            isPreset: t.isPreset ?? false
        }));
    }

    saveMappingTemplates(data: MappingTemplate[]) {
        localStorage.setItem(STORAGE_KEYS.MAPPING_TEMPLATES, JSON.stringify(data));
    }

    getMappingTemplateById(id: string): MappingTemplate | undefined {
        return this.getMappingTemplates().find(t => t.id === id);
    }

    // --- Asset Positions (Derived/Cached) ---
    getAssetPositions(): AssetPosition[] {
        const stored = localStorage.getItem(STORAGE_KEYS.ASSET_POSITIONS);
        return stored ? JSON.parse(stored) : [];
    }

    saveAssetPositions(data: AssetPosition[]) {
        localStorage.setItem(STORAGE_KEYS.ASSET_POSITIONS, JSON.stringify(data));
    }

    getAssetPositionsByAccount(accountId: string): AssetPosition[] {
        return this.getAssetPositions().filter(p => p.accountId === accountId);
    }

    // --- Instruments ---
    getInstruments(): Instrument[] {
        const stored = localStorage.getItem(STORAGE_KEYS.INSTRUMENTS);
        return stored ? JSON.parse(stored) : initialInstruments;
    }

    saveInstruments(data: Instrument[]) {
        localStorage.setItem(STORAGE_KEYS.INSTRUMENTS, JSON.stringify(data));
    }

    getInstrumentById(id: string): Instrument | undefined {
        return this.getInstruments().find(i => i.id === id);
    }

    /**
     * Find an instrument by its market identifier (ISIN, symbol, or currencyCode).
     * Used during import to avoid creating duplicates.
     */
    findInstrumentByMarketId(opts: { isin?: string; symbol?: string; currencyCode?: string }): Instrument | undefined {
        const instruments = this.getInstruments();
        // ISIN match is highest priority (most specific)
        if (opts.isin) {
            const found = instruments.find(i => i.marketIdentifier.isin === opts.isin);
            if (found) return found;
        }
        // Cash: match by currencyCode
        if (opts.currencyCode) {
            const found = instruments.find(i =>
                i.type === 'cash' && i.marketIdentifier.currencyCode === opts.currencyCode
            );
            if (found) return found;
        }
        // Symbol match (less specific — only if no ISIN)
        if (opts.symbol) {
            return instruments.find(i =>
                i.marketIdentifier.symbol.toUpperCase() === opts.symbol!.toUpperCase()
            );
        }
        return undefined;
    }

    // =========================================================================
    // UTILITY METHODS
    // =========================================================================

    /**
     * Clear all data (useful for testing)
     */
    clearAll() {
        Object.values(STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
    }

    /**
     * Export all data (for backup)
     */
    exportAll(): Record<string, unknown> {
        return {
            transactions: this.getTransactions(),
            positions: this.getPositions(),
            goals: this.getGoals(),
            achievements: this.getAchievements(),
            alerts: this.getAlerts(),
            assetGroups: this.getAssetGroups(),
            institutes: this.getInstitutes(),
            accounts: this.getAccounts(),
            importBatches: this.getImportBatches(),
            unifiedTransactions: this.getUnifiedTransactions(),
            mappingTemplates: this.getMappingTemplates(),
            assetPositions: this.getAssetPositions(),
            instruments: this.getInstruments()
        };
    }

    /**
     * Wipe all localStorage keys used by GlassFolio so the app falls back
     * to initial seed / mock data on next load.
     */
    resetToInitialData(): void {
        Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
    }
}

export const db = new MockDB();
