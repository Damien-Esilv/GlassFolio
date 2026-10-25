import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    LocalAuthProvider,
    SupabaseAuthProvider,
    createAuthProvider,
} from '../../../../src/services/security/authService';
import { vaultService } from '../../../../src/services/security/vaultService';
import { totpService, generateTotpCode } from '../../../../src/services/security/totpService';
import { antiBotService, getTurnstileSiteKey, isTurnstileEnabled } from '../../../../src/services/security/antiBotService';
import { auditLogService } from '../../../../src/services/security/auditLogService';
import { userRepository } from '../../../../src/services/repositories';
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';
import { appStorage } from '../../../../src/services/storage/appStorage';
import { isOk } from '../../../../src/types/result';
import type { User } from '../../../../src/types/domain';

describe('Epic 20 — Authentication, Cryptographic Lifecycle, 2FA & Anti-Bot', () => {
    beforeEach(async () => {
        await vaultService.resetVault();
        await userRepository.clearUser();
        await totpService.disable();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('1. Dual-Mode Isolation (local vs cloud)', () => {
        it('strictly returns LocalAuthProvider in local mode even if Supabase is configured', async () => {
            const supabaseConfigModule = await import('../../../../src/services/supabase/supabaseClient');
            vi.spyOn(supabaseConfigModule, 'isSupabaseConfigured').mockReturnValue(true);

            const provider = createAuthProvider('local');
            expect(provider).toBeInstanceOf(LocalAuthProvider);
            expect(provider).not.toBeInstanceOf(SupabaseAuthProvider);
        });

        it('returns SupabaseAuthProvider in cloud mode when Supabase is configured', async () => {
            const supabaseConfigModule = await import('../../../../src/services/supabase/supabaseClient');
            vi.spyOn(supabaseConfigModule, 'isSupabaseConfigured').mockReturnValue(true);

            const provider = createAuthProvider('cloud');
            expect(provider).toBeInstanceOf(SupabaseAuthProvider);
        });

        it('falls back to LocalAuthProvider in cloud mode if Supabase is not configured', async () => {
            const supabaseConfigModule = await import('../../../../src/services/supabase/supabaseClient');
            vi.spyOn(supabaseConfigModule, 'isSupabaseConfigured').mockReturnValue(false);

            const provider = createAuthProvider('cloud');
            expect(provider).toBeInstanceOf(LocalAuthProvider);
        });
    });

    describe('2. Seamless Google OAuth (Option A 0-Password) & Account Conflict Guard', () => {
        it('initializes zero-password OAuth vault and sets authProvider to google', async () => {
            const sbAuth = new SupabaseAuthProvider();
            const fakeOAuthHash = '#access_token=google-oauth-token-123&refresh_token=refresh-token-456&expires_in=3600';

            // Mock Supabase getUser
            vi.spyOn(supabaseClient, 'getUser').mockResolvedValue({
                id: 'google-usr-999',
                email: 'investor.google@example.com',
                user_metadata: {
                    full_name: 'Google Investor',
                    avatar_url: 'https://lh3.googleusercontent.com/avatar',
                },
            });

            // Set URL hash
            window.location.hash = fakeOAuthHash;

            const res = await sbAuth.handleOAuthCallback();
            expect(res).not.toBeNull();
            expect(res?.user.authProvider).toBe('google');
            expect(res?.user.emailVerified).toBe(true);
            expect(res?.user.name).toBe('Google Investor');
            expect(vaultService.isInitialized()).toBe(true);
            expect(vaultService.isUnlocked()).toBe(true);

            const header = vaultService.getVaultHeader();
            expect(header?.authProvider).toBe('google');
        });

        it('blocks OAuth takeover when user already registered with password and prevents vault erasure', async () => {
            const sbAuth = new SupabaseAuthProvider();

            // 1. User signs up with master password
            const password = 'Strong-Vault-Secret-Key-2026!#';
            await vaultService.setup(password, { authProvider: 'email' });
            expect(vaultService.getVaultHeader()?.authProvider).toBe('email');

            // 2. An incoming Google OAuth callback attempts to take over the account
            vi.spyOn(supabaseClient, 'getUser').mockResolvedValue({
                id: 'google-usr-attacker',
                email: 'victim@example.com',
                user_metadata: { name: 'Attacker' },
            });
            window.location.hash = '#access_token=attacker-token&expires_in=3600';

            // 3. Must block and protect existing vault
            await expect(sbAuth.handleOAuthCallback()).rejects.toThrow(/already exists with this email address using password/i);

            // Vault must remain intact
            expect(vaultService.isInitialized()).toBe(true);
            expect(vaultService.getVaultHeader()?.authProvider).toBe('email');
        });
    });

    describe('3. Multi-Slot Cryptographic Lifecycle & 256-Bit Emergency Recovery Key', () => {
        it('preserves Recovery Key slot across master password changes', async () => {
            const sbAuth = new SupabaseAuthProvider();
            const oldPassword = 'Old-Vault-Secret-Key-2026!#';
            const newPassword = 'New-Vault-Secret-Key-2026!#';

            // 1. Setup vault
            const setupRes = await vaultService.setup(oldPassword);
            const originalRecoveryKey = setupRes.recoveryKey;
            expect(originalRecoveryKey).toBeDefined();

            // 2. Change master password
            await sbAuth.changePassword(oldPassword, newPassword);

            // 3. Lock vault
            await vaultService.lock();
            expect(vaultService.isUnlocked()).toBe(false);

            // 4. Recovery key must STILL unlock the vault successfully
            const unlockRes = await vaultService.unlockWithRecoveryKey(originalRecoveryKey);
            expect(unlockRes).toBeDefined();
            expect(vaultService.isUnlocked()).toBe(true);
        });

        it('recovers password with recovery key and enforces mandatory rotation of recovery key', async () => {
            const sbAuth = new SupabaseAuthProvider();
            const password = 'Initial-Vault-Secret-Key-2026!#';
            const resetPassword = 'Reset-Vault-Secret-Key-2026!#';

            const setupRes = await vaultService.setup(password);
            const initialRecoveryKey = setupRes.recoveryKey;

            await vaultService.lock();

            // Perform emergency recovery
            const recoveryRes = await sbAuth.recoverPassword(initialRecoveryKey, resetPassword);
            expect(recoveryRes.newRecoveryKey).toBeDefined();
            expect(recoveryRes.newRecoveryKey).not.toEqual(initialRecoveryKey);
            expect(vaultService.isUnlocked()).toBe(true);

            // Old recovery key must now be invalid
            await vaultService.lock();
            await expect(vaultService.unlockWithRecoveryKey(initialRecoveryKey)).rejects.toThrow();

            // New rotated recovery key must work
            await vaultService.unlockWithRecoveryKey(recoveryRes.newRecoveryKey);
            expect(vaultService.isUnlocked()).toBe(true);
        });

        it('supports voluntary recovery key regeneration with password confirmation', async () => {
            const password = 'Voluntary-Vault-Secret-Key-2026!#';
            const setupRes = await vaultService.setup(password);
            const initialKey = setupRes.recoveryKey;

            const regenRes = await vaultService.regenerateRecoveryKey(password);
            expect(regenRes.success).toBe(true);
            if (!regenRes.success) return;

            expect(regenRes.value.recoveryKey).not.toEqual(initialKey);

            // Verify new key unlocks
            await vaultService.lock();
            await vaultService.unlockWithRecoveryKey(regenRes.value.recoveryKey);
            expect(vaultService.isUnlocked()).toBe(true);
        });
    });

    describe('4. Anti-Bot Protection (Honeypot, Timing & WebCrypto PoW)', () => {
        it('rejects submissions with filled honeypot', async () => {
            const res = await antiBotService.verify({
                honeypot: 'bot-content',
                mountedAt: Date.now() - 5000,
                powChallenge: 'test',
                powNonce: 0,
                powHash: '000abc',
            }, { skipPow: true });

            expect(res.success).toBe(false);
            if (!isOk(res)) {
                expect(res.error.field).toBe('honeypot');
            }
        });

        it('rejects submissions submitted faster than 1500ms minimum duration', async () => {
            const now = Date.now();
            const res = await antiBotService.verify({
                honeypot: '',
                mountedAt: now - 300, // only 300ms elapsed
                submittedAt: now,
                powChallenge: 'test',
                powNonce: 0,
                powHash: '000abc',
            }, { skipPow: true });

            expect(res.success).toBe(false);
            if (!isOk(res)) {
                expect(res.error.field).toBe('timing');
            }
        });

        it('creates, solves and verifies WebCrypto Proof-of-Work challenge', async () => {
            const challenge = antiBotService.createChallenge();
            expect(challenge).toBeDefined();

            const solution = await antiBotService.solveChallenge(challenge);
            expect(solution.hash.startsWith('000')).toBe(true);

            const verification = await antiBotService.verify({
                honeypot: '',
                mountedAt: Date.now() - 2000,
                powChallenge: challenge,
                powNonce: solution.nonce,
                powHash: solution.hash,
            });

            expect(verification.success).toBe(true);
        });

        it('rejects submissions with missing or invalid proof-of-work telemetry', async () => {
            // Missing pow
            const missingRes = await antiBotService.verify({
                honeypot: '',
                mountedAt: Date.now() - 2000,
                powChallenge: '',
                powNonce: 0,
                powHash: '',
            });
            expect(missingRes.success).toBe(false);
            if (!isOk(missingRes)) {
                expect(missingRes.error.field).toBe('pow');
            }

            // Invalid solution hash
            const invalidRes = await antiBotService.verify({
                honeypot: '',
                mountedAt: Date.now() - 2000,
                powChallenge: 'valid-challenge-string',
                powNonce: 42,
                powHash: '999invalidhash123456',
            });
            expect(invalidRes.success).toBe(false);
            if (!isOk(invalidRes)) {
                expect(invalidRes.error.field).toBe('pow');
            }

            // Turnstile detection functions
            expect(typeof isTurnstileEnabled()).toBe('boolean');
            expect(getTurnstileSiteKey() === null || typeof getTurnstileSiteKey() === 'string').toBe(true);
        });
    });

    describe('5. Two-Factor Authentication (2FA) & Brute-Force Lockout', () => {
        it('triggers requiresTwoFactor flag on signIn when TOTP is active', async () => {
            const sbAuth = new SupabaseAuthProvider();
            const email = 'totp.user@example.com';
            const password = 'Strong-Password-2026!#';

            // Enroll TOTP
            const enrollment = await totpService.initEnrollment(email);
            const code = await generateTotpCode(enrollment.secret);
            await totpService.confirmEnrollment(enrollment.secret, code, enrollment.hashedBackupCodes);
            expect(await totpService.isEnabled()).toBe(true);

            // Mock Supabase signIn
            vi.spyOn(supabaseClient, 'signInWithPassword').mockResolvedValue({
                accessToken: 'test-token',
                refreshToken: 'test-refresh',
                expiresAt: Date.now() + 3600000,
                user: { id: 'usr-totp-1', email, email_confirmed_at: new Date().toISOString() },
            });

            const signInRes = await sbAuth.signIn(email, password);
            expect(signInRes.requiresTwoFactor).toBe(true);
            expect(signInRes.tempUserId).toBe('usr-totp-1');
        });

        it('verifies second factor with valid TOTP code or emergency backup code', async () => {
            const sbAuth = new SupabaseAuthProvider();
            const email = 'totp.verify@example.com';

            const user: User = {
                id: 'usr-totp-2',
                name: 'TOTP User',
                email,
                avatar: '/avatar.jpg',
                preferences: { theme: 'night', currency: 'EUR', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
                xp: 0,
                level: 1,
            };
            await userRepository.saveUser(user);

            const enrollment = await totpService.initEnrollment(email);
            const currentCode = await generateTotpCode(enrollment.secret);
            await totpService.confirmEnrollment(enrollment.secret, currentCode, enrollment.hashedBackupCodes);

            // Verify with backup code
            const backupCode = enrollment.plainBackupCodes[0];
            const result = await sbAuth.verifySecondFactor(backupCode);
            expect(result.user.email).toBe(email);

            // Ensure audit log recorded
            const logs = await auditLogService.getEntries(5);
            expect(logs.some(l => l.event === 'totp_verified')).toBe(true);
        });

        it('enforces lockout after 3 consecutive failed attempts in cloud mode', async () => {
            const sbAuth = new SupabaseAuthProvider();
            expect(sbAuth.getLockoutRemainingSeconds()).toBe(0);

            vi.spyOn(supabaseClient, 'signInWithPassword').mockRejectedValue(new Error('Invalid login credentials'));

            // 2 failures do not lock out
            await expect(sbAuth.signIn('fail@example.com', 'bad1')).rejects.toThrow();
            await expect(sbAuth.signIn('fail@example.com', 'bad2')).rejects.toThrow();
            expect(sbAuth.getLockoutRemainingSeconds()).toBe(0);

            // 3rd failure locks out
            await expect(sbAuth.signIn('fail@example.com', 'bad3')).rejects.toThrow();
            expect(sbAuth.getLockoutRemainingSeconds()).toBeGreaterThan(0);
        });
    });
});
