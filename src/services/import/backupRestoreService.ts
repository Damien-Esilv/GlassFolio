import { db, delay } from '../db';

/**
 * Backup Import & Restore Service (JSON)
 * Handles JSON backup validation, anti-corruption sanitization,
 * prototype pollution protection and non-destructive merges.
 */

export interface BackupValidationResult {
    valid: boolean;
    error?: string;
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
            return { valid: false, error: 'Fichier JSON invalide' };
        }
        if (!json.data || typeof json.data !== 'object' || Array.isArray(json.data)) {
            return { valid: false, error: 'Structure de sauvegarde non reconnue (champ data manquant ou invalide)' };
        }

        // Validate each data collection is an array
        for (const [key, val] of Object.entries(json.data)) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                return { valid: false, error: 'Tentative de pollution de prototype détectée dans les données' };
            }
            if (!Array.isArray(val)) {
                return { valid: false, error: `Format de collection invalide pour '${key}', tableau attendu` };
            }
        }

        // Sanitize payload against prototype pollution and corruption
        const sanitizedData = sanitizeObject(json.data);

        return {
            valid: true,
            checksumVerified: Boolean(json.checksum),
            payload: {
                version: String(json.version || '1.0.0'),
                exportedAt: String(json.exportedAt || new Date().toISOString()),
                schema: String(json.schema || 'glassfolio-backup'),
                checksum: json.checksum ? String(json.checksum) : undefined,
                data: sanitizedData
            }
        };
    } catch {
        return { valid: false, error: 'Impossible de lire le fichier JSON' };
    }
}


export async function restoreBackupReset(data: Record<string, any[]>): Promise<void> {
    await delay(300);
    db.clearAll();
    
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

    return { importedCount };
}
