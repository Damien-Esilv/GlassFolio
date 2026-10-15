import { describe, it, expect, beforeEach } from 'vitest';
import { auditLogService } from '../../../../src/services/security/auditLogService';
import { appStorage } from '../../../../src/services/storage/appStorage';

describe('auditLogService', () => {
    beforeEach(async () => {
        appStorage.clear();
    });

    it('records security events with timestamps and severities', async () => {
        const entry = await auditLogService.record('vault_unlocked', 'User Alex unlocked vault', 'info');

        expect(entry.id).toBeDefined();
        expect(entry.event).toBe('vault_unlocked');
        expect(entry.details).toBe('User Alex unlocked vault');
        expect(entry.severity).toBe('info');
        expect(entry.timestamp).toBeDefined();

        const entries = await auditLogService.getEntries();
        expect(entries).toHaveLength(1);
        expect(entries[0].event).toBe('vault_unlocked');
    });

    it('filters entries by event type and limits count', async () => {
        await auditLogService.record('login_failed', 'Attempt 1', 'warning');
        await auditLogService.record('login_failed', 'Attempt 2', 'warning');
        await auditLogService.record('lockout_triggered', 'Account locked 30s', 'critical');

        const failedList = await auditLogService.getEntries(10, 'login_failed');
        expect(failedList).toHaveLength(2);

        const lockoutList = await auditLogService.getEntries(10, 'lockout_triggered');
        expect(lockoutList).toHaveLength(1);

        const topTwo = await auditLogService.getEntries(2);
        expect(topTwo).toHaveLength(2);
    });

    it('clears all audit log entries', async () => {
        await auditLogService.record('vault_locked', 'Manual lock', 'info');
        expect(await auditLogService.getEntries()).toHaveLength(1);

        await auditLogService.clear();
        expect(await auditLogService.getEntries()).toHaveLength(0);
    });
});
