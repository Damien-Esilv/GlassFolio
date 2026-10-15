import { describe, it, expect, beforeEach } from 'vitest';
import {
    getSecurityStatusTool,
    listVaultSecretsTool,
    lockVaultTool,
    rotateEncryptionKeyTool,
} from '../../../../../src/services/ai/tools/securityTools';
import { aiToolRegistry } from '../../../../../src/services/ai/aiToolRegistry';
import '../../../../../src/services/ai/tools';
import { vaultService } from '../../../../../src/services/security/vaultService';
import { secretsService } from '../../../../../src/services/security/secretsService';
import { auditLogService } from '../../../../../src/services/security/auditLogService';
import { appStorage } from '../../../../../src/services/storage/appStorage';

describe('securityTools (AI & MCP)', () => {
    beforeEach(async () => {
        appStorage.clear();
        await vaultService.resetVault();
        await auditLogService.clear();
        await secretsService.clear();
    });

    it('declares correct human-in-the-loop confirmation metadata according to AGENTS.md', () => {
        expect(getSecurityStatusTool.requiresConfirmation).toBe(false);
        expect(listVaultSecretsTool.requiresConfirmation).toBe(false);
        expect(lockVaultTool.requiresConfirmation).toBe(true);
        expect(rotateEncryptionKeyTool.requiresConfirmation).toBe(true);
    });

    it('is registered and discoverable in aiToolRegistry', () => {
        expect(aiToolRegistry.getTool('get_security_status')).toBeDefined();
        expect(aiToolRegistry.getTool('list_vault_secrets')).toBeDefined();
        expect(aiToolRegistry.getTool('lock_vault')).toBeDefined();
        expect(aiToolRegistry.getTool('rotate_encryption_key')).toBeDefined();
    });

    it('get_security_status returns current vault and security posture', async () => {
        await vaultService.setup('Master-Pass-12345!#');
        await secretsService.saveSecret('gemini', 'Gemini Pro', 'AIzaSyTest1234');
        await auditLogService.record('vault_unlocked', 'Test event', 'info');

        const status = await getSecurityStatusTool.execute({ includeAuditHistory: true }, {});
        expect(status.isInitialized).toBe(true);
        expect(status.vaultStatus).toBe('unlocked');
        expect(status.secretsCount).toBe(1);
        expect(status.recentAuditEvents).toHaveLength(2); // 1 secret_created + 1 manual event
    });

    it('list_vault_secrets returns masked secrets list', async () => {
        await vaultService.setup('Master-Pass-12345!#');
        await secretsService.saveSecret('openai', 'OpenAI Key', 'sk-test-99887766');

        const res = await listVaultSecretsTool.execute({}, {});
        expect(res.count).toBe(1);
        expect(res.secrets[0].provider).toBe('openai');
        expect(res.secrets[0].preview).toBe('••••••••7766');
    });

    it('lock_vault locks vault and records audit event', async () => {
        const password = 'Master-Pass-12345!#';
        await vaultService.setup(password);
        expect(vaultService.isUnlocked()).toBe(true);

        const res = await lockVaultTool.execute({}, {});
        expect(res.success).toBe(true);
        expect(vaultService.isUnlocked()).toBe(false);

        // Fail-closed verification: while locked, audit log cannot be read
        expect(await auditLogService.getEntries()).toHaveLength(0);

        // Once unlocked, audit log entry is decrypted and verified
        await vaultService.unlock(password);
        const audit = await auditLogService.getEntries();
        expect(audit.some(a => a.event === 'vault_locked')).toBe(true);
    });

    it('rotate_encryption_key rotates DEK and records audit event', async () => {
        const password = 'Master-Pass-12345!#';
        await vaultService.setup(password);

        const res = await rotateEncryptionKeyTool.execute({ masterPassword: password }, {});
        expect(res.success).toBe(true);

        const audit = await auditLogService.getEntries();
        expect(audit.some(a => a.event === 'dek_rotated')).toBe(true);
    });
});
