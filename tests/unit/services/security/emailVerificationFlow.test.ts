import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';
import { SupabaseAuthProvider } from '../../../../src/services/security/authService';
import { mockRemoteVault } from '../../helpers/remoteVault';
import { vaultService } from '../../../../src/services/security/vaultService';
import { userRepository } from '../../../../src/services/repositories';
import { appStorage } from '../../../../src/services/storage/appStorage';
import { PUBLIC_LANG_STORAGE_KEY } from '../../../../src/services/storage/storageKeys';

const STRONG_PASSWORD = 'Cloud-Strong-Vault-Key-2026!#';

const buildSession = (overrides: Record<string, unknown> = {}) => ({
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-123',
    expiresAt: Date.now() + 3_600_000,
    user: {
        id: 'sb-uuid-456',
        email: 'cloud@example.com',
        email_confirmed_at: '2026-10-23T10:00:00Z',
        user_metadata: { name: 'Cloud User' },
        ...overrides,
    },
});

describe('Branded email verification flow (Epic E25 — TGLA-085)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.stubEnv('VITE_SUPABASE_URL', 'https://mock-test.supabase.co');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'mock-anon-key-12345');
        process.env.VITE_SUPABASE_URL = 'https://mock-test.supabase.co';
        process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key-12345';
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        delete process.env.VITE_SUPABASE_URL;
        delete process.env.VITE_SUPABASE_ANON_KEY;
    });

    describe('supabaseClient', () => {
        it('sends the locale in signup metadata so emails are localized', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ user: { id: 'u1' } }),
            });
            vi.stubGlobal('fetch', mockFetch);

            await supabaseClient.signUp('a@b.co', STRONG_PASSWORD, 'Ana', { locale: 'fr' });

            const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { data: { name: string; locale: string } };
            expect(mockFetch.mock.calls[0][0]).toContain('/auth/v1/signup');
            expect(body.data).toEqual({ name: 'Ana', locale: 'fr', glassfolio_signup_state: 'pending' });
        });

        it('verifies a confirmation link token_hash via /auth/v1/verify', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    access_token: 'at',
                    refresh_token: 'rt',
                    expires_in: 3600,
                    user: { id: 'u1', email: 'a@b.co' },
                }),
            });
            vi.stubGlobal('fetch', mockFetch);

            const session = await supabaseClient.verifyTokenHash('hash-abc', 'signup');

            expect(mockFetch.mock.calls[0][0]).toContain('/auth/v1/verify');
            expect(JSON.parse(mockFetch.mock.calls[0][1].body as string)).toEqual({
                token_hash: 'hash-abc',
                type: 'signup',
            });
            expect(session.accessToken).toBe('at');
        });

        it('throws a readable error for an expired or invalid link', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue({ ok: false, json: async () => ({ msg: 'Token has expired or is invalid' }) })
            );
            await expect(supabaseClient.verifyTokenHash('bad')).rejects.toThrow('Token has expired or is invalid');
        });
    });

    describe('SupabaseAuthProvider', () => {
        let provider: SupabaseAuthProvider;

        beforeEach(async () => {
            provider = new SupabaseAuthProvider();
            await vaultService.resetVault();
            await userRepository.clearUser();
            appStorage.clear();
            mockRemoteVault();
        });

        it('passes the stored UI language to signUp as email locale', async () => {
            appStorage.setItem(PUBLIC_LANG_STORAGE_KEY, 'fr');
            const signUpSpy = vi.spyOn(supabaseClient, 'signUp').mockResolvedValue(buildSession() as never);
            vi.spyOn(supabaseClient, 'updateUser').mockResolvedValue({ id: 'sb-uuid-456' });

            await provider.signUp('cloud@example.com', STRONG_PASSWORD, 'Cloud User');

            expect(signUpSpy).toHaveBeenCalledWith(
                'cloud@example.com',
                STRONG_PASSWORD,
                'Cloud User',
                expect.objectContaining({ locale: 'fr' })
            );
        });

        it('verifyEmailTokenHash confirms the address without keeping a session or a profile', async () => {
            vi.spyOn(supabaseClient, 'verifyTokenHash').mockResolvedValue(buildSession() as never);

            const result = await provider.verifyEmailTokenHash('hash-abc', 'signup');

            expect(result).toEqual({ email: 'cloud@example.com', type: 'signup', hasSession: false });
            expect(supabaseClient.signOut).toHaveBeenCalledWith('access-token-123');
            expect(localStorage.getItem('gf_sb_session')).toBeNull();
            expect(await userRepository.getUser()).toBeNull();
            expect(vaultService.isInitialized()).toBe(false);
        });

        it('verifyEmailTokenHash for recovery keeps the active session for password reset', async () => {
            vi.spyOn(supabaseClient, 'verifyTokenHash').mockResolvedValue(buildSession() as never);

            const result = await provider.verifyEmailTokenHash('hash-rec', 'recovery');

            expect(result).toEqual({ email: 'cloud@example.com', type: 'recovery', hasSession: true });
            expect(provider.getSupabaseAccessToken()).toBe('access-token-123');
        });

        it('verifyEmailTokenHash for email_change handles initial confirmation without access token', async () => {
            const sessionWithoutToken = {
                ...buildSession(),
                accessToken: '',
                user: { ...buildSession().user, email: 'old@example.com', user_metadata: { new_email: 'new@example.com' } },
            };
            vi.spyOn(supabaseClient, 'verifyTokenHash').mockResolvedValue(sessionWithoutToken as never);

            const result = await provider.verifyEmailTokenHash('hash-ec-1', 'email_change');

            expect(result.type).toBe('email_change');
            expect(result.hasSession).toBe(false);
            expect(result.pendingEmail).toBe('new@example.com');
        });

        it('creates the vault with the in-memory password once the link was confirmed in another tab', async () => {
            vi.spyOn(supabaseClient, 'signUp').mockResolvedValue(buildSession({ email_confirmed_at: null }) as never);
            const signup = await provider.signUp('cloud@example.com', STRONG_PASSWORD, 'Cloud User');
            expect(signup.user.emailVerified).toBe(false);
            expect(vaultService.isInitialized()).toBe(false);

            const signInSpy = vi.spyOn(supabaseClient, 'signInWithPassword').mockResolvedValue(buildSession() as never);
            const updateSpy = vi.spyOn(supabaseClient, 'updateUser').mockResolvedValue({ id: 'sb-uuid-456' });
            const recoveryKey = await provider.continueSignupAfterLinkVerification();

            expect(signInSpy).toHaveBeenCalledWith('cloud@example.com', STRONG_PASSWORD);
            expect(updateSpy).toHaveBeenCalledWith('access-token-123', { password: STRONG_PASSWORD });
            expect(recoveryKey).toBeTruthy();
            expect(vaultService.getVaultHeader()?.authProvider).toBe('email');

            const completed = await provider.completePendingSignup();
            expect(completed.user.email).toBe('cloud@example.com');
            expect(supabaseClient.upsertVaultHeader).toHaveBeenCalled();
        });

        it('resumes a verified account whose vault was never finalized when it signs in', async () => {
            vi.spyOn(supabaseClient, 'signInWithPassword').mockResolvedValue(buildSession() as never);
            vi.spyOn(supabaseClient, 'updateUser')
                .mockRejectedValueOnce(new Error('New password should be different from the old password.'))
                .mockResolvedValue({ id: 'sb-uuid-456' });

            const result = await provider.signIn('cloud@example.com', STRONG_PASSWORD);
            expect(result.requiresSignupCompletion).toBe(true);
            expect(localStorage.getItem('gf_sb_session')).toBeNull();

            const recoveryKey = await provider.preparePendingSignup();
            expect(recoveryKey).toBeTruthy();
            const completed = await provider.completePendingSignup();
            expect(completed.user.id).toBe('sb-uuid-456');
            expect(localStorage.getItem('gf_sb_session')).not.toBeNull();
        });

        it('turns an unconfirmed address at sign-in into EmailNotConfirmedError and keeps the draft', async () => {
            vi.spyOn(supabaseClient, 'signInWithPassword').mockRejectedValue(new Error('Email not confirmed'));

            await expect(provider.signIn('cloud@example.com', STRONG_PASSWORD)).rejects.toMatchObject({ name: 'EmailNotConfirmedError' });
            expect(provider.getSignupDraftEmail()).toBe('cloud@example.com');
            expect(provider.getFailedAttemptsCount()).toBe(0);
        });

        it('cancelPendingSignup ends the session and drops the unpublished vault', async () => {
            vi.spyOn(supabaseClient, 'signUp').mockResolvedValue(buildSession({ email_confirmed_at: null }) as never);
            await provider.signUp('cloud@example.com', STRONG_PASSWORD, 'Cloud User');
            vi.spyOn(supabaseClient, 'signInWithPassword').mockResolvedValue(buildSession() as never);
            vi.spyOn(supabaseClient, 'updateUser').mockResolvedValue({ id: 'sb-uuid-456' });
            await provider.continueSignupAfterLinkVerification();
            expect(vaultService.isInitialized()).toBe(true);

            await provider.cancelPendingSignup();
            expect(supabaseClient.signOut).toHaveBeenCalledWith('access-token-123');
            expect(vaultService.isInitialized()).toBe(false);
            expect(provider.getSignupDraftEmail()).toBeNull();
        });

        it('syncEmailLocale pushes the locale to user metadata only when a session exists', async () => {
            const updateSpy = vi.spyOn(supabaseClient, 'updateUser').mockResolvedValue({ id: 'sb-uuid-456' });

            await provider.syncEmailLocale('fr');
            expect(updateSpy).not.toHaveBeenCalled();

            vi.spyOn(supabaseClient, 'signUp').mockResolvedValue(buildSession() as never);
            await provider.signUp('cloud@example.com', STRONG_PASSWORD, 'Cloud User');
            await provider.syncEmailLocale('fr');

            expect(updateSpy).toHaveBeenCalledWith('access-token-123', { data: { locale: 'fr' } });
        });
    });
});
