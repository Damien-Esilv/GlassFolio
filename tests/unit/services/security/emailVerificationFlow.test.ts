import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';
import { SupabaseAuthProvider } from '../../../../src/services/security/authService';
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
            expect(body.data).toEqual({ name: 'Ana', locale: 'fr' });
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
        });

        it('passes the stored UI language to signUp as email locale', async () => {
            appStorage.setItem(PUBLIC_LANG_STORAGE_KEY, 'fr');
            const signUpSpy = vi.spyOn(supabaseClient, 'signUp').mockResolvedValue(buildSession() as never);

            await provider.signUp('cloud@example.com', STRONG_PASSWORD, 'Cloud User');

            expect(signUpSpy).toHaveBeenCalledWith(
                'cloud@example.com',
                STRONG_PASSWORD,
                'Cloud User',
                expect.objectContaining({ locale: 'fr' })
            );
        });

        it('verifyEmailTokenHash persists the session and flags the user as verified', async () => {
            vi.spyOn(supabaseClient, 'verifyTokenHash').mockResolvedValue(buildSession() as never);

            const result = await provider.verifyEmailTokenHash('hash-abc', 'signup');

            expect(result.user.emailVerified).toBe(true);
            expect(result.user.email).toBe('cloud@example.com');
            expect((await userRepository.getUser())?.emailVerified).toBe(true);
        });

        it('verifyEmailTokenHash updates an existing unverified user', async () => {
            vi.spyOn(supabaseClient, 'signUp').mockResolvedValue(buildSession({ email_confirmed_at: null }) as never);
            const signup = await provider.signUp('cloud@example.com', STRONG_PASSWORD, 'Cloud User');
            expect(signup.user.emailVerified).toBe(false);

            vi.spyOn(supabaseClient, 'verifyTokenHash').mockResolvedValue(buildSession() as never);
            await provider.verifyEmailTokenHash('hash-abc');

            expect((await userRepository.getUser())?.emailVerified).toBe(true);
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
