import { db, delay } from '../db';
import { appStorage } from '../storage/appStorage';
import { verifyBackupChecksum } from './backupIntegrity';

/**
 * Backup Import & Restore Service (JSON)
 * Handles JSON backup validation, anti-corruption sanitization,
 * prototype pollution protection and non-destructive merges.
 */

/** Machine-readable validation errors; the UI translates them (settings:backupWizard.errors.*). */
export type BackupErrorCode =
    | 'unreadable'
    | 'not_an_object'
    | 'missing_data'
    | 'prototype_pollution'
    | 'invalid_collection'
    | 'checksum_mismatch';

export interface BackupValidationResult {
    valid: boolean;
    error?: BackupErrorCode;
    /** Interpolation values for the translated message (e.g. the offending collection). */
    errorParams?: { collection?: string };
    /** True only when a checksum was present AND matches the data (see `validateBackup`). */
    checksumVerified?: boolean;
    payload?: {
        version: string;
        exportedAt: string;
        schema: string;
        checksum?: string;
        data: Record<string, any[]>;
    };
}

/**
 * Recursively cleans an imported payload to prevent prototype pollution
 * (__proto__, constructor, prototype) and drops non-serializable or corrupt structures.
 */
export function sanitizeObject<T>(input: T): T {
    if (input === null || typeof input !== 'object') {
        return input;
    }

    if (Array.isArray(input)) {
        return input.map((item) => sanitizeObject(item)) as unknown as T;
    }

    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(input)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue;
        }
        if (typeof key !== 'string' || key.length > 128) {
            continue;
        }
        clean[key] = sanitizeObject(value);
    }
    return clean as T;
}

export function validateBackupContent(fileText: string): BackupValidationResult {
    try {
        const json = JSON.parse(fileText);
        if (!json || typeof json !== 'object') {
            return { valid: false, error: 'not_an_object' };
        }
        if (!json.data || typeof json.data !== 'object' || Array.isArray(json.data)) {
            return { valid: false, error: 'missing_data' };
        }

        // Validate each data collection is an array
        for (const [key, val] of Object.entries(json.data)) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                return { valid: false, error: 'prototype_pollution' };
            }
            if (!Array.isArray(val)) {
                return { valid: false, error: 'invalid_collection', errorParams: { collection: key } };
            }
        }

        // Sanitize payload against prototype pollution and corruption
        const sanitizedData = sanitizeObject(json.data);

        return {
            valid: true,
            checksumVerified: false,
            payload: {
                version: String(json.version || '1.0.0'),
                exportedAt: String(json.exportedAt || new Date().toISOString()),
                schema: String(json.schema || 'glassfolio-backup'),
                checksum: json.checksum ? String(json.checksum) : undefined,
                data: sanitizedData
            }
        };
    } catch {
        return { valid: false, error: 'unreadable' };
    }
}

/**
 * Full validation: structure, then integrity. A backup whose checksum does not match its data is
 * rejected; a backup without checksum (older exports) is accepted but not marked as verified.
 */
export async function validateBackup(fileText: string): Promise<BackupValidationResult> {
    const result = validateBackupContent(fileText);
    if (!result.valid) return result;
    const status = await verifyBackupChecksum(JSON.parse(fileText));
    if (status === 'mismatch') return { valid: false, error: 'checksum_mismatch' };
    return { ...result, checksumVerified: status === 'verified' };
}

/** Collections that make up the transactions of an account (ledger plus what its rows reference). */
export const TRANSACTION_ENTITY_KEYS = [
    'unifiedTransactions',
    'transactions',
    'accounts',
    'institutes',
    'instruments',
    'importBatches',
] as const;

/** Keeps only the transaction-related collections of a backup. */
export function pickTransactionEntities(data: Record<string, any[]>): Record<string, any[]> {
    return Object.fromEntries(
        Object.entries(data).filter(([key, rows]) => (TRANSACTION_ENTITY_KEYS as readonly string[]).includes(key) && rows.length > 0)
    );
}

/** Merges only the transactions (and their accounts, institutes, instruments, batches) of a backup. */
export async function mergeTransactionsOnly(data: Record<string, any[]>): Promise<{ importedCount: number }> {
    return mergeBackupData(pickTransactionEntities(data));
}

/** Keeps the API keys already stored locally: exports never contain them. */
function mergeAiSettingsKeepingKeys(incoming: Record<string, any>): Record<string, any> {
    try {
        const current = JSON.parse(appStorage.getItem('glassfolio_ai_settings_v1') || '{}') as Record<string, any>;
        const keys: Record<string, any> = {};
        if (current.apiKey) keys.apiKey = current.apiKey;
        if (current.customApiKey) keys.customApiKey = current.customApiKey;
        return { ...incoming, ...keys };
    } catch {
        return incoming;
    }
}

export async function restoreBackupReset(backupData: Record<string, any[]>): Promise<void> {
    await delay(300);
    db.clearAll();

    // An empty collection means "nothing stored" (GDPR archives only carry persisted data): skip it so
    // built-in reference data (mapping presets, instruments, achievement levels) is not wiped.
    const data: Record<string, any[]> = Object.fromEntries(
        Object.entries(backupData).filter(([, rows]) => !Array.isArray(rows) || rows.length > 0)
    );
    
    if (data.transactions) db.saveTransactions(data.transactions);
    if (data.positions) db.savePositions(data.positions);
    if (data.goals) db.saveGoals(data.goals);
    if (data.achievements) db.saveAchievements(data.achievements);
    if (data.alerts) db.saveAlerts(data.alerts);
    if (data.alertRules && typeof (db as any).saveAlertRules === 'function') {
        (db as any).saveAlertRules(data.alertRules);
    }
    if (data.assetGroups) db.saveAssetGroups(data.assetGroups);
    if (data.institutes) db.saveInstitutes(data.institutes);
    if (data.accounts) db.saveAccounts(data.accounts);
    if (data.importBatches) db.saveImportBatches(data.importBatches);
    if (data.unifiedTransactions) db.saveUnifiedTransactions(data.unifiedTransactions);
    if (data.mappingTemplates) db.saveMappingTemplates(data.mappingTemplates);
    if (data.assetPositions) db.saveAssetPositions(data.assetPositions);
    if (data.instruments) db.saveInstruments(data.instruments);
    if (data.quests && typeof (db as any).saveQuests === 'function') {
        (db as any).saveQuests(data.quests);
    }
    if (data.pinnedBadges && typeof (db as any).savePinnedBadges === 'function') {
        const ids = data.pinnedBadges.map((b: any) => typeof b === 'string' ? b : b?.id).filter(Boolean);
        (db as any).savePinnedBadges(ids);
    }
    if (data.userProfile && data.userProfile.length > 0) {
        const incomingUser = data.userProfile[0];
        const storedCurrentUser = appStorage.getItem('glassfolio_user');
        if (storedCurrentUser) {
            try {
                const currentUser = JSON.parse(storedCurrentUser);
                const mergedUser = {
                    ...currentUser,
                    preferences: incomingUser.preferences || currentUser.preferences,
                    fiscalProfile: incomingUser.fiscalProfile || currentUser.fiscalProfile,
                };
                appStorage.setItem('glassfolio_user', JSON.stringify(mergedUser));
            } catch {
                // Ignore parse errors
            }
        }
    }
    if (data.gamification && data.gamification.length > 0) {
        appStorage.setItem('glassfolio_gamification_v1', JSON.stringify(data.gamification[0]));
    }
    if (data.aiSettings && data.aiSettings.length > 0) {
        appStorage.setItem('glassfolio_ai_settings_v1', JSON.stringify(mergeAiSettingsKeepingKeys(data.aiSettings[0])));
    }
    if (data.aiConversations && data.aiConversations.length > 0) {
        appStorage.setItem('glassfolio_ai_chats_v1', JSON.stringify(data.aiConversations));
    }
    if (data.securityAuditLogs && data.securityAuditLogs.length > 0) {
        appStorage.setItem('glassfolio_security_audit_log', JSON.stringify(data.securityAuditLogs));
    }
}

export async function mergeBackupData(data: Record<string, any[]>): Promise<{ importedCount: number }> {
    await delay(300);
    let importedCount = 0;

    const mergeEntityList = <T extends { id: string }>(current: T[], incoming: T[] = []): T[] => {
        const map = new Map<string, T>();
        current.forEach(item => map.set(item.id, item));
        incoming.forEach(item => {
            if (!map.has(item.id)) {
                map.set(item.id, item);
                importedCount++;
            }
        });
        return Array.from(map.values());
    };

    if (data.transactions) db.saveTransactions(mergeEntityList(db.getTransactions(), data.transactions));
    if (data.positions) db.savePositions(mergeEntityList(db.getPositions(), data.positions));
    if (data.goals) db.saveGoals(mergeEntityList(db.getGoals(), data.goals));
    if (data.achievements) db.saveAchievements(mergeEntityList(db.getAchievements(), data.achievements));
    if (data.alerts) db.saveAlerts(mergeEntityList(db.getAlerts(), data.alerts));
    if (data.alertRules && typeof (db as any).saveAlertRules === 'function' && typeof (db as any).getAlertRules === 'function') {
        (db as any).saveAlertRules(mergeEntityList((db as any).getAlertRules(), data.alertRules));
    }
    if (data.assetGroups) db.saveAssetGroups(mergeEntityList(db.getAssetGroups(), data.assetGroups));
    if (data.institutes) db.saveInstitutes(mergeEntityList(db.getInstitutes(), data.institutes));
    if (data.accounts) db.saveAccounts(mergeEntityList(db.getAccounts(), data.accounts));
    if (data.importBatches) db.saveImportBatches(mergeEntityList(db.getImportBatches(), data.importBatches));
    if (data.unifiedTransactions) db.saveUnifiedTransactions(mergeEntityList(db.getUnifiedTransactions(), data.unifiedTransactions));
    if (data.mappingTemplates) db.saveMappingTemplates(mergeEntityList(db.getMappingTemplates(), data.mappingTemplates));
    if (data.assetPositions) db.saveAssetPositions(mergeEntityList(db.getAssetPositions(), data.assetPositions));
    if (data.instruments) db.saveInstruments(mergeEntityList(db.getInstruments(), data.instruments));
    if (data.quests && typeof (db as any).saveQuests === 'function' && typeof (db as any).getQuests === 'function') {
        (db as any).saveQuests(mergeEntityList((db as any).getQuests(), data.quests));
    }
    if (data.gamification && data.gamification.length > 0) {
        const currentGamificationStr = appStorage.getItem('glassfolio_gamification_v1');
        if (!currentGamificationStr) {
            appStorage.setItem('glassfolio_gamification_v1', JSON.stringify(data.gamification[0]));
            importedCount++;
        }
    }
    if (data.aiConversations && data.aiConversations.length > 0) {
        const currentChatsStr = appStorage.getItem('glassfolio_ai_chats_v1');
        let currentChats: any[] = [];
        try {
            currentChats = currentChatsStr ? JSON.parse(currentChatsStr) : [];
        } catch {
            currentChats = [];
        }
        const mergedChats = mergeEntityList(currentChats, data.aiConversations);
        appStorage.setItem('glassfolio_ai_chats_v1', JSON.stringify(mergedChats));
    }

    return { importedCount };
}
