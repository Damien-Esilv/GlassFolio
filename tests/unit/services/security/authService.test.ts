import { describe, it, expect, beforeEach } from 'vitest';
import { LocalAuthProvider, createAuthProvider } from '../../../../src/services/security/authService';
import { createBackingStorage } from '../../../../src/services/storage/storageFactory';
import { SyncedBackingStorageProvider } from '../../../../src/services/storage/SyncedBackingStorageProvider';
import { vaultService } from '../../../../src/services/security/vaultService';
import { userRepository } from '../../../../src/services/repositories';

describe('authService & Access Control Security (TGLA-047)', () => {
    let auth: LocalAuthProvider;

    beforeEach(async () => {
        auth = new LocalAuthProvider();
        await vaultService.resetVault();
        await userRepository.clearUser();
    });

    it('rejects signup with weak password based on NIST SP 800-63B policy', async () => {
        await expect(
            auth.signUp('test@example.com', 'weak', 'Test User')
        ).rejects.toThrow(/NIST/i);
    });

    it('creates account and initializes encrypted vault on valid signup', async () => {
        const strongPassword = 'Strong-Vault-Secret-Key-2026!#';
        const result = await auth.signUp('alice@glassfolio.com', strongPassword, 'Alice Explorer');

        expect(result.user).toBeDefined();
        expect(result.user.email).toBe('alice@glassfolio.com');
        expect(result.user.name).toBe('Alice Explorer');
        expect(result.recoveryKey).toBeDefined();
        expect(typeof result.recoveryKey).toBe('string');
        expect(vaultService.isInitialized()).toBe(true);
        expect(vaultService.isUnlocked()).toBe(true);

        const current = await auth.getCurrentUser();
        expect(current?.email).toBe('alice@glassfolio.com');
    });

    it('sets up local vault directly without requiring an email address', async () => {
        const strongPassword = 'Strong-Local-Vault-Master-Key-2026!#';
        const result = await auth.setupLocalVault('Damien Investor', strongPassword);

        expect(result.user).toBeDefined();
        expect(result.user.name).toBe('Damien Investor');
        expect(result.user.email).toBe('local@glassfolio.vault');
        expect(result.recoveryKey).toBeDefined();
        expect(vaultService.isInitialized()).toBe(true);
        expect(vaultService.isUnlocked()).toBe(true);

        // Lock vault and test unlocking with master password
        await vaultService.lock();
        expect(vaultService.isUnlocked()).toBe(false);

        const unlockRes = await auth.unlockLocalVault(strongPassword);
        expect(unlockRes.user.name).toBe('Damien Investor');
        expect(vaultService.isUnlocked()).toBe(true);
    });

    it('rejects setupLocalVault with weak master password based on NIST policy', async () => {
        await expect(
            auth.setupLocalVault('Damien', 'weakpass')
        ).rejects.toThrow(/NIST/i);
    });

    it('handles demo user signIn and unlocks demo vault', async () => {
        const res = await auth.signIn('demo@glassfolio.com', 'password');
        expect(res.user.email).toBe('demo@glassfolio.com');
        expect(res.user.name).toBe('Thomas Martin');
        expect(res.user.avatar).toBe('/avatars/demo-user.jpg');
        expect(res.user.preferences?.fiscalProfile?.familyStatus).toBe('married');
        expect(res.user.preferences?.fiscalProfile?.fiscalShares).toBe(3);
        expect(vaultService.isInitialized()).toBe(true);
        expect(vaultService.isUnlocked()).toBe(true);
    });

    it('enforces brute-force lockout with exponential backoff after 5 consecutive failed attempts', async () => {
        expect(auth.getLockoutRemainingSeconds()).toBe(0);

        // 4 failed attempts do not lock out yet
        for (let i = 0; i < 4; i++) {
            await expect(auth.signIn('random@glassfolio.com', 'wrongpassword')).rejects.toThrow();
            expect(auth.getLockoutRemainingSeconds()).toBe(0);
        }

        // 5th failed attempt triggers lockout
        await expect(auth.signIn('random@glassfolio.com', 'wrongpassword')).rejects.toThrow();
        expect(auth.getLockoutRemainingSeconds()).toBeGreaterThan(0);

        // Immediate subsequent attempt fails fast due to active lockout
        await expect(auth.signIn('random@glassfolio.com', 'wrongpassword')).rejects.toThrow(/temporarily locked/i);
    });

    it('throws preview error for OAuth providers', async () => {
        await expect(auth.signInWithOAuth('google')).rejects.toThrow(/Google Login is currently in preview/i);
        await expect(auth.signInWithOAuth('apple')).rejects.toThrow(/Apple Sign-In is currently in preview/i);
    });

    it('signOut locks vault and clears stored session', async () => {
        await auth.signIn('demo@glassfolio.com', 'password');
        expect(vaultService.isUnlocked()).toBe(true);

        await auth.signOut();
        expect(vaultService.isUnlocked()).toBe(false);
        const currentUser = await auth.getCurrentUser();
        expect(currentUser).toBeNull();
    });

    describe('Dual-Mode Factory (VITE_DEPLOYMENT_MODE)', () => {
        it('instantiates expected IAuthProvider and IStorageProvider for local and cloud modes', () => {
            const localAuth = createAuthProvider('local');
            expect(localAuth).toBeInstanceOf(LocalAuthProvider);

            const cloudAuth = createAuthProvider('cloud');
            expect(cloudAuth).toBeInstanceOf(LocalAuthProvider);

            const localStorage = createBackingStorage('local');
            expect(localStorage).toBeInstanceOf(SyncedBackingStorageProvider);

            const cloudStorage = createBackingStorage('cloud');
            expect(cloudStorage).toBeInstanceOf(SyncedBackingStorageProvider);
        });
    });
});
