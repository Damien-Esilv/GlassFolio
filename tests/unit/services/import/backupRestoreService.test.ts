import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    validateBackupContent,
    restoreBackupReset,
    mergeBackupData
} from '../../../../src/services/import/backupRestoreService';
import { db } from '../../../../src/services/db';
import { appStorage } from '../../../../src/services/storage/appStorage';

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
            expect(result.error).toBe('unreadable');
        });

        it('should reject JSON that is not an object (e.g. primitive number)', () => {
            const result = validateBackupContent('42');
            expect(result.valid).toBe(false);
            expect(result.error).toBe('not_an_object');
        });

        it('should reject JSON missing data property', () => {
            const missingData = JSON.stringify({
                version: '1.0.0',
                exportedAt: '2026-10-05T10:00:00Z'
            });

            const result = validateBackupContent(missingData);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('missing_data');
        });

        it('should reject JSON where data is not an object', () => {
            const invalidData = JSON.stringify({
                data: 'not an object'
            });

            const result = validateBackupContent(invalidData);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('missing_data');
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

        it('restores non-financial account data (user profile, gamification, AI, audit logs)', async () => {
            appStorage.setItem('glassfolio_user', JSON.stringify({
                id: 'active-user',
                email: 'active@example.com',
                authProvider: 'google',
                preferences: { theme: 'light', currency: 'USD' }
            }));

            const fullAccountData = {
                userProfile: [{
                    id: 'backup-user',
                    email: 'backup@example.com',
                    preferences: { theme: 'night', currency: 'EUR' },
                    fiscalProfile: { familyStatus: 'married', fiscalShares: 2.5 }
                }],
                gamification: [{ xp: 1200, level: 5, streaks: 10 }],
                aiSettings: [{ model: 'gpt-4o' }],
                aiConversations: [{ id: 'chat-backup-1', title: 'Fiscalité' }],
                securityAuditLogs: [{ id: 'audit-1', action: 'login' }],
                quests: [{ id: 'q1', title: 'Premier trade' } as any],
                pinnedBadges: ['ac1', 'ac2'] as any
            };

            await restoreBackupReset(fullAccountData);

            // User profile was merged: active user identity preserved, preferences restored
            const updatedUser = JSON.parse(appStorage.getItem('glassfolio_user') || '{}');
            expect(updatedUser.id).toBe('active-user');
            expect(updatedUser.preferences?.theme).toBe('night');
            expect(updatedUser.preferences?.currency).toBe('EUR');
            expect(updatedUser.fiscalProfile?.familyStatus).toBe('married');

            // Gamification, AI, and audit logs restored
            const gamification = JSON.parse(appStorage.getItem('glassfolio_gamification_v1') || '{}');
            expect(gamification.xp).toBe(1200);

            const aiSettings = JSON.parse(appStorage.getItem('glassfolio_ai_settings_v1') || '{}');
            expect(aiSettings.model).toBe('gpt-4o');

            const aiChats = JSON.parse(appStorage.getItem('glassfolio_ai_chats_v1') || '[]');
            expect(aiChats[0].id).toBe('chat-backup-1');

            const auditLogs = JSON.parse(appStorage.getItem('glassfolio_security_audit_log') || '[]');
            expect(auditLogs[0].id).toBe('audit-1');
        });
    });
});

