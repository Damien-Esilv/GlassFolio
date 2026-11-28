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
    alertRules as initialAlertRules,
    financialGoals as initialGoals,
    achievements as initialAchievements,
    assetGroups as initialAssetGroups,
    buildDemoTransactions,
    buildDemoAlerts,
    buildDemoAlertRules
} from './mockData';
import { Transaction, Position, Alert, AlertRule, FinancialGoal, Achievement, AssetGroup, GamificationQuest, XpEvent } from '../types';

// Backend entity types and mock data
import {
    Institute,
    Account,
    ImportBatch,
    UnifiedTransaction,
    MappingTemplate,
    AssetPosition,
    Instrument,
    CustomCashflowCategory,
    CategorizationRule,
    CashflowAnnotation,
    CashflowTombstone,
    CashflowUpcoming,
    CashflowSettings
} from '../types';
import {
    institutes as initialInstitutes,
    accounts as initialAccounts,
    importBatches as initialImportBatches,
    unifiedTransactions as initialUnifiedTransactions,
    mappingTemplates as initialMappingTemplates,
    instruments as initialInstruments,
    buildDemoInstitutes,
    buildDemoAccounts,
    buildDemoImportBatches,
    buildDemoUnifiedTransactions,
    buildDemoInstruments,
    buildDemoCashflowRules
} from './mockData.backend';
import { appStorage } from './storage/appStorage';
import { getDeploymentMode } from '../config/deployment';
import { CONNECTIONS_STORAGE_KEY, LEGACY_MANUAL_PRICE_HISTORY_KEY, MANUAL_PRICE_HISTORY_KEY, VAULT_HEADER_KEY } from './storage/storageKeys';

const STORAGE_KEYS = {
    // Legacy keys (existing functionality)
    TRANSACTIONS: 'glassfolio_transactions',
    POSITIONS: 'glassfolio_positions',
    ALERTS: 'glassfolio_alerts',
    ALERT_RULES: 'glassfolio_alert_rules',
    GOALS: 'glassfolio_goals',
    ACHIEVEMENTS: 'glassfolio_achievements',
    ASSET_GROUPS: 'glassfolio_asset_groups',
    QUESTS: 'glassfolio_quests',
    XP_EVENTS: 'glassfolio_xp_events',
    PINNED_BADGES: 'glassfolio_pinned_badges',
    // New multi-asset architecture keys
    INSTITUTES: 'glassfolio_institutes',
    ACCOUNTS: 'glassfolio_accounts',
    IMPORT_BATCHES: 'glassfolio_import_batches',
    UNIFIED_TRANSACTIONS: 'glassfolio_unified_transactions',
    MAPPING_TEMPLATES: 'glassfolio_mapping_templates',
    ASSET_POSITIONS: 'glassfolio_asset_positions',
    INSTRUMENTS: 'glassfolio_instruments',
    // Cash flow (Epic E52): what the user decides about bank operations
    CASHFLOW_CATEGORIES: 'glassfolio_cashflow_categories',
    CASHFLOW_RULES: 'glassfolio_cashflow_rules',
    CASHFLOW_ANNOTATIONS: 'glassfolio_cashflow_annotations',
    CASHFLOW_TOMBSTONES: 'glassfolio_cashflow_tombstones',
    CASHFLOW_UPCOMING: 'glassfolio_cashflow_upcoming',
    CASHFLOW_SETTINGS: 'glassfolio_cashflow_settings'
};

/**
 * Bank operations (rows of checking and savings accounts) are stored in one record per year, apart
 * from the rest of the journal: a vault record is capped at 5 MB (10 MB per account online) and a
 * checking account adds 100 to 250 rows a month (TGLA-248). `getUnifiedTransactions` returns both.
 */
export const BANK_OPERATIONS_KEY_PREFIX = 'glassfolio_bank_operations_';
const BANK_OPERATIONS_KEY_PATTERN = /^glassfolio_bank_operations_\d{4}$/;
const CASH_ACCOUNT_TYPES = new Set(['checking', 'savings']);

/** Drops what the reader restores by default, so a year of bank rows stays small. */
const compactJournalRow = (tx: UnifiedTransaction): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(tx)) {
        if (value === undefined || value === null || value === '') continue;
        if (key === 'isSynthetic' && value === false) continue;
        if (key === 'version' && value === 1) continue;
        if (key === 'sourceMode' && value === 'history') continue;
        if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) continue;
        out[key] = value;
    }
    return out;
};

const parseRows = (raw: string | null): UnifiedTransaction[] => {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as UnifiedTransaction[]) : [];
    } catch {
        return [];
    }
};

/** Writes a record only when its content changed (each write is encrypted and sent to the server). */
const writeIfChanged = (key: string, value: string): void => {
    if (appStorage.getItem(key) !== value) appStorage.setItem(key, value);
};

export const DEFAULT_CASHFLOW_SETTINGS: Omit<CashflowSettings, 'updatedAt'> = {
    ownerId: 'default-user',
    includedAccountIds: null,
    includeInvestmentIncome: true,
    monthStartDay: 1,
};

/**
 * Simulated network delay, kept for the hosted (cloud) build where the data layer stands in for a
 * remote backend. In local mode the calls already pay their real cost (encryption, the write to the
 * server volume), so waiting on top of that only slows the interface down.
 */
export const delay = (ms: number): Promise<void> =>
    getDeploymentMode() === 'local' ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, ms));

export const isRealUserVaultActive = (): boolean => {
    try {
        const raw = appStorage.getBacking().getItem(VAULT_HEADER_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return Boolean(parsed && parsed.isDemo === false);
    } catch {
        return false;
    }
};

class MockDB {
    /** Changes whenever the stored user data changes: lets derived results (tax summary) know they are stale. */
    getDataVersion(): number {
        return appStorage.getDataVersion();
    }

    /** Calls `listener` when another tab of this browser changed the stored data. */
    subscribeExternalChanges(listener: () => void): () => void {
        return appStorage.subscribeExternalData(() => listener());
    }

    // =========================================================================
    // LEGACY METHODS (Existing Functionality)
    // =========================================================================

    getTransactions(): Transaction[] {
        const stored = appStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
        if (stored) return JSON.parse(stored);
        return isRealUserVaultActive() ? [] : buildDemoTransactions();
    }

    saveTransactions(data: Transaction[]) {
        appStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(data));
    }

    getPositions(): Position[] {
        const stored = appStorage.getItem(STORAGE_KEYS.POSITIONS);
        if (stored) return JSON.parse(stored);
        return isRealUserVaultActive() ? [] : initialPositions;
    }

    savePositions(data: Position[]) {
        appStorage.setItem(STORAGE_KEYS.POSITIONS, JSON.stringify(data));
    }

    getGoals(): FinancialGoal[] {
        const stored = appStorage.getItem(STORAGE_KEYS.GOALS);
        if (stored) return JSON.parse(stored);
        return isRealUserVaultActive() ? [] : initialGoals;
    }

    saveGoals(data: FinancialGoal[]) {
        appStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(data));
    }

    getAchievements(): Achievement[] {
        const stored = appStorage.getItem(STORAGE_KEYS.ACHIEVEMENTS);
        const isReal = isRealUserVaultActive();
        const baseAchievements = isReal
            ? initialAchievements.map(a => ({ ...a, currentLevel: 0, unlocked: false, currentValue: 0 }))
            : initialAchievements;
        if (!stored) return baseAchievements;

        try {
            const storedList = JSON.parse(stored) as Achievement[];
            if (isReal && storedList.length === 0) {
                return baseAchievements;
            }
            const map = new Map<string, Achievement>();
            baseAchievements.forEach(a => map.set(a.id, a));
            storedList.forEach(a => {
                const initial = map.get(a.id);
                map.set(a.id, {
                    ...(initial || a),
                    ...a,
                    levels: initial?.levels || a.levels,
                    category: initial?.category || a.category,
                    badgeKey: initial?.badgeKey || a.badgeKey,
                    iconType: initial?.iconType || a.iconType
                });
            });
            return Array.from(map.values());
        } catch {
            return baseAchievements;
        }
    }

    saveAchievements(data: Achievement[]) {
        appStorage.setItem(STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(data));
    }

    getXpEvents(): XpEvent[] {
        const stored = appStorage.getItem(STORAGE_KEYS.XP_EVENTS);
        if (!stored) return [];
        try {
            const parsed: unknown = JSON.parse(stored);
            return Array.isArray(parsed) ? (parsed as XpEvent[]) : [];
        } catch {
            return [];
        }
    }

    saveXpEvents(data: XpEvent[]) {
        appStorage.setItem(STORAGE_KEYS.XP_EVENTS, JSON.stringify(data));
    }

    getQuests(): GamificationQuest[] {
        const stored = appStorage.getItem(STORAGE_KEYS.QUESTS);
        return stored ? JSON.parse(stored) : [];
    }

    saveQuests(data: GamificationQuest[]) {
        appStorage.setItem(STORAGE_KEYS.QUESTS, JSON.stringify(data));
    }

    getPinnedBadges(): string[] {
        const stored = appStorage.getItem(STORAGE_KEYS.PINNED_BADGES);
        if (stored) return JSON.parse(stored);
        return isRealUserVaultActive() ? [] : ['ac4', 'ac3', 'ac1'];
    }

    savePinnedBadges(ids: string[]) {
        appStorage.setItem(STORAGE_KEYS.PINNED_BADGES, JSON.stringify(ids));
    }

    getAlerts(): Alert[] {
        const stored = appStorage.getItem(STORAGE_KEYS.ALERTS);
        if (stored) return JSON.parse(stored);
        return isRealUserVaultActive() ? [] : buildDemoAlerts();
    }

    saveAlerts(data: Alert[]) {
        appStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(data));
    }

    getAlertRules(): AlertRule[] {
        const stored = appStorage.getItem(STORAGE_KEYS.ALERT_RULES);
        if (stored) return JSON.parse(stored);
        return isRealUserVaultActive() ? [] : buildDemoAlertRules();
    }

    saveAlertRules(data: AlertRule[]) {
        appStorage.setItem(STORAGE_KEYS.ALERT_RULES, JSON.stringify(data));
    }

    getAssetGroups(): AssetGroup[] {
        const stored = appStorage.getItem(STORAGE_KEYS.ASSET_GROUPS);
        if (stored) return JSON.parse(stored);
        return isRealUserVaultActive() ? [] : initialAssetGroups;
    }

    saveAssetGroups(data: AssetGroup[]) {
        appStorage.setItem(STORAGE_KEYS.ASSET_GROUPS, JSON.stringify(data));
    }

    // =========================================================================
    // NEW MULTI-ASSET ARCHITECTURE METHODS
    // =========================================================================

    // --- Institutes ---
    getInstitutes(): Institute[] {
        const stored = appStorage.getItem(STORAGE_KEYS.INSTITUTES);
        if (!stored) return isRealUserVaultActive() ? [] : buildDemoInstitutes();

        try {
            const storedList = JSON.parse(stored) as Institute[];
            const map = new Map<string, Institute>();
            if (!isRealUserVaultActive()) {
                buildDemoInstitutes().forEach(i => map.set(i.id, i));
            }
            storedList.forEach(i => {
                const initial = map.get(i.id);
                map.set(i.id, {
                    ...i,
                    country: i.country || initial?.country || 'FR',
                });
            });
            return Array.from(map.values());
        } catch {
            return isRealUserVaultActive() ? [] : buildDemoInstitutes();
        }
    }

    saveInstitutes(data: Institute[]) {
        appStorage.setItem(STORAGE_KEYS.INSTITUTES, JSON.stringify(data));
    }

    getInstituteById(id: string): Institute | undefined {
        return this.getInstitutes().find(i => i.id === id);
    }

    // --- Accounts ---
    getAccounts(): Account[] {
        const stored = appStorage.getItem(STORAGE_KEYS.ACCOUNTS);
        if (!stored) return isRealUserVaultActive() ? [] : buildDemoAccounts();

        try {
            const storedList = JSON.parse(stored) as Account[];
            const map = new Map<string, Account>();
            if (!isRealUserVaultActive()) {
                buildDemoAccounts().forEach(a => map.set(a.id, a));
            }
            storedList.forEach(a => map.set(a.id, a));
            return Array.from(map.values());
        } catch {
            return isRealUserVaultActive() ? [] : buildDemoAccounts();
        }
    }

    saveAccounts(data: Account[]) {
        appStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(data));
    }

    getAccountById(id: string): Account | undefined {
        return this.getAccounts().find(a => a.id === id);
    }

    getAccountsByInstitute(instituteId: string): Account[] {
        return this.getAccounts().filter(acc => acc.instituteId === instituteId);
    }

    // --- Import Batches ---
    getImportBatches(): ImportBatch[] {
        const stored = appStorage.getItem(STORAGE_KEYS.IMPORT_BATCHES);
        if (!stored) return isRealUserVaultActive() ? [] : buildDemoImportBatches();

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
        appStorage.setItem(STORAGE_KEYS.IMPORT_BATCHES, JSON.stringify(data));
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
    /** Yearly records holding the bank operations, oldest first. */
    getBankOperationKeys(): string[] {
        return appStorage.keys().filter(key => BANK_OPERATIONS_KEY_PATTERN.test(key)).sort();
    }

    getUnifiedTransactions(): UnifiedTransaction[] {
        const stored = appStorage.getItem(STORAGE_KEYS.UNIFIED_TRANSACTIONS);
        const bankKeys = this.getBankOperationKeys();
        if (!stored && bankKeys.length === 0) return isRealUserVaultActive() ? [] : buildDemoUnifiedTransactions();

        // Migrate old transactions to new schema if needed
        const transactions = [
            ...parseRows(stored),
            ...bankKeys.flatMap(key => parseRows(appStorage.getItem(key))),
        ];
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

    /**
     * Saves the journal: rows of checking and savings accounts go to their yearly record (compact),
     * every other row to the main record. Only the records whose content changed are rewritten.
     */
    saveUnifiedTransactions(data: UnifiedTransaction[]) {
        const cashAccounts = new Set(this.getAccounts().filter(a => CASH_ACCOUNT_TYPES.has(a.type)).map(a => a.id));
        const main: UnifiedTransaction[] = [];
        const years = new Map<string, Record<string, unknown>[]>();
        for (const tx of data) {
            const year = typeof tx.transactionDate === 'string' ? tx.transactionDate.slice(0, 4) : '';
            if (cashAccounts.has(tx.accountId) && /^\d{4}$/.test(year)) {
                const rows = years.get(year) ?? [];
                rows.push(compactJournalRow(tx));
                years.set(year, rows);
            } else {
                main.push(tx);
            }
        }
        writeIfChanged(STORAGE_KEYS.UNIFIED_TRANSACTIONS, JSON.stringify(main));
        for (const [year, rows] of years) writeIfChanged(`${BANK_OPERATIONS_KEY_PREFIX}${year}`, JSON.stringify(rows));
        for (const key of this.getBankOperationKeys()) {
            if (!years.has(key.slice(BANK_OPERATIONS_KEY_PREFIX.length))) appStorage.removeItem(key);
        }
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
        const stored = appStorage.getItem(STORAGE_KEYS.MAPPING_TEMPLATES);
        if (!stored) return initialMappingTemplates;

        const templates = JSON.parse(stored) as MappingTemplate[];
        return templates.map(t => ({
            ...t,
            ownerId: t.ownerId || 'default-user',
            isPreset: t.isPreset ?? false
        }));
    }

    saveMappingTemplates(data: MappingTemplate[]) {
        appStorage.setItem(STORAGE_KEYS.MAPPING_TEMPLATES, JSON.stringify(data));
    }

    getMappingTemplateById(id: string): MappingTemplate | undefined {
        return this.getMappingTemplates().find(t => t.id === id);
    }

    // --- Asset Positions (Derived/Cached) ---
    getAssetPositions(): AssetPosition[] {
        const stored = appStorage.getItem(STORAGE_KEYS.ASSET_POSITIONS);
        return stored ? JSON.parse(stored) : [];
    }

    saveAssetPositions(data: AssetPosition[]) {
        appStorage.setItem(STORAGE_KEYS.ASSET_POSITIONS, JSON.stringify(data));
    }

    getAssetPositionsByAccount(accountId: string): AssetPosition[] {
        return this.getAssetPositions().filter(p => p.accountId === accountId);
    }

    // --- Instruments ---
    getInstruments(): Instrument[] {
        const stored = appStorage.getItem(STORAGE_KEYS.INSTRUMENTS);
        return stored ? JSON.parse(stored) : (isRealUserVaultActive() ? [] : buildDemoInstruments());
    }

    saveInstruments(data: Instrument[]) {
        appStorage.setItem(STORAGE_KEYS.INSTRUMENTS, JSON.stringify(data));
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

    // --- Cash flow (Epic E52) ---
    private readList<T>(key: string, fallback: () => T[]): T[] {
        const stored = appStorage.getItem(key);
        if (!stored) return isRealUserVaultActive() ? [] : fallback();
        try {
            const parsed: unknown = JSON.parse(stored);
            return Array.isArray(parsed) ? (parsed as T[]) : [];
        } catch {
            return [];
        }
    }

    getCashflowCategories(): CustomCashflowCategory[] {
        return this.readList<CustomCashflowCategory>(STORAGE_KEYS.CASHFLOW_CATEGORIES, () => []);
    }

    saveCashflowCategories(data: CustomCashflowCategory[]) {
        appStorage.setItem(STORAGE_KEYS.CASHFLOW_CATEGORIES, JSON.stringify(data));
    }

    getCashflowRules(): CategorizationRule[] {
        return this.readList<CategorizationRule>(STORAGE_KEYS.CASHFLOW_RULES, buildDemoCashflowRules);
    }

    saveCashflowRules(data: CategorizationRule[]) {
        appStorage.setItem(STORAGE_KEYS.CASHFLOW_RULES, JSON.stringify(data));
    }

    getCashflowAnnotations(): CashflowAnnotation[] {
        return this.readList<CashflowAnnotation>(STORAGE_KEYS.CASHFLOW_ANNOTATIONS, () => []);
    }

    saveCashflowAnnotations(data: CashflowAnnotation[]) {
        appStorage.setItem(STORAGE_KEYS.CASHFLOW_ANNOTATIONS, JSON.stringify(data));
    }

    getCashflowTombstones(): CashflowTombstone[] {
        return this.readList<CashflowTombstone>(STORAGE_KEYS.CASHFLOW_TOMBSTONES, () => []);
    }

    saveCashflowTombstones(data: CashflowTombstone[]) {
        appStorage.setItem(STORAGE_KEYS.CASHFLOW_TOMBSTONES, JSON.stringify(data));
    }

    /** Operations the banks announce as coming (TGLA-254), outside the journal. */
    getCashflowUpcoming(): CashflowUpcoming[] {
        return this.readList<CashflowUpcoming>(STORAGE_KEYS.CASHFLOW_UPCOMING, () => []);
    }

    saveCashflowUpcoming(data: CashflowUpcoming[]) {
        appStorage.setItem(STORAGE_KEYS.CASHFLOW_UPCOMING, JSON.stringify(data));
    }

    getCashflowSettings(): CashflowSettings {
        const fallback: CashflowSettings = { ...DEFAULT_CASHFLOW_SETTINGS, updatedAt: new Date(0).toISOString() };
        const stored = appStorage.getItem(STORAGE_KEYS.CASHFLOW_SETTINGS);
        if (!stored) return fallback;
        try {
            const parsed = JSON.parse(stored) as Partial<CashflowSettings>;
            return { ...fallback, ...parsed };
        } catch {
            return fallback;
        }
    }

    saveCashflowSettings(data: CashflowSettings) {
        appStorage.setItem(STORAGE_KEYS.CASHFLOW_SETTINGS, JSON.stringify(data));
    }

    // =========================================================================
    // UTILITY METHODS
    // =========================================================================

    /**
     * Clear all data (useful for testing)
     */
    clearAll() {
        Object.values(STORAGE_KEYS).forEach(key => {
            appStorage.removeItem(key);
        });
        this.getBankOperationKeys().forEach(key => appStorage.removeItem(key));
    }

    /**
     * Export all data (for backup)
     */
    /**
     * Reads a persisted collection exactly as stored. Unlike the typed getters it never falls back
     * to the demo seed data, so an export can only ever contain what the account actually owns.
     */
    private readPersistedList(key: string): unknown[] {
        const stored = appStorage.getItem(key);
        if (!stored) return [];
        try {
            const parsed: unknown = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
            return [];
        }
    }

    exportAll(options?: { persistedOnly?: boolean }): Record<string, unknown> {
        const persistedOnly = options?.persistedOnly === true;
        const pick = <T>(getter: () => T[], key: string): unknown[] =>
            persistedOnly ? this.readPersistedList(key) : getter();
        let userProfile: unknown[] = [];
        const storedUser = appStorage.getItem('glassfolio_user');
        if (storedUser) {
            try {
                const parsedUser = JSON.parse(storedUser);
                const { masterPasswordHash, authSalt, ...safeUser } = parsedUser;
                userProfile = [safeUser];
            } catch {
                // Ignore parse errors
            }
        }

        let gamification: unknown[] = [];
        const storedGamification = appStorage.getItem('glassfolio_gamification_v1');
        if (storedGamification) {
            try {
                gamification = [JSON.parse(storedGamification)];
            } catch {
                // Ignore parse errors
            }
        }

        let aiSettings: unknown[] = [];
        const storedAiSettings = appStorage.getItem('glassfolio_ai_settings_v1');
        if (storedAiSettings) {
            try {
                const parsedSettings = JSON.parse(storedAiSettings);
                if (parsedSettings && typeof parsedSettings === 'object') {
                    const safeSettings = { ...parsedSettings };
                    delete safeSettings.apiKey;
                    delete safeSettings.customApiKey;
                    delete safeSettings.providerApiKeys;
                    aiSettings = [safeSettings];
                }
            } catch {
                // Ignore
            }
        }

        let aiConversations: unknown[] = [];
        const storedAiChats = appStorage.getItem('glassfolio_ai_chats_v1');
        if (storedAiChats) {
            try {
                const parsedChats = JSON.parse(storedAiChats);
                aiConversations = Array.isArray(parsedChats) ? parsedChats : [parsedChats];
            } catch {
                // Ignore
            }
        }

        let securityAuditLogs: unknown[] = [];
        const storedAuditLogs = appStorage.getItem('glassfolio_security_audit_log');
        if (storedAuditLogs) {
            try {
                const parsedLogs = JSON.parse(storedAuditLogs);
                securityAuditLogs = Array.isArray(parsedLogs) ? parsedLogs : [parsedLogs];
            } catch {
                // Ignore
            }
        }

        return {
            transactions: pick(() => this.getTransactions(), STORAGE_KEYS.TRANSACTIONS),
            positions: pick(() => this.getPositions(), STORAGE_KEYS.POSITIONS),
            goals: pick(() => this.getGoals(), STORAGE_KEYS.GOALS),
            achievements: pick(() => this.getAchievements(), STORAGE_KEYS.ACHIEVEMENTS),
            alerts: pick(() => this.getAlerts(), STORAGE_KEYS.ALERTS),
            alertRules: pick(() => this.getAlertRules(), STORAGE_KEYS.ALERT_RULES),
            assetGroups: pick(() => this.getAssetGroups(), STORAGE_KEYS.ASSET_GROUPS),
            institutes: pick(() => this.getInstitutes(), STORAGE_KEYS.INSTITUTES),
            accounts: pick(() => this.getAccounts(), STORAGE_KEYS.ACCOUNTS),
            importBatches: pick(() => this.getImportBatches(), STORAGE_KEYS.IMPORT_BATCHES),
            unifiedTransactions: persistedOnly
                ? [STORAGE_KEYS.UNIFIED_TRANSACTIONS, ...this.getBankOperationKeys()].flatMap(key => this.readPersistedList(key))
                : this.getUnifiedTransactions(),
            mappingTemplates: pick(() => this.getMappingTemplates(), STORAGE_KEYS.MAPPING_TEMPLATES),
            assetPositions: pick(() => this.getAssetPositions(), STORAGE_KEYS.ASSET_POSITIONS),
            instruments: pick(() => this.getInstruments(), STORAGE_KEYS.INSTRUMENTS),
            quests: pick(() => this.getQuests(), STORAGE_KEYS.QUESTS),
            xpEvents: pick(() => this.getXpEvents(), STORAGE_KEYS.XP_EVENTS),
            cashflowCategories: pick(() => this.getCashflowCategories(), STORAGE_KEYS.CASHFLOW_CATEGORIES),
            cashflowRules: pick(() => this.getCashflowRules(), STORAGE_KEYS.CASHFLOW_RULES),
            cashflowAnnotations: pick(() => this.getCashflowAnnotations(), STORAGE_KEYS.CASHFLOW_ANNOTATIONS),
            cashflowTombstones: pick(() => this.getCashflowTombstones(), STORAGE_KEYS.CASHFLOW_TOMBSTONES),
            cashflowUpcoming: pick(() => this.getCashflowUpcoming(), STORAGE_KEYS.CASHFLOW_UPCOMING),
            cashflowSettings: persistedOnly
                ? this.readPersistedList(STORAGE_KEYS.CASHFLOW_SETTINGS)
                : [this.getCashflowSettings()],
            pinnedBadges: persistedOnly
                ? this.readPersistedList(STORAGE_KEYS.PINNED_BADGES).map(id => ({ id }))
                : this.getPinnedBadges().map(id => ({ id })),
            userProfile,
            gamification,
            aiSettings,
            aiConversations,
            securityAuditLogs
        };
    }

    /**
     * Wipe all localStorage keys used by GlassFolio so the app falls back
     * to initial seed / mock data on next load.
     */
    resetToInitialData(): void {
        Object.values(STORAGE_KEYS).forEach(key => appStorage.removeItem(key));
        this.getBankOperationKeys().forEach(key => appStorage.removeItem(key));
        appStorage.removeItem('glassfolio_price_cache');
        appStorage.removeItem(MANUAL_PRICE_HISTORY_KEY);
        appStorage.getBacking().removeItem(LEGACY_MANUAL_PRICE_HISTORY_KEY);
    }

    /**
     * Resets all user portfolio, transaction, goal, alert, and gamification records
     * to empty arrays ('[]') so a real account is 100% blank without falling back to demo seed data.
     */
    resetAccountDataToZero(): void {
        const zeroKeys = [
            STORAGE_KEYS.TRANSACTIONS,
            STORAGE_KEYS.POSITIONS,
            STORAGE_KEYS.ALERTS,
            STORAGE_KEYS.ALERT_RULES,
            STORAGE_KEYS.GOALS,
            STORAGE_KEYS.ACHIEVEMENTS,
            STORAGE_KEYS.ASSET_GROUPS,
            STORAGE_KEYS.QUESTS,
            STORAGE_KEYS.XP_EVENTS,
            STORAGE_KEYS.PINNED_BADGES,
            STORAGE_KEYS.ACCOUNTS,
            STORAGE_KEYS.IMPORT_BATCHES,
            STORAGE_KEYS.UNIFIED_TRANSACTIONS,
            STORAGE_KEYS.ASSET_POSITIONS,
            STORAGE_KEYS.CASHFLOW_CATEGORIES,
            STORAGE_KEYS.CASHFLOW_RULES,
            STORAGE_KEYS.CASHFLOW_ANNOTATIONS,
            STORAGE_KEYS.CASHFLOW_TOMBSTONES,
            STORAGE_KEYS.CASHFLOW_UPCOMING,
        ];
        zeroKeys.forEach(key => appStorage.setItem(key, '[]'));
        this.getBankOperationKeys().forEach(key => appStorage.removeItem(key));
        appStorage.removeItem(STORAGE_KEYS.CASHFLOW_SETTINGS);
        // Sync connections point to the accounts just wiped
        appStorage.removeItem(CONNECTIONS_STORAGE_KEY);
        appStorage.removeItem('glassfolio_price_cache');
        appStorage.removeItem(MANUAL_PRICE_HISTORY_KEY);
        appStorage.getBacking().removeItem(LEGACY_MANUAL_PRICE_HISTORY_KEY);
    }
}

export const db = new MockDB();
