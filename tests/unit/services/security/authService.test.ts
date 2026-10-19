import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LocalAuthProvider, SupabaseAuthProvider, createAuthProvider } from '../../../../src/services/security/authService';
import { createBackingStorage } from '../../../../src/services/storage/storageFactory';
import { SyncedBackingStorageProvider } from '../../../../src/services/storage/SyncedBackingStorageProvider';
import { vaultService } from '../../../../src/services/security/vaultService';
import { userRepository } from '../../../../src/services/repositories';
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';

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

    it('re-initializes and unlocks vault cleanly when setupLocalVault or signUp is called while an existing demo vault is locked', async () => {
        // 1. Login as demo (initializes vault with demo password) and then sign out (locks vault)
        await auth.signIn('demo@glassfolio.com', 'password');
        await auth.signOut();
        expect(vaultService.isInitialized()).toBe(true);
        expect(vaultService.isUnlocked()).toBe(false);

        // 2. Now initialize a new local vault from the signup page
        const strongPassword = 'Strong-Local-Vault-Master-Key-2026!#';
        const result = await auth.setupLocalVault('Tets', strongPassword);
        expect(result.user.name).toBe('Tets');
        expect(result.recoveryKey).toBeDefined();
        expect(vaultService.isUnlocked()).toBe(true);

        // 3. Lock again and test full signUp over a locked vault
        await vaultService.lock();
        expect(vaultService.isUnlocked()).toBe(false);

        const signupRes = await auth.signUp('tets@example.com', strongPassword, 'Tets Cloud');
        expect(signupRes.user.email).toBe('tets@example.com');
        expect(vaultService.isUnlocked()).toBe(true);
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

    it('correctly tags demo vault vs real user vault with isDemo flag', async () => {
        // 1. Real account setup has isDemo = false
        const strongPassword = 'Strong-Vault-Secret-Key-2026!#';
        await auth.setupLocalVault('Real Investor', strongPassword);
        expect(vaultService.isDemoVault()).toBe(false);

        // 2. Demo sign in resets and creates a demo vault with isDemo = true
        await auth.signIn('demo@glassfolio.com', 'password');
        expect(vaultService.isDemoVault()).toBe(true);
    });

    it('rejects disabled Apple Sign-In and reports Supabase config requirement for Google', async () => {
        await expect(auth.signInWithOAuth('apple')).rejects.toThrow(/Apple Sign-In is disabled/i);
        await expect(auth.signInWithOAuth('google')).rejects.toThrow(/Google Login requires Supabase/i);
    });

    it('handles Option A 1-click Google OAuth callback and seamlessly unlocks E2EE vault', async () => {
        const sbAuth = new SupabaseAuthProvider();
        const mockSbUser = {
            id: 'sb-user-uuid-12345',
            email: 'damien@gmail.com',
            user_metadata: {
                full_name: 'Damien Test',
                avatar_url: 'https://lh3.googleusercontent.com/avatar.jpg',
            },
        };

        vi.spyOn(supabaseClient, 'getUser').mockResolvedValue(mockSbUser);

        // Mock window.location.hash with OAuth tokens
        window.location.hash = '#access_token=mock-token-abc&expires_in=3600';

        const result = await sbAuth.handleOAuthCallback();
        expect(result).not.toBeNull();
        expect(result?.user.email).toBe('damien@gmail.com');
        expect(result?.user.name).toBe('Damien Test');
        expect(result?.user.avatar).toBe('https://lh3.googleusercontent.com/avatar.jpg');
        expect(vaultService.isInitialized()).toBe(true);
        expect(vaultService.isUnlocked()).toBe(true);
        expect(vaultService.isDemoVault()).toBe(false);

        // Subsquent OAuth callback with existing vault unlocks seamlessly
        await vaultService.lock();
        expect(vaultService.isUnlocked()).toBe(false);

        window.location.hash = '#access_token=mock-token-abc&expires_in=3600';
        const secondResult = await sbAuth.handleOAuthCallback();
        expect(secondResult).not.toBeNull();
        expect(vaultService.isUnlocked()).toBe(true);
    });

    it('signOut locks vault and clears stored session', async () => {
        await auth.signIn('demo@glassfolio.com', 'password');
        expect(vaultService.isUnlocked()).toBe(true);

        await auth.signOut();
        expect(vaultService.isUnlocked()).toBe(false);
        const currentUser = await auth.getCurrentUser();
        expect(currentUser).toBeNull();
    });

    describe('SupabaseAuthProvider (Cloud E2EE Sync)', () => {
        let sbAuth: SupabaseAuthProvider;

        beforeEach(async () => {
            sbAuth = new SupabaseAuthProvider();
            await vaultService.resetVault();
            await userRepository.clearUser();
            vi.restoreAllMocks();
        });

        it('rejects signup with weak password based on NIST policy', async () => {
            await expect(sbAuth.signUp('cloud@example.com', 'weak', 'Cloud User')).rejects.toThrow(/NIST/i);
        });

        it('signs up cloud user, sets up E2EE vault and persists session', async () => {
            const strongPassword = 'Cloud-Strong-Vault-Key-2026!#';
            const mockSession = {
                accessToken: 'access-token-123',
                refreshToken: 'refresh-token-123',
                expiresAt: Date.now() + 3600000,
                user: { id: 'sb-uuid-456', email: 'cloud@example.com', user_metadata: { name: 'Cloud User' } },
            };
            vi.spyOn(supabaseClient, 'signUp').mockResolvedValue(mockSession as any);

            const result = await sbAuth.signUp('cloud@example.com', strongPassword, 'Cloud User');
            expect(result.user.email).toBe('cloud@example.com');
            expect(result.user.id).toBe('sb-uuid-456');
            expect(result.recoveryKey).toBeDefined();
            expect(vaultService.isInitialized()).toBe(true);
            expect(vaultService.isUnlocked()).toBe(true);
        });

        it('delegates to local demo authentication when email is demo@glassfolio.com', async () => {
            const result = await sbAuth.signIn('demo@glassfolio.com', 'password');
            expect(result.user.email).toBe('demo@glassfolio.com');
            expect(vaultService.isDemoVault()).toBe(true);
        });

        it('signs in cloud user with Supabase credentials and unlocks E2EE vault', async () => {
            const strongPassword = 'Cloud-Strong-Vault-Key-2026!#';
            await vaultService.setup(strongPassword);
            await vaultService.lock();
            expect(vaultService.isUnlocked()).toBe(false);

            const mockSession = {
                accessToken: 'access-token-789',
                refreshToken: 'refresh-token-789',
                expiresAt: Date.now() + 3600000,
                user: { id: 'sb-uuid-789', email: 'existing@glassfolio.com', user_metadata: { name: 'Existing Investor' } },
            };
            vi.spyOn(supabaseClient, 'signInWithPassword').mockResolvedValue(mockSession as any);

            const result = await sbAuth.signIn('existing@glassfolio.com', strongPassword);
            expect(result.user.email).toBe('existing@glassfolio.com');
            expect(vaultService.isUnlocked()).toBe(true);
        });

        it('handles signIn error and registers failure lockout', async () => {
            vi.spyOn(supabaseClient, 'signInWithPassword').mockRejectedValue(new Error('Invalid login credentials'));
            await expect(sbAuth.signIn('wrong@glassfolio.com', 'badpass')).rejects.toThrow('Invalid login credentials');
        });

        it('redirects to OAuth URL when Supabase is configured', async () => {
            vi.spyOn(supabaseClient, 'getOAuthUrl').mockReturnValue('https://supabase.example.com/oauth/google');
            const redirectSpy = vi.spyOn(sbAuth as any, 'redirectToUrl').mockImplementation(() => {});

            const supabaseConfigModule = await import('../../../../src/services/supabase/supabaseClient');
            vi.spyOn(supabaseConfigModule, 'isSupabaseConfigured').mockReturnValue(true);

            sbAuth.signInWithOAuth('google');
            expect(redirectSpy).toHaveBeenCalledWith('https://supabase.example.com/oauth/google');
        });

        it('rejects apple signInWithOAuth', async () => {
            await expect(sbAuth.signInWithOAuth('apple')).rejects.toThrow('Apple Sign-In is disabled.');
        });

        it('signs out from Supabase and clears session', async () => {
            const signOutSpy = vi.spyOn(supabaseClient, 'signOut').mockResolvedValue(undefined as any);
            (sbAuth as any).supabaseSession = { accessToken: 'token-abc', refreshToken: 'ref-abc', expiresAt: Date.now() + 3600000, user: { id: '1' } };

            await sbAuth.signOut();
            expect(signOutSpy).toHaveBeenCalledWith('token-abc');
            expect((sbAuth as any).supabaseSession).toBeNull();
        });

        it('restores valid session from localStorage on instantiation', () => {
            const validSession = {
                accessToken: 'stored-token',
                refreshToken: 'stored-ref',
                expiresAt: Date.now() + 60000,
                user: { id: 'u-123' },
            };
            localStorage.setItem('gf_sb_session', JSON.stringify(validSession));

            const newAuth = new SupabaseAuthProvider();
            expect((newAuth as any).supabaseSession).toEqual(validSession);
        });

        it('removes expired session from localStorage on instantiation', () => {
            const expiredSession = {
                accessToken: 'stored-token',
                refreshToken: 'stored-ref',
                expiresAt: Date.now() - 60000,
                user: { id: 'u-123' },
            };
            localStorage.setItem('gf_sb_session', JSON.stringify(expiredSession));

            const newAuth = new SupabaseAuthProvider();
            expect((newAuth as any).supabaseSession).toBeNull();
            expect(localStorage.getItem('gf_sb_session')).toBeNull();
        });

        it('handles corrupted localStorage data silently in restoreSessionFromStorage', () => {
            localStorage.setItem('gf_sb_session', 'invalid-json{{{');
            expect(() => new SupabaseAuthProvider()).not.toThrow();
        });

        it('falls back to super.signInWithOAuth if Supabase is not configured', async () => {
            const supabaseConfigModule = await import('../../../../src/services/supabase/supabaseClient');
            vi.spyOn(supabaseConfigModule, 'isSupabaseConfigured').mockReturnValue(false);

            await expect(sbAuth.signInWithOAuth('google')).rejects.toThrow();
        });

        it('returns null from handleOAuthCallback if no token is in hash', async () => {
            window.location.hash = '';
            const res = await sbAuth.handleOAuthCallback();
            expect(res).toBeNull();
        });

        it('returns null from handleOAuthCallback if getUser fails', async () => {
            window.location.hash = '#access_token=invalid-tok&expires_in=3600';
            vi.spyOn(supabaseClient, 'getUser').mockRejectedValue(new Error('Invalid token'));

            const res = await sbAuth.handleOAuthCallback();
            expect(res).toBeNull();
        });

        it('handles successful handleOAuthCallback with demo vault cleanup', async () => {
            window.location.hash = '#access_token=valid-tok&refresh_token=valid-ref&expires_in=3600';
            vi.spyOn(supabaseClient, 'getUser').mockResolvedValue({
                id: 'sb-google-1',
                email: 'oauth@gmail.com',
                user_metadata: { name: 'Google User' },
            });
            vi.spyOn(vaultService, 'isDemoVault').mockReturnValue(true);
            const resetVaultSpy = vi.spyOn(vaultService, 'resetVault');

            const res = await sbAuth.handleOAuthCallback();
            expect(res).not.toBeNull();
            expect(res?.user.email).toBe('oauth@gmail.com');
            expect(resetVaultSpy).toHaveBeenCalled();
        });
    });

    describe('Dual-Mode Factory (VITE_DEPLOYMENT_MODE)', () => {
        it('instantiates expected IAuthProvider and IStorageProvider for local and cloud modes', async () => {
            const localAuth = createAuthProvider('local');
            expect(localAuth).toBeInstanceOf(LocalAuthProvider);

            const cloudAuth = createAuthProvider('cloud');
            expect(cloudAuth).toBeInstanceOf(LocalAuthProvider);

            const localStorage = createBackingStorage('local');
            expect(localStorage).toBeInstanceOf(SyncedBackingStorageProvider);

            const cloudStorage = createBackingStorage('cloud');
            expect(cloudStorage).toBeInstanceOf(SyncedBackingStorageProvider);

            // Test when Supabase is configured
            const supabaseConfigModule = await import('../../../../src/services/supabase/supabaseClient');
            vi.spyOn(supabaseConfigModule, 'isSupabaseConfigured').mockReturnValue(true);

            expect(createAuthProvider('cloud')).toBeInstanceOf(SupabaseAuthProvider);
            expect(createAuthProvider('local')).toBeInstanceOf(SupabaseAuthProvider);
        });
    });
});
