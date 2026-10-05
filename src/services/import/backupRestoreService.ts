import { db, delay } from '../db';

/**
 * Backup Import & Restore Service (JSON)
 * Handles JSON backup validation, full reset restoration, and non-destructive merges.
 */

export interface BackupValidationResult {
    valid: boolean;
    error?: string;
    payload?: {
        version: string;
        exportedAt: string;
        schema: string;
        data: Record<string, any[]>;
    };
}

export function validateBackupContent(fileText: string): BackupValidationResult {
    try {
        const json = JSON.parse(fileText);
        if (!json || typeof json !== 'object') {
            return { valid: false, error: 'Fichier JSON invalide' };
        }
        if (!json.data || typeof json.data !== 'object') {
            return { valid: false, error: 'Structure de sauvegarde non reconnue (champ data manquant)' };
        }
        return {
            valid: true,
            payload: json
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
