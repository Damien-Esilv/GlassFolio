import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    validateBackupContent,
    restoreBackupReset,
    mergeBackupData
} from '../../../../src/services/import/backupRestoreService';
import { db } from '../../../../src/services/db';

describe('backupRestoreService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('validateBackupContent', () => {
        it('should validate correctly formatted backup JSON', () => {
            const validBackup = JSON.stringify({
                version: '1.0.0',
                exportedAt: '2026-10-05T10:00:00Z',
                schema: 'glassfolio-v1',
                data: {
                    transactions: [],
                    goals: []
                }
            });

            const result = validateBackupContent(validBackup);
            expect(result.valid).toBe(true);
            expect(result.payload).toBeDefined();
            expect(result.payload?.version).toBe('1.0.0');
        });

        it('should reject invalid JSON string', () => {
            const result = validateBackupContent('{ invalid json');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Impossible de lire le fichier JSON');
        });

        it('should reject JSON that is not an object (e.g. primitive number)', () => {
            const result = validateBackupContent('42');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Fichier JSON invalide');
        });

        it('should reject JSON missing data property', () => {
            const missingData = JSON.stringify({
                version: '1.0.0',
                exportedAt: '2026-10-05T10:00:00Z'
            });

            const result = validateBackupContent(missingData);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Structure de sauvegarde non reconnue');
        });

        it('should reject JSON where data is not an object', () => {
            const invalidData = JSON.stringify({
                data: 'not an object'
            });

            const result = validateBackupContent(invalidData);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Structure de sauvegarde non reconnue');
        });
    });

    describe('restoreBackupReset', () => {
        it('should clear all data and save incoming entities', async () => {
            const clearAllSpy = vi.spyOn(db, 'clearAll').mockImplementation(() => {});
            const saveTxSpy = vi.spyOn(db, 'saveTransactions').mockImplementation(() => {});
            const saveGoalsSpy = vi.spyOn(db, 'saveGoals').mockImplementation(() => {});
            const savePosSpy = vi.spyOn(db, 'savePositions').mockImplementation(() => {});

            const mockData = {
                transactions: [{ id: 'tx-1', date: '2026-01-01', amount: 100 } as any],
                goals: [{ id: 'goal-1', name: 'Retraite', targetAmount: 50000 } as any],
                positions: [{ id: 'pos-1', symbol: 'IWDA', shares: 10 } as any]
            };

            await restoreBackupReset(mockData);

            expect(clearAllSpy).toHaveBeenCalledTimes(1);
            expect(saveTxSpy).toHaveBeenCalledWith(mockData.transactions);
            expect(saveGoalsSpy).toHaveBeenCalledWith(mockData.goals);
            expect(savePosSpy).toHaveBeenCalledWith(mockData.positions);
        });
    });

    describe('mergeBackupData', () => {
        it('should merge incoming items without duplicating existing IDs and count new items', async () => {
            const existingGoals = [
                { id: 'goal-1', name: 'Existing Goal', currentAmount: 1000 }
            ];
            vi.spyOn(db, 'getGoals').mockReturnValue(existingGoals as any);
            const saveGoalsSpy = vi.spyOn(db, 'saveGoals').mockImplementation(() => {});

            const incomingGoals = [
                { id: 'goal-1', name: 'Should Not Overwrite In Merge', currentAmount: 9999 },
                { id: 'goal-2', name: 'New Goal', currentAmount: 500 }
            ];

            const result = await mergeBackupData({
                goals: incomingGoals as any
            });

            expect(result.importedCount).toBe(1);
            expect(saveGoalsSpy).toHaveBeenCalledWith([
                { id: 'goal-1', name: 'Existing Goal', currentAmount: 1000 },
                { id: 'goal-2', name: 'New Goal', currentAmount: 500 }
            ]);
        });

        it('should handle all entity types during merge and restore without errors', async () => {
            const allEntities = {
                transactions: [{ id: 't1' } as any],
                positions: [{ id: 'p1' } as any],
                goals: [{ id: 'g1' } as any],
                achievements: [{ id: 'ac1' } as any],
                alerts: [{ id: 'al1' } as any],
                assetGroups: [{ id: 'ag1' } as any],
                institutes: [{ id: 'i1' } as any],
                accounts: [{ id: 'acc1' } as any],
                importBatches: [{ id: 'ib1' } as any],
                unifiedTransactions: [{ id: 'ut1' } as any],
                mappingTemplates: [{ id: 'mt1' } as any],
                assetPositions: [{ id: 'ap1' } as any],
                instruments: [{ id: 'in1' } as any]
            };

            await restoreBackupReset(allEntities);

            const mergeResult = await mergeBackupData(allEntities);
            expect(mergeResult.importedCount).toBeGreaterThanOrEqual(0);
        });
    });
});

