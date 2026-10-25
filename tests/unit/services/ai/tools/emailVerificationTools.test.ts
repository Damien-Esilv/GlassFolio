import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getEmailVerificationStatusTool,
    resendVerificationEmailTool,
} from '../../../../../src/services/ai/tools/securityTools';
import { aiToolRegistry } from '../../../../../src/services/ai/aiToolRegistry';
import { guardrailsService } from '../../../../../src/services/ai/guardrailsService';
import '../../../../../src/services/ai/tools';
import { authService } from '../../../../../src/services/security/authService';
import { vaultService } from '../../../../../src/services/security/vaultService';
import { userRepository } from '../../../../../src/services/repositories';
import { appStorage } from '../../../../../src/services/storage/appStorage';
import type { User } from '../../../../../src/types/domain';

const buildUser = (overrides: Partial<User> = {}): User => ({
    id: 'u-email-1',
    name: 'Ana',
    email: 'ana@example.com',
    avatar: '',
    preferences: { theme: 'night', currency: 'EUR', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
    xp: 0,
    level: 1,
    authProvider: 'email',
    emailVerified: false,
    ...overrides,
});

describe('email verification AI tools (Epic E25 — AI-First)', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        appStorage.clear();
        await vaultService.resetVault();
        await vaultService.setup('Master-Pass-12345!#');
        await userRepository.clearUser();
    });

    it('declares human-in-the-loop only on the mutating tool', () => {
        expect(getEmailVerificationStatusTool.requiresConfirmation).toBe(false);
        expect(resendVerificationEmailTool.requiresConfirmation).toBe(true);
    });

    it('is registered in aiToolRegistry', () => {
        expect(aiToolRegistry.getTool('get_email_verification_status')).toBeDefined();
        expect(aiToolRegistry.getTool('resend_verification_email')).toBeDefined();
    });

    it('reports a pending verification with a masked email', async () => {
        await userRepository.saveUser(buildUser());

        const status = await getEmailVerificationStatusTool.execute({}, {});

        expect(status).toEqual({
            authProvider: 'email',
            maskedEmail: 'a***@example.com',
            emailVerified: false,
            canResend: true,
        });
        const json = JSON.stringify(status);
        expect(json).not.toContain('ana@example.com');
        expect(() => guardrailsService.assertSafeContext(json)).not.toThrow();
    });

    it('reports verified accounts as not resendable', async () => {
        await userRepository.saveUser(buildUser({ emailVerified: true }));

        const status = await getEmailVerificationStatusTool.execute({}, {});

        expect(status.emailVerified).toBe(true);
        expect(status.canResend).toBe(false);
    });

    it('resends the verification email for an unverified email account', async () => {
        await userRepository.saveUser(buildUser());
        const resendSpy = vi.spyOn(authService, 'resendEmailVerification').mockResolvedValue();

        const res = await resendVerificationEmailTool.execute({}, {});

        expect(resendSpy).toHaveBeenCalledWith('ana@example.com');
        expect(res.success).toBe(true);
        expect(res.message).not.toContain('ana@example.com');
    });

    it('refuses to resend when nothing is pending', async () => {
        await userRepository.saveUser(buildUser({ emailVerified: true }));
        const resendSpy = vi.spyOn(authService, 'resendEmailVerification').mockResolvedValue();

        const res = await resendVerificationEmailTool.execute({}, {});

        expect(res.success).toBe(false);
        expect(resendSpy).not.toHaveBeenCalled();
    });
});
