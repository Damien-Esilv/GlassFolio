import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// supabaseClient first: it pulls in appStorage, which instantiates the synced provider.
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';
import { SupabaseAuthProvider } from '../../../../src/services/security/authService';
import { vaultService } from '../../../../src/services/security/vaultService';
import { userRepository } from '../../../../src/services/repositories';
import { appStorage } from '../../../../src/services/storage/appStorage';
import { VAULT_HEADER_KEY } from '../../../../src/services/storage/storageKeys';
import { getSyncedStorageProvider } from '../../../../src/services/storage/storageFactory';

const PASSWORD = 'Initial-Vault-Secret-Key-2026!#';
const NEW_PASSWORD = 'Reset-Vault-Secret-Key-2026!#';

const recoverySession = {
    accessToken: 'recovery-token',
    refreshToken: 'recovery-refresh',
    expiresAt: Date.now() + 3_600_000,
    user: { id: 'sb-user-1', email: 'cloud@example.com' },
};

/** A vault that only exists on the server: this device has never opened it. */
const seedRemoteOnlyVault = async (): Promise<{ recoveryKey: string; remoteHeader: Record<string, unknown> }> => {
    const setup = await vaultService.setup(PASSWORD);
    const remoteHeader = JSON.parse(appStorage.getBacking().getItem(VAULT_HEADER_KEY) as string) as Record<string, unknown>;
    await vaultService.lock();
    appStorage.getBacking().removeItem(VAULT_HEADER_KEY);
    // The test build runs in local mode: stand in for the cloud pull (covered by its own tests).
    vi.spyOn(getSyncedStorageProvider()!, 'pullFromRemote').mockImplementation(async () => {
        appStorage.getBacking().setItem(VAULT_HEADER_KEY, JSON.stringify(remoteHeader));
        return { ok: true, hasRemoteHeader: true };
    });
    return { recoveryKey: setup.recoveryKey, remoteHeader };
};

describe('Cloud recovery keeps the server vault header in step (TGLA-188)', () => {
    let provider: SupabaseAuthProvider;

    beforeEach(async () => {
        vi.stubEnv('VITE_SUPABASE_URL', 'https://mock-test.supabase.co');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'mock-anon-key-12345');
        process.env.VITE_SUPABASE_URL = 'https://mock-test.supabase.co';
        process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key-12345';
        await vaultService.resetVault();
        await userRepository.clearUser();
        provider = new SupabaseAuthProvider();
        vi.spyOn(supabaseClient, 'signOut').mockResolvedValue();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        delete process.env.VITE_SUPABASE_URL;
        delete process.env.VITE_SUPABASE_ANON_KEY;
    });

    it('pulls the remote header on a fresh device, then publishes the re-wrapped one', async () => {
        const { recoveryKey, remoteHeader } = await seedRemoteOnlyVault();
        const calls: string[] = [];
        vi.spyOn(supabaseClient, 'updateUser').mockImplementation(async () => {
            calls.push('updateUser');
            return {} as never;
        });
        const upsert = vi.spyOn(supabaseClient, 'upsertVaultHeader').mockImplementation(async () => {
            calls.push('upsertVaultHeader');
        });
        (provider as unknown as { supabaseSession: typeof recoverySession }).supabaseSession = recoverySession;

        const res = await provider.recoverPassword(recoveryKey, NEW_PASSWORD);

        expect(res.newRecoveryKey).not.toEqual(recoveryKey);
        expect(calls).toEqual(['updateUser', 'upsertVaultHeader']);
        const published = upsert.mock.calls[0][1] as { wrappedKeys: { password: { wrapped: string } } };
        expect(upsert.mock.calls[0][0]).toBe('recovery-token');
        expect(published.wrappedKeys.password.wrapped)
            .not.toEqual((remoteHeader as { wrappedKeys: { password: { wrapped: string } } }).wrappedKeys.password.wrapped);

        await vaultService.lock();
        await expect(vaultService.unlock(NEW_PASSWORD)).resolves.toBeDefined();
        expect(vaultService.isUnlocked()).toBe(true);
    });

    it('refuses without the recovery session from the reset email', async () => {
        const { recoveryKey } = await seedRemoteOnlyVault();
        const updateUser = vi.spyOn(supabaseClient, 'updateUser');
        (provider as unknown as { supabaseSession: null }).supabaseSession = null;

        await expect(provider.recoverPassword(recoveryKey, NEW_PASSWORD)).rejects.toThrow(/invalid link/i);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it('restores the previous header when the upload fails, so the same recovery key still works', async () => {
        const { recoveryKey, remoteHeader } = await seedRemoteOnlyVault();
        vi.spyOn(supabaseClient, 'updateUser').mockResolvedValue({} as never);
        vi.spyOn(supabaseClient, 'upsertVaultHeader').mockRejectedValue(new Error('Failed to fetch'));
        (provider as unknown as { supabaseSession: typeof recoverySession }).supabaseSession = recoverySession;

        await expect(provider.recoverPassword(recoveryKey, NEW_PASSWORD)).rejects.toThrow(/failed to fetch/i);

        expect(vaultService.isUnlocked()).toBe(false);
        expect(JSON.parse(appStorage.getBacking().getItem(VAULT_HEADER_KEY) as string)).toEqual(remoteHeader);
        await vaultService.unlockWithRecoveryKey(recoveryKey);
        expect(vaultService.isUnlocked()).toBe(true);
    });
});
