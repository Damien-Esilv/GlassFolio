import { describe, it, expect, beforeEach } from 'vitest';
import {
    getSecurityStatusTool,
    listAuthMethodsTool,
    listVaultSecretsTool,
    lockVaultTool,
    rotateEncryptionKeyTool,
} from '../../../../../src/services/ai/tools/securityTools';
import { aiToolRegistry } from '../../../../../src/services/ai/aiToolRegistry';
import { guardrailsService } from '../../../../../src/services/ai/guardrailsService';
import '../../../../../src/services/ai/tools';
import { vaultService } from '../../../../../src/services/security/vaultService';
import { secretsService } from '../../../../../src/services/security/secretsService';
import { auditLogService } from '../../../../../src/services/security/auditLogService';
import { appStorage } from '../../../../../src/services/storage/appStorage';

describe('securityTools & AI Guardrails (AI & MCP)', () => {
    beforeEach(async () => {
        appStorage.clear();
        await vaultService.resetVault();
        await auditLogService.clear();
        await secretsService.clear();
    });

    it('declares correct human-in-the-loop confirmation metadata according to AGENTS.md', () => {
        expect(getSecurityStatusTool.requiresConfirmation).toBe(false);
        expect(listAuthMethodsTool.requiresConfirmation).toBe(false);
        expect(listVaultSecretsTool.requiresConfirmation).toBe(false);
        expect(lockVaultTool.requiresConfirmation).toBe(true);
        expect(rotateEncryptionKeyTool.requiresConfirmation).toBe(true);
    });

    it('is registered and discoverable in aiToolRegistry', () => {
        expect(aiToolRegistry.getTool('get_security_status')).toBeDefined();
        expect(aiToolRegistry.getTool('list_auth_methods')).toBeDefined();
        expect(aiToolRegistry.getTool('list_vault_secrets')).toBeDefined();
        expect(aiToolRegistry.getTool('lock_vault')).toBeDefined();
        expect(aiToolRegistry.getTool('rotate_encryption_key')).toBeDefined();
    });

    it('get_security_status returns current vault and security posture without leaking secrets or emails', async () => {
        await vaultService.setup('Master-Pass-12345!#');
        await secretsService.saveSecret('gemini', 'Gemini Pro', 'AIzaSyTest1234567890abcdefghijklm');
        await auditLogService.record('vault_unlocked', 'Unlocked for alex.developer@example.com', 'info');

        const status = await getSecurityStatusTool.execute({ includeAuditHistory: true }, {});
        expect(status.isInitialized).toBe(true);
        expect(status.vaultStatus).toBe('unlocked');
        expect(status.secretsCount).toBe(1);
        expect(status.recentAuditEvents).toHaveLength(2); // 1 secret_created + 1 manual event
        expect(status.recentAuditEvents?.[0].details).not.toContain('alex.developer@example.com');
        expect(status.recentAuditEvents?.[0].details).toContain('a***@example.com');

        // Context safety assert: output must be 100% clean of raw secrets
        const json = JSON.stringify(status);
        expect(() => guardrailsService.assertSafeContext(json)).not.toThrow();
        expect(json).not.toContain('AIzaSyTest1234567890abcdefghijklm');
    });

    it('list_auth_methods returns current credentials and factor statuses', async () => {
        await vaultService.setup('Master-Pass-12345!#');
        const res = await listAuthMethodsTool.execute({}, {});
        expect(res.hasPassword).toBe(true);
        expect(res.hasRecoveryKey).toBe(true);
        expect(typeof res.hasPasskeys).toBe('boolean');
        expect(typeof res.hasTotp).toBe('boolean');
    });

    it('list_vault_secrets returns masked secrets and passes context safety checks', async () => {
        await vaultService.setup('Master-Pass-12345!#');
        const rawApiKey = 'sk-live-0987654321fedcba0987654321';
        await secretsService.saveSecret('openai', 'OpenAI Key', rawApiKey);

        const res = await listVaultSecretsTool.execute({}, {});
        expect(res.count).toBe(1);
        expect(res.secrets[0].provider).toBe('openai');
        expect(res.secrets[0].preview).toBe('••••••••4321');

        const json = JSON.stringify(res);
        expect(json).not.toContain(rawApiKey);
        expect(() => guardrailsService.assertSafeContext(json)).not.toThrow();
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

    it('rotate_encryption_key directs to interactive step-up and refuses plaintext master password', async () => {
        const res = await rotateEncryptionKeyTool.execute({}, {});
        expect(res.success).toBe(false);
        expect(res.requiresUserPresence).toBe(true);
        expect(res.message).toContain('interactive master password verification');
    });

    describe('AI Guardrails Exfiltration Prevention', () => {
        it('redacts sensitive API keys, recovery keys, and vault envelope metadata', () => {
            const rawPrompt = `
                User input: my key is sk-1234567890abcdef1234567890
                and groq key is gsk_1234567890abcdef1234567890
                and coingecko key is CG-1234567890abcdef1234567890
                and my recovery key is A1B2-C3D4-E5F6-G7H8-I9J0-K1L2-M3N4-O5P6
                and otp uri otpauth://totp/GlassFolio:alex?secret=JBSWY3DPEHPK3PXP
                and envelope {"v":1,"alg":"A256GCM","iv":"iv","ct":"ct"}
                and raw header gf_vault_header: {"version":1,"salt":"xyz"}
            `;

            const redacted = guardrailsService.redactSensitiveExfiltrations(rawPrompt);

            expect(redacted).not.toContain('sk-1234567890abcdef1234567890');
            expect(redacted).not.toContain('gsk_1234567890abcdef1234567890');
            expect(redacted).not.toContain('CG-1234567890abcdef1234567890');
            expect(redacted).toContain('[REDACTED_API_KEY]');

            expect(redacted).not.toContain('A1B2-C3D4-E5F6-G7H8-I9J0-K1L2-M3N4-O5P6');
            expect(redacted).toContain('[REDACTED_RECOVERY_KEY]');

            expect(redacted).not.toContain('otpauth://totp/GlassFolio:alex');
            expect(redacted).toContain('[REDACTED_TOTP_URI]');

            expect(redacted).toContain('[REDACTED_ENCRYPTED_ENVELOPE]');
            expect(redacted).toContain('[REDACTED_VAULT_HEADER]');
        });

        it('assertSafeContext detects and blocks exfiltration of raw secrets', () => {
            expect(() => {
                guardrailsService.assertSafeContext('Here is the key: sk-live-99999999999999999999999');
            }).toThrow(/Potential API key exfiltration detected/);

            expect(() => {
                guardrailsService.assertSafeContext('Groq key: gsk_1234567890abcdef1234567890');
            }).toThrow(/Potential API key exfiltration detected/);

            expect(() => {
                guardrailsService.assertSafeContext('CoinGecko key: CG-1234567890abcdef1234567890');
            }).toThrow(/Potential API key exfiltration detected/);

            expect(() => {
                guardrailsService.assertSafeContext('Emergency code: ABCD-EFGH-1234-5678-AAAA-BBBB-CCCC-DDDD');
            }).toThrow(/Potential Master Recovery Key exfiltration detected/);

            expect(() => {
                guardrailsService.assertSafeContext('Dump: "wrappedKeys":{"password":{"alg":"AES-KW"}}');
            }).toThrow(/Potential Vault Header\/DEK exfiltration detected/);

            expect(() => {
                guardrailsService.assertSafeContext('Raw storage dump: {"gf_vault_header":{"version":1}}');
            }).toThrow(/Potential Vault Header\/DEK exfiltration detected/);
        });
    });
});
