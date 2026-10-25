import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LocalAuthProvider, SupabaseAuthProvider, createAuthProvider } from '../../../../src/services/security/authService';
import { createBackingStorage } from '../../../../src/services/storage/storageFactory';
import { SyncedBackingStorageProvider } from '../../../../src/services/storage/SyncedBackingStorageProvider';
import { vaultService } from '../../../../src/services/security/vaultService';
import { userRepository } from '../../../../src/services/repositories';
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';
import type { User } from '../../../../src/types/domain';
import { mockRemoteVault } from '../../helpers/remoteVault';

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

        // A real local vault is the only copy of its data: it is never silently replaced
        await expect(auth.signUp('tets@example.com', strongPassword, 'Tets Cloud')).rejects.toThrow(/already exists/i);
        expect(vaultService.isDemoVault()).toBe(false);

        const replaced = await auth.setupLocalVault('Tets Again', strongPassword, { overwriteExisting: true });
        expect(replaced.user.name).toBe('Tets Again');
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

        // 2. The demo never replaces a real local vault
        await expect(auth.signIn('demo@glassfolio.com', 'password')).rejects.toThrow(/already exists/i);
        expect(vaultService.isDemoVault()).toBe(false);

        // 3. Without a real vault, demo sign in creates a demo vault with isDemo = true
        await vaultService.resetVault();
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
        mockRemoteVault();

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
            mockRemoteVault();
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
            vi.spyOn(supabaseClient, 'updateUser').mockResolvedValue({} as any);

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

        it('signs in cloud user and synchronizes authProvider and emailVerified on existing user record', async () => {
            const strongPassword = 'MasterPassword2026!#';
            vi.spyOn(supabaseClient, 'signInWithPassword').mockResolvedValue({
                accessToken: 'test-token',
                refreshToken: 'test-refresh',
                expiresAt: Date.now() + 3600000,
                user: {
                    id: 'sb-sync-user',
                    email: 'sync@glassfolio.com',
                    email_confirmed_at: new Date().toISOString(),
                    user_metadata: { name: 'Sync User' },
                },
            });
            await userRepository.saveUser({
                id: 'local-1',
                name: 'Sync User',
                email: 'sync@glassfolio.com',
                avatar: '/avatar.jpg',
                preferences: { theme: 'night', currency: 'EUR', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
                xp: 0,
                level: 1,
                authProvider: 'local',
                emailVerified: false,
            });
            vi.spyOn(vaultService, 'isInitialized').mockReturnValue(true);
            vi.spyOn(vaultService, 'isUnlocked').mockReturnValue(false);
            vi.spyOn(vaultService, 'unlock').mockResolvedValue({ authKey: new Uint8Array(32) });

            const result = await sbAuth.signIn('sync@glassfolio.com', strongPassword);
            expect(result.user.authProvider).toBe('email');
            expect(result.user.emailVerified).toBe(true);
            const saved = await userRepository.getUser();
            expect(saved?.authProvider).toBe('email');
            expect(saved?.emailVerified).toBe(true);
        });

        it('handles signIn error and registers failure lockout', async () => {
            vi.spyOn(supabaseClient, 'signInWithPassword').mockRejectedValue(new Error('Invalid login credentials'));
            await expect(sbAuth.signIn('wrong@glassfolio.com', 'badpass')).rejects.toThrow('Invalid login credentials');
        });

        it('redirects to OAuth URL when Supabase is configured', async () => {
            vi.spyOn(supabaseClient, 'prepareOAuthPkceUrl').mockResolvedValue('https://supabase.example.com/oauth/google');
            const redirectSpy = vi.spyOn(sbAuth as any, 'redirectToUrl').mockImplementation(() => {});

            const supabaseConfigModule = await import('../../../../src/services/supabase/supabaseClient');
            vi.spyOn(supabaseConfigModule, 'isSupabaseConfigured').mockReturnValue(true);

            sbAuth.signInWithOAuth('google');
            await new Promise((r) => setTimeout(r, 0));
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

        it('removes an expired session that cannot be refreshed, keeps a refreshable one', () => {
            const expiredSession = {
                accessToken: 'stored-token',
                refreshToken: '',
                expiresAt: Date.now() - 60000,
                user: { id: 'u-123' },
            };
            localStorage.setItem('gf_sb_session', JSON.stringify(expiredSession));

            const newAuth = new SupabaseAuthProvider();
            expect((newAuth as any).supabaseSession).toBeNull();
            expect(localStorage.getItem('gf_sb_session')).toBeNull();

            localStorage.setItem('gf_sb_session', JSON.stringify({ ...expiredSession, refreshToken: 'stored-ref' }));
            const refreshable = new SupabaseAuthProvider();
            expect((refreshable as any).supabaseSession?.refreshToken).toBe('stored-ref');
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

        it('handles successful handleOAuthCallback with PKCE code in window.location.search', async () => {
            delete (window as any).location;
            window.location = new URL('http://localhost:3000/?code=valid-pkce-code') as any;

            vi.spyOn(supabaseClient, 'exchangePkceCode').mockResolvedValue({
                accessToken: 'pkce-access-tok',
                refreshToken: 'pkce-refresh-tok',
                expiresAt: Date.now() + 3600000,
                user: { id: 'sb-pkce-1', email: 'pkce@gmail.com', user_metadata: { name: 'PKCE User' } },
            });
            vi.spyOn(supabaseClient, 'getUser').mockResolvedValue({
                id: 'sb-pkce-1',
                email: 'pkce@gmail.com',
                user_metadata: { name: 'PKCE User' },
            });

            const res = await sbAuth.handleOAuthCallback();
            expect(res).not.toBeNull();
            expect(res?.user.email).toBe('pkce@gmail.com');
            expect(res?.user.authProvider).toBe('google');
        });

        it('handles successful handleOAuthCallback with PKCE code in window.location.hash', async () => {
            delete (window as any).location;
            window.location = new URL('http://localhost:3000/#/login?code=valid-hash-code') as any;

            vi.spyOn(supabaseClient, 'exchangePkceCode').mockResolvedValue({
                accessToken: 'pkce-hash-tok',
                refreshToken: 'pkce-hash-ref',
                expiresAt: Date.now() + 3600000,
                user: { id: 'sb-pkce-2', email: 'hash@gmail.com', user_metadata: { name: 'Hash User' } },
            });
            vi.spyOn(supabaseClient, 'getUser').mockResolvedValue({
                id: 'sb-pkce-2',
                email: 'hash@gmail.com',
                user_metadata: { name: 'Hash User' },
            });

            const res = await sbAuth.handleOAuthCallback();
            expect(res).not.toBeNull();
            expect(res?.user.email).toBe('hash@gmail.com');
            expect(res?.user.authProvider).toBe('google');
        });

        it('handles PKCE exchange failure gracefully without throwing', async () => {
            delete (window as any).location;
            window.location = new URL('http://localhost:3000/?code=bad-pkce-code') as any;

            vi.spyOn(supabaseClient, 'exchangePkceCode').mockRejectedValue(new Error('Invalid PKCE'));
            const res = await sbAuth.handleOAuthCallback();
            expect(res).toBeNull();
        });

        it('blocks OAuth login and prevents account conflict if vault has password auth', async () => {
            window.location.hash = '#access_token=conflict-tok&refresh_token=conflict-ref&expires_in=3600';
            vi.spyOn(supabaseClient, 'getUser').mockResolvedValue({
                id: 'sb-conflict-1',
                email: 'conflict@example.com',
                user_metadata: { name: 'Conflict User' },
            });
            vi.spyOn(vaultService, 'isDemoVault').mockReturnValue(false);
            vi.spyOn(vaultService, 'isInitialized').mockReturnValue(true);
            const wrapped = { alg: 'AES-KW' as const, wrapped: 'wrapped', createdAt: new Date().toISOString() };
            vi.spyOn(vaultService, 'getVaultHeader').mockReturnValue({
                version: 1,
                authProvider: 'email',
                kdf: { algorithm: 'pbkdf2-sha256', iterations: 600000, salt: 'saltsalt' },
                dekAlgorithm: 'AES-256-GCM',
                wrappedKeys: {
                    password: wrapped,
                    recovery: wrapped,
                    passkeys: [],
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dekCreatedAt: new Date().toISOString(),
            });

            await expect(sbAuth.handleOAuthCallback()).rejects.toThrow(/already exists with this email address/i);
        });

        it('handles handleOAuthCallback when unlockOAuthVault fails by recreating a clean OAuth vault', async () => {
            window.location.hash = '#access_token=oauth-tok-recover&refresh_token=oauth-ref-recover&expires_in=3600';
            vi.spyOn(supabaseClient, 'getUser').mockResolvedValue({
                id: 'sb-recover-1',
                email: 'recover@gmail.com',
                user_metadata: { name: 'Recover User', avatar_url: 'https://avatar.google.com/pic' },
            });
            vi.spyOn(vaultService, 'isDemoVault').mockReturnValue(false);
            vi.spyOn(vaultService, 'isInitialized').mockReturnValue(true);
            vi.spyOn(vaultService, 'isUnlocked').mockReturnValue(false);
            const wrapped = { alg: 'AES-KW' as const, wrapped: 'wrapped', createdAt: new Date().toISOString() };
            vi.spyOn(vaultService, 'getVaultHeader').mockReturnValue({
                version: 1,
                authProvider: 'google',
                kdf: { algorithm: 'pbkdf2-sha256', iterations: 600000, salt: 'saltsalt' },
                dekAlgorithm: 'AES-256-GCM',
                wrappedKeys: {
                    password: wrapped,
                    recovery: null,
                    passkeys: [],
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dekCreatedAt: new Date().toISOString(),
            });
            const unlockSpy = vi.spyOn(vaultService, 'unlockOAuthVault').mockRejectedValue(new Error('Corrupted vault'));
            const resetSpy = vi.spyOn(vaultService, 'resetVault').mockResolvedValue();
            const setupSpy = vi.spyOn(vaultService, 'setupOAuthVault').mockResolvedValue();

            const res = await sbAuth.handleOAuthCallback();
            expect(unlockSpy).toHaveBeenCalled();
            expect(resetSpy).toHaveBeenCalled();
            expect(setupSpy).toHaveBeenCalled();
            expect(res?.user.email).toBe('recover@gmail.com');
        });

        it('updates user avatar if Google OAuth returns an updated avatar', async () => {
            window.location.hash = '#access_token=oauth-avatar-tok&refresh_token=oauth-avatar-ref&expires_in=3600';
            vi.spyOn(supabaseClient, 'getUser').mockResolvedValue({
                id: 'sb-avatar-1',
                email: 'avatar@gmail.com',
                user_metadata: { name: 'Avatar User', avatar_url: 'https://new-avatar.com/photo.png' },
            });
            await userRepository.saveUser({
                id: 'sb-avatar-1',
                name: 'Avatar User',
                email: 'avatar@gmail.com',
                avatar: 'https://old-avatar.com/photo.png',
                preferences: { theme: 'night', currency: 'EUR', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
                xp: 0,
                level: 1,
                authProvider: 'google',
            });
            vi.spyOn(vaultService, 'isDemoVault').mockReturnValue(false);
            vi.spyOn(vaultService, 'isInitialized').mockReturnValue(true);
            vi.spyOn(vaultService, 'isUnlocked').mockReturnValue(true);

            const res = await sbAuth.handleOAuthCallback();
            expect(res?.user.avatar).toBe('https://new-avatar.com/photo.png');
        });

        it('resets existing vault on signup if vault is already initialized', async () => {
            vi.spyOn(supabaseClient, 'signUp').mockResolvedValue({
                accessToken: 'signup-tok',
                refreshToken: 'signup-ref',
                expiresAt: Date.now() + 3600000,
                user: { id: 'sb-signup-init', email: 'init@example.com', email_confirmed_at: '2026-01-01' },
            });
            vi.spyOn(vaultService, 'isInitialized').mockReturnValue(true);
            const resetSpy = vi.spyOn(vaultService, 'resetVault').mockResolvedValue();
            vi.spyOn(vaultService, 'setup').mockResolvedValue({ success: true, recoveryKey: 'key' } as any);
            vi.spyOn(supabaseClient, 'updateUser').mockResolvedValue({} as any);

            await sbAuth.signUp('init@example.com', 'ValidPass2026!#$', 'Init User');
            expect(resetSpy).toHaveBeenCalled();
        });

        it('handles changePassword with validation and updates Supabase', async () => {
            const user: User = {
                id: 'u-pw-1',
                name: 'PW User',
                email: 'pw@example.com',
                avatar: '/avatar.jpg',
                preferences: { theme: 'night', currency: 'EUR', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
                xp: 0,
                level: 1,
                authProvider: 'email',
            };
            await userRepository.saveUser(user);

            // Google account rejected
            const googleUser: User = { ...user, authProvider: 'google' };
            await userRepository.saveUser(googleUser);
            await expect(sbAuth.changePassword('old', 'new')).rejects.toThrow(/google/i);

            // Back to email user
            await userRepository.saveUser(user);

            // Weak new password
            await expect(sbAuth.changePassword('old', 'weak')).rejects.toThrow(/NIST/i);

            // Invalid current password
            vi.spyOn(vaultService, 'verifyPassword').mockResolvedValue(false);
            await expect(sbAuth.changePassword('wrong', 'Strong-Master-Key-2026!#')).rejects.toThrow(/current password/i);

            // Valid password change: Supabase first, vault re-wrap second
            vi.spyOn(vaultService, 'verifyPassword').mockResolvedValue(true);
            const vaultChange = vi.spyOn(vaultService, 'changePassword').mockResolvedValue(undefined);
            const updateSpy = vi.spyOn(supabaseClient, 'updateUser').mockResolvedValue({} as any);
            (sbAuth as any).supabaseSession = { accessToken: 'live-tok', expiresAt: Date.now() + 3600000, user: { id: 'u-pw-1' } };
            await sbAuth.changePassword('old-good', 'Strong-Master-Key-2026!#');
            expect(updateSpy).toHaveBeenCalledWith('live-tok', { password: 'Strong-Master-Key-2026!#' });
            expect(updateSpy.mock.invocationCallOrder[0]).toBeLessThan(vaultChange.mock.invocationCallOrder[0]);

            // A vault failure puts the old password back on Supabase
            vaultChange.mockRejectedValueOnce(new Error('disk full'));
            await expect(sbAuth.changePassword('old-good', 'Strong-Master-Key-2026!#')).rejects.toThrow('disk full');
            expect(updateSpy).toHaveBeenLastCalledWith('live-tok', { password: 'old-good' });
        });

        it('handles changeEmail with validation and security restrictions', async () => {
            const user: User = {
                id: 'u-em-1',
                name: 'Email User',
                email: 'old@example.com',
                avatar: '/avatar.jpg',
                preferences: { theme: 'night', currency: 'EUR', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
                xp: 0,
                level: 1,
                authProvider: 'email',
            };
            await userRepository.saveUser(user);

            // Google user locked
            await userRepository.saveUser({ ...user, authProvider: 'google' });
            await expect(sbAuth.changeEmail('password', 'new@example.com')).rejects.toThrow(/google/i);

            // Invalid email address format
            await userRepository.saveUser(user);
            await expect(sbAuth.changeEmail('password', 'invalid-email-address')).rejects.toThrow(/valid email/i);

            // Email user - incorrect password
            await userRepository.saveUser(user);
            vi.spyOn(vaultService, 'verifyPassword').mockResolvedValue(false);
            await expect(sbAuth.changeEmail('wrong-pass', 'new@example.com')).rejects.toThrow(/password/i);

            // Active session required
            vi.spyOn(vaultService, 'verifyPassword').mockResolvedValue(true);
            (sbAuth as any).supabaseSession = null;
            await expect(sbAuth.changeEmail('correct-pass', 'new@example.com')).rejects.toThrow(/session/i);

            // Successful email change initiation
            const updateSpy = vi.spyOn(supabaseClient, 'updateUser').mockResolvedValue({} as any);
            (sbAuth as any).supabaseSession = { accessToken: 'tok-email', expiresAt: Date.now() + 3600000, user: { id: 'u-em-1' } };

            await sbAuth.changeEmail('correct-pass', 'new@example.com');
            expect(updateSpy).toHaveBeenCalledWith('tok-email', { email: 'new@example.com' });
        });

        it('handles recoverPassword with active session and password rotation', async () => {
            // Weak password
            await expect(sbAuth.recoverPassword('valid-key', 'weak')).rejects.toThrow(/NIST/i);

            // Recovery failed
            vi.spyOn(vaultService, 'recoverPasswordWithRecoveryKey').mockResolvedValue({
                success: false,
                error: { message: 'Corrupt slot' },
            } as any);
            await expect(sbAuth.recoverPassword('bad-key', 'Strong-Master-Key-2026!#')).rejects.toThrow(/Corrupt slot/i);

            // Recovery success with session update
            vi.spyOn(vaultService, 'recoverPasswordWithRecoveryKey').mockResolvedValue({
                success: true,
                value: { newRecoveryKey: 'NEW-ROTATED-KEY-1234' },
            } as any);
            const updateSpy = vi.spyOn(supabaseClient, 'updateUser').mockResolvedValue({} as any);
            (sbAuth as any).supabaseSession = { accessToken: 'session-tok', expiresAt: Date.now() + 3600000, user: { id: 'u-1' } };

            const res = await sbAuth.recoverPassword('good-key', 'Strong-Master-Key-2026!#');
            expect(res.newRecoveryKey).toBe('NEW-ROTATED-KEY-1234');
            expect(updateSpy).toHaveBeenCalled();
        });

        it('handles resendEmailVerification and verifyEmailOtp', async () => {
            // Resend email verification without email or session throws
            (sbAuth as any).supabaseSession = null;
            await expect(sbAuth.resendEmailVerification()).rejects.toThrow(/required/i);

            const resendSpy = vi.spyOn(supabaseClient, 'resendVerificationEmail').mockResolvedValue();
            await sbAuth.resendEmailVerification('verify@example.com');
            expect(resendSpy).toHaveBeenCalledWith('verify@example.com');

            // verifyEmailOtp
            vi.spyOn(supabaseClient, 'verifyEmailOtp').mockResolvedValue({
                accessToken: 'otp-access',
                refreshToken: 'otp-refresh',
                expiresAt: Date.now() + 3600000,
                user: { id: 'otp-user-1', email: 'verified@example.com', user_metadata: { name: 'Verified' } },
            });

            await userRepository.clearUser();
            const result = await sbAuth.verifyEmailOtp('verified@example.com', '123456');
            expect(result.user.emailVerified).toBe(true);
            expect(result.user.email).toBe('verified@example.com');

            // verifyEmailOtp when user already exists
            const existingUser: User = {
                id: 'otp-user-1',
                name: 'Verified Existing',
                email: 'verified@example.com',
                avatar: '/avatar.jpg',
                preferences: { theme: 'night', currency: 'EUR', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
                xp: 100,
                level: 2,
                authProvider: 'email',
                emailVerified: false,
            };
            await userRepository.saveUser(existingUser);
            const resultExisting = await sbAuth.verifyEmailOtp('verified@example.com', '123456');
            expect(resultExisting.user.emailVerified).toBe(true);

            // test redirectToUrl
            const assignSpy = vi.fn();
            Object.defineProperty(window, 'location', {
                value: { assign: assignSpy, hash: '' },
                writable: true,
            });
            (sbAuth as any).redirectToUrl('https://supabase.co/oauth');
            expect(assignSpy).toHaveBeenCalledWith('https://supabase.co/oauth');
        });

        it('handles requestPasswordReset', async () => {
            const resetSpy = vi.spyOn(supabaseClient, 'resetPasswordForEmail').mockResolvedValue();
            await sbAuth.requestPasswordReset('forgot@example.com');
            expect(resetSpy).toHaveBeenCalledWith('forgot@example.com', undefined);
        });

        it('exercises LocalAuthProvider implementation of new Epic 20 methods', async () => {
            const local = new LocalAuthProvider();
            await local.requestPasswordReset('local@example.com');
            // Local mode has no email channel: verification never pretends to succeed
            await expect(local.resendEmailVerification()).rejects.toThrow(/not available in local mode/i);
            await expect(local.verifyEmailTokenHash('any-hash')).rejects.toThrow(/not available in local mode/i);

            const dummyUser: User = {
                id: 'loc-1',
                name: 'Local',
                email: 'local@example.com',
                avatar: '/a.png',
                preferences: { theme: 'night', currency: 'EUR', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
                xp: 0,
                level: 1,
            };
            await userRepository.saveUser(dummyUser);

            await expect(local.verifyEmailOtp('local@example.com', '123456')).rejects.toThrow(/not available in local mode/i);

            // changePassword weak
            await expect(local.changePassword('old', 'weak')).rejects.toThrow(/NIST/i);

            // changePassword wrong old
            vi.spyOn(vaultService, 'changePassword').mockRejectedValue(new Error('Current password verification failed.'));
            await expect(local.changePassword('wrong', 'Strong-Master-Key-2026!#')).rejects.toThrow(/password/i);

            // changePassword success
            vi.spyOn(vaultService, 'verifyPassword').mockResolvedValue(true);
            vi.spyOn(vaultService, 'changePassword').mockResolvedValue(undefined);
            await local.changePassword('correct', 'Strong-Master-Key-2026!#');

            // changeEmail
            await expect(local.changeEmail('pass', 'bad-email')).rejects.toThrow(/valid email/i);
            await local.changeEmail('pass', 'newlocal@example.com');
            const updated = await userRepository.getUser();
            expect(updated?.email).toBe('newlocal@example.com');

            // recoverPassword
            vi.spyOn(vaultService, 'recoverPasswordWithRecoveryKey').mockResolvedValue({
                success: true,
                value: { newRecoveryKey: 'NEW-LOCAL-REC-1234' },
            } as any);
            const recRes = await local.recoverPassword('key', 'Strong-Master-Key-2026!#');
            expect(recRes.newRecoveryKey).toBe('NEW-LOCAL-REC-1234');

            // deleteAccountPermanently - wrong password
            vi.spyOn(vaultService, 'isInitialized').mockReturnValue(true);
            vi.spyOn(vaultService, 'verifyPassword').mockResolvedValue(false);
            await expect(local.deleteAccountPermanently({ password: 'wrong' })).rejects.toThrow(/master password/i);

            // deleteAccountPermanently - success
            vi.spyOn(vaultService, 'verifyPassword').mockResolvedValue(true);
            const resetSpy = vi.spyOn(vaultService, 'resetVault').mockResolvedValue(undefined);
            await local.deleteAccountPermanently({ password: 'correct' });
            expect(resetSpy).toHaveBeenCalled();
            expect(await userRepository.getUser()).toBeNull();
        });

        it('handles deleteAccountPermanently for SupabaseAuthProvider (Email and Google OAuth)', async () => {
            const provider = new SupabaseAuthProvider();
            (provider as any).supabaseSession = { accessToken: 'mock-access-token', expiresAt: Date.now() + 3600000, user: { id: 'cloud-u1' } };
            vi.spyOn(vaultService, 'resetVault').mockResolvedValue(undefined);
            const deleteRpcSpy = vi.spyOn(supabaseClient, 'deleteOwnAccount').mockResolvedValue(undefined);

            // 1. Email account without password
            await userRepository.saveUser({
                id: 'cloud-u1',
                email: 'cloud@example.com',
                name: 'Cloud User',
                authProvider: 'email',
                preferences: { theme: 'night', currency: 'EUR', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
                xp: 0,
                level: 1,
            });
            await expect(provider.deleteAccountPermanently({})).rejects.toThrow(/Password is required/i);

            // 2. Email account with invalid password
            vi.spyOn(vaultService, 'isInitialized').mockReturnValue(true);
            vi.spyOn(vaultService, 'verifyPassword').mockResolvedValue(false);
            await expect(provider.deleteAccountPermanently({ password: 'bad' })).rejects.toThrow(/master password/i);

            // 3. Email account with valid password
            vi.spyOn(vaultService, 'verifyPassword').mockResolvedValue(true);
            await provider.deleteAccountPermanently({ password: 'valid-password' });
            expect(deleteRpcSpy).toHaveBeenCalled();
            expect(await userRepository.getUser()).toBeNull();

            // 4. Google account with invalid confirmation text
            await userRepository.saveUser({
                id: 'cloud-g1',
                email: 'google@example.com',
                name: 'Google User',
                authProvider: 'google',
                preferences: { theme: 'night', currency: 'EUR', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
                xp: 0,
                level: 1,
            });
            await expect(provider.deleteAccountPermanently({ confirmationText: 'NON' })).rejects.toThrow(/Confirmation text must match/i);

            // 5. Google account with valid confirmation text (DELETE / SUPPRIMER)
            (provider as any).supabaseSession = { accessToken: 'mock-access-token', expiresAt: Date.now() + 3600000, user: { id: 'cloud-g1' } };
            await provider.deleteAccountPermanently({ confirmationText: 'SUPPRIMER' });
            expect(await userRepository.getUser()).toBeNull();

            // 6. A refused RPC (e.g. no recent sign-in) wipes nothing locally
            await userRepository.saveUser({
                id: 'cloud-g1',
                email: 'google@example.com',
                name: 'Google User',
                authProvider: 'google',
                preferences: { theme: 'night', currency: 'EUR', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
                xp: 0,
                level: 1,
            });
            (provider as any).supabaseSession = { accessToken: 'mock-access-token', expiresAt: Date.now() + 3600000, user: { id: 'cloud-g1' } };
            deleteRpcSpy.mockRejectedValueOnce(new Error('reauthentication_required'));
            await expect(provider.deleteAccountPermanently({ confirmationText: 'DELETE' })).rejects.toThrow('reauthentication_required');
            expect(await userRepository.getUser()).not.toBeNull();
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
            expect(createAuthProvider('local')).toBeInstanceOf(LocalAuthProvider);
        });
    });
});
