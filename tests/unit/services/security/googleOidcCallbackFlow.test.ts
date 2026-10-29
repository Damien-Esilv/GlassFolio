import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseAuthProvider } from '../../../../src/services/security/authService';
import { vaultService } from '../../../../src/services/security/vaultService';
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';
import { googleDriveVaultKeyService } from '../../../../src/services/security/googleDriveVaultKeyService';
import { googleOidcService, sha256Hex } from '../../../../src/services/security/googleOidcService';
import { deviceVaultKeyStore } from '../../../../src/services/security/deviceVaultKeyStore';
import { userRepository } from '../../../../src/services/repositories';
import { mockRemoteVault } from '../../helpers/remoteVault';
import { getSyncedStorageProvider } from '../../../../src/services/storage/storageFactory';

const USER = { id: 'g-user-1', email: 'Investor@Example.test', user_metadata: { full_name: 'Inv Estor', picture: 'https://lh3.googleusercontent.com/a.png' } };
const session = (user = USER) => ({ accessToken: 'sb-at', refreshToken: 'sb-rt', expiresAt: Date.now() + 3_600_000, user }) as never;
const callback = { idToken: 'idt', accessToken: 'drive-at', rawNonce: 'raw', state: 's' };
const secret = () => crypto.getRandomValues(new Uint8Array(32));

describe('handleGoogleOidcCallback', () => {
    let auth: SupabaseAuthProvider;

    beforeEach(async () => {
        vi.restoreAllMocks();
        auth = new SupabaseAuthProvider();
        await vaultService.resetVault();
        await deviceVaultKeyStore.clearAll();
        await userRepository.clearUser();
        localStorage.clear();
        vi.spyOn(supabaseClient, 'signInWithIdToken').mockResolvedValue(session());
    });

    it('creates a new Drive vault for a first sign-in and returns the recovery key once', async () => {
        mockRemoteVault();
        const key = { driveSecret: secret(), keyId: 'k1' };
        const getOrCreate = vi.spyOn(googleDriveVaultKeyService, 'getOrCreateRootSecret').mockResolvedValue(key);
        const publish = vi.spyOn(supabaseClient, 'upsertVaultHeader').mockResolvedValue();

        const res = await auth.handleGoogleOidcCallback(callback);

        expect(getOrCreate).toHaveBeenCalledWith('drive-at', 'g-user-1', { replaceForeignKey: true });
        expect(res.recoveryKey).toMatch(/^[A-Z2-7-]{20,}$/);
        expect(res.user.authProvider).toBe('google');
        expect(res.user.email).toBe('Investor@Example.test');
        expect(res.user.name).toBe('Inv Estor');
        expect(vaultService.isUnlocked()).toBe(true);
        expect(vaultService.isGoogleDriveVault()).toBe(true);
        expect(publish).toHaveBeenCalledTimes(1);
    });

    it('replaces a leftover cached vault when the server has none for this account', async () => {
        // e.g. another account's password vault, or a first attempt that failed before publishing
        await vaultService.setup('Str0ng!Passphrase#2026', { authProvider: 'email' });
        await vaultService.lock();
        mockRemoteVault();
        // the server has no vault for this account, whatever the device still caches
        vi.spyOn(getSyncedStorageProvider()!, 'pullFromRemote').mockResolvedValue({ ok: true, hasRemoteHeader: false });
        vi.spyOn(googleDriveVaultKeyService, 'getOrCreateRootSecret').mockResolvedValue({ driveSecret: secret(), keyId: 'k1' });
        const publish = vi.spyOn(supabaseClient, 'upsertVaultHeader').mockResolvedValue();

        const res = await auth.handleGoogleOidcCallback(callback);

        expect(res.recoveryKey).toBeTruthy();
        expect(vaultService.isGoogleDriveVault()).toBe(true);
        expect(publish).toHaveBeenCalledTimes(1);
    });

    it('reopens an existing Drive vault by reading (never creating) the key', async () => {
        mockRemoteVault();
        const key = { driveSecret: secret(), keyId: 'k1' };
        await vaultService.setupGoogleDriveVault(key.driveSecret, key.keyId, 'g-user-1');
        await vaultService.lock();
        const read = vi.spyOn(googleDriveVaultKeyService, 'readRootSecret').mockResolvedValue(key);
        const create = vi.spyOn(googleDriveVaultKeyService, 'getOrCreateRootSecret');

        const res = await auth.handleGoogleOidcCallback(callback);

        expect(read).toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
        expect(res.recoveryKey).toBeUndefined();
        expect(vaultService.isUnlocked()).toBe(true);
    });

    it('refuses to replace a missing Drive key with a new one', async () => {
        mockRemoteVault();
        await vaultService.setupGoogleDriveVault(secret(), 'k1', 'g-user-1');
        await vaultService.lock();
        vi.spyOn(googleDriveVaultKeyService, 'readRootSecret').mockResolvedValue(null);
        const create = vi.spyOn(googleDriveVaultKeyService, 'getOrCreateRootSecret');

        await expect(auth.handleGoogleOidcCallback(callback)).rejects.toThrow(/DRIVE_KEY_MISSING/);
        expect(create).not.toHaveBeenCalled();
        expect(vaultService.isUnlocked()).toBe(false);
    });

    it('migrates a legacy identity vault and commits header and records in one call', async () => {
        const legacy = 'gf-oauth-e2ee-v1:g-user-1:investor@example.test';
        await vaultService.setupOAuthVault(legacy);
        await vaultService.lock();
        mockRemoteVault();
        vi.spyOn(googleDriveVaultKeyService, 'getOrCreateRootSecret').mockResolvedValue({ driveSecret: secret(), keyId: 'k2' });
        const commit = vi.spyOn(supabaseClient, 'commitVaultMigration').mockResolvedValue();
        const separateHeaderUpload = vi.spyOn(supabaseClient, 'upsertVaultHeader').mockResolvedValue();

        const res = await auth.handleGoogleOidcCallback(callback);

        expect(res.recoveryKey).toBeTruthy();
        expect(commit).toHaveBeenCalledTimes(1);
        const [token, header, records] = commit.mock.calls[0];
        expect(token).toBe('sb-at');
        expect((header as { wrappedKeys: { googleDrive?: unknown; password: unknown } }).wrappedKeys.googleDrive).toBeTruthy();
        expect((header as { wrappedKeys: { password: unknown } }).wrappedKeys.password).toBeNull();
        expect(Array.isArray(records)).toBe(true);
        expect(separateHeaderUpload).not.toHaveBeenCalled();
        expect(vaultService.isGoogleDriveVault()).toBe(true);
    });

    it('leaves the server untouched when the atomic commit fails', async () => {
        await vaultService.setupOAuthVault('gf-oauth-e2ee-v1:g-user-1:investor@example.test');
        await vaultService.lock();
        mockRemoteVault();
        vi.spyOn(googleDriveVaultKeyService, 'getOrCreateRootSecret').mockResolvedValue({ driveSecret: secret(), keyId: 'k2' });
        vi.spyOn(supabaseClient, 'commitVaultMigration').mockRejectedValue(new Error('network cut'));
        const upsert = vi.spyOn(supabaseClient, 'upsertVaultHeader').mockResolvedValue();
        const record = vi.spyOn(supabaseClient, 'upsertVaultRecord').mockResolvedValue();

        await expect(auth.handleGoogleOidcCallback(callback)).rejects.toThrow('network cut');
        expect(upsert).not.toHaveBeenCalled();
        expect(record).not.toHaveBeenCalled();
    });

    it('blocks an account that already has a password vault', async () => {
        await vaultService.setup('Strong-Vault-Secret-Key-2026!#', { authProvider: 'email' });
        await vaultService.lock();
        mockRemoteVault();
        await expect(auth.handleGoogleOidcCallback(callback)).rejects.toThrow(/already exists with this email address/);
        expect(vaultService.getVaultHeader()?.authProvider).toBe('email');
    });

    it('refuses a sign-in for another user while a session is active', async () => {
        mockRemoteVault();
        (auth as unknown as { currentSession: { userId: string } }).currentSession = { userId: 'someone-else' };
        await expect(auth.handleGoogleOidcCallback(callback)).rejects.toThrow(/active session already exists/);
    });

    it('clears a leftover demo vault before creating the account vault', async () => {
        mockRemoteVault();
        vi.spyOn(vaultService, 'isDemoVault').mockReturnValueOnce(true);
        const reset = vi.spyOn(vaultService, 'resetVault');
        vi.spyOn(googleDriveVaultKeyService, 'getOrCreateRootSecret').mockResolvedValue({ driveSecret: secret(), keyId: 'k1' });
        vi.spyOn(supabaseClient, 'upsertVaultHeader').mockResolvedValue();
        await auth.handleGoogleOidcCallback(callback);
        expect(reset).toHaveBeenCalled();
    });

    describe('account with a verified TOTP', () => {
        const totp = [{ id: 'f1', factor_type: 'totp', status: 'verified' }] as never;

        it('stops at the second factor before reading or writing anything', async () => {
            mockRemoteVault();
            vi.spyOn(supabaseClient, 'listMfaFactors').mockResolvedValue(totp);
            const pull = vi.spyOn(supabaseClient, 'getVaultHeader');
            const driveKey = vi.spyOn(googleDriveVaultKeyService, 'getOrCreateRootSecret');
            const publish = vi.spyOn(supabaseClient, 'upsertVaultHeader').mockResolvedValue();

            const res = await auth.handleGoogleOidcCallback(callback);

            expect(res.requiresTwoFactor).toBe(true);
            expect(res.secondFactorMethods).toEqual(['totp']);
            expect(pull).not.toHaveBeenCalled();
            expect(driveKey).not.toHaveBeenCalled();
            expect(publish).not.toHaveBeenCalled();
            expect(vaultService.isUnlocked()).toBe(false);
        });

        it('creates the vault with the AAL2 session once the code is verified', async () => {
            mockRemoteVault();
            vi.spyOn(supabaseClient, 'listMfaFactors').mockResolvedValue(totp);
            vi.spyOn(supabaseClient, 'challengeMfaFactor').mockResolvedValue({ id: 'c1' });
            vi.spyOn(supabaseClient, 'verifyMfaFactor').mockResolvedValue(session());
            vi.spyOn(googleDriveVaultKeyService, 'getOrCreateRootSecret').mockResolvedValue({ driveSecret: secret(), keyId: 'k1' });
            const publish = vi.spyOn(supabaseClient, 'upsertVaultHeader').mockResolvedValue();

            await auth.handleGoogleOidcCallback(callback);
            const res = await auth.verifySecondFactor('123456');

            expect(res.requiresTwoFactor).toBeFalsy();
            expect(res.recoveryKey).toMatch(/^[A-Z2-7-]{20,}$/);
            expect(res.user.authProvider).toBe('google');
            expect(publish).toHaveBeenCalledTimes(1);
            expect(vaultService.isUnlocked()).toBe(true);
        });

        it('fails closed when the factors cannot be listed', async () => {
            mockRemoteVault();
            vi.spyOn(supabaseClient, 'listMfaFactors').mockRejectedValue(new Error('offline'));
            const publish = vi.spyOn(supabaseClient, 'upsertVaultHeader').mockResolvedValue();

            await expect(auth.handleGoogleOidcCallback(callback)).rejects.toThrow('offline');
            expect(publish).not.toHaveBeenCalled();
            expect(vaultService.isUnlocked()).toBe(false);
        });
    });
});

describe('googleOidcService callback validation', () => {
    const setCeremony = (over: Partial<{ state: string; rawNonce: string; createdAt: number }> = {}) =>
        sessionStorage.setItem('gf_google_oidc_ceremony', JSON.stringify({ state: 's1', rawNonce: 'n1', createdAt: Date.now(), ...over }));
    const hash = (p: Record<string, string>) => '#' + new URLSearchParams(p).toString();
    const ok = { id_token: 'i', access_token: 'a', state: 's1', scope: 'openid https://www.googleapis.com/auth/drive.appdata' };

    beforeEach(() => sessionStorage.clear());

    it('surfaces a provider error', () => {
        expect(() => googleOidcService.parseCallbackHash(hash({ error: 'access_denied', error_description: 'User said no' }))).toThrow('GOOGLE_OAUTH_ERROR: User said no');
    });

    it('rejects missing tokens, a missing ceremony and an expired ceremony', () => {
        expect(() => googleOidcService.parseCallbackHash(hash({ state: 's1' }))).toThrow('MISSING_OAUTH_TOKENS');
        expect(() => googleOidcService.parseCallbackHash(hash(ok))).toThrow('MISSING_CEREMONY_STATE');
        setCeremony({ createdAt: Date.now() - 11 * 60 * 1000 });
        expect(() => googleOidcService.parseCallbackHash(hash(ok))).toThrow('EXPIRED_CEREMONY_STATE');
    });

    it('consumes the ceremony so a callback cannot be replayed', () => {
        setCeremony();
        expect(googleOidcService.parseCallbackHash(hash(ok)).rawNonce).toBe('n1');
        expect(() => googleOidcService.parseCallbackHash(hash(ok))).toThrow('MISSING_CEREMONY_STATE');
    });

    it('hashes the nonce with SHA-256 (hex) and builds the redirect URI from the current origin', async () => {
        expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        expect(googleOidcService.getRedirectUri()).toBe(`${window.location.origin}/auth/google-callback`);
    });
});
