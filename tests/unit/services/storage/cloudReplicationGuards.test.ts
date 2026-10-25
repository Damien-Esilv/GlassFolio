import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// supabaseClient first: it pulls in appStorage, which instantiates the synced provider.
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';
import { SyncedBackingStorageProvider } from '../../../../src/services/storage/SyncedBackingStorageProvider';
import { LocalStorageProvider } from '../../../../src/types/storage';
import { VAULT_HEADER_KEY, isVaultScopedKey } from '../../../../src/services/storage/storageKeys';
import { vaultService } from '../../../../src/services/security/vaultService';
import type { SupabaseAuthSession } from '../../../../src/services/supabase/supabaseClient';

const CIPHERTEXT = JSON.stringify({ v: 1, alg: 'A256GCM', iv: 'aXY=', ct: 'Y3Q=' });

const sessionFor = (userId: string): SupabaseAuthSession => ({
    accessToken: `token-${userId}`,
    refreshToken: `refresh-${userId}`,
    expiresAt: Date.now() + 3600_000,
    user: { id: userId, email: `${userId}@example.com` },
});

describe('Cloud replication guards (TGLA-101)', () => {
    let provider: SyncedBackingStorageProvider;
    let upsertRecord: ReturnType<typeof vi.spyOn>;
    let upsertHeader: ReturnType<typeof vi.spyOn>;
    let deleteRecord: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.stubEnv('VITE_SUPABASE_URL', 'https://mock-test.supabase.co');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'mock-anon-key-12345');
        process.env.VITE_SUPABASE_URL = 'https://mock-test.supabase.co';
        process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key-12345';
        provider = new SyncedBackingStorageProvider(new LocalStorageProvider(), 'cloud');
        upsertRecord = vi.spyOn(supabaseClient, 'upsertVaultRecord').mockResolvedValue();
        upsertHeader = vi.spyOn(supabaseClient, 'upsertVaultHeader').mockResolvedValue();
        deleteRecord = vi.spyOn(supabaseClient, 'deleteVaultRecord').mockResolvedValue();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        delete process.env.VITE_SUPABASE_URL;
        delete process.env.VITE_SUPABASE_ANON_KEY;
    });

    it('does not replicate with a restored session until the same user enables replication', () => {
        provider.setSupabaseSession(sessionFor('alice'));
        provider.setItem('glassfolio_transactions', CIPHERTEXT);
        expect(upsertRecord).not.toHaveBeenCalled();

        provider.enableReplication('bob');
        provider.setItem('glassfolio_transactions', CIPHERTEXT);
        expect(upsertRecord).not.toHaveBeenCalled();

        provider.enableReplication('alice');
        provider.setItem('glassfolio_transactions', CIPHERTEXT);
        expect(upsertRecord).toHaveBeenCalledWith('token-alice', 'glassfolio_transactions', CIPHERTEXT);
    });

    it('never uploads plaintext values of sensitive keys', () => {
        provider.setSupabaseSession(sessionFor('alice'));
        provider.enableReplication('alice');
        provider.setItem('glassfolio_user', JSON.stringify({ name: 'Alice', email: 'alice@example.com' }));
        expect(upsertRecord).not.toHaveBeenCalled();
    });

    it('never deletes the remote vault when the local header is removed or the cache cleared', () => {
        provider.setSupabaseSession(sessionFor('alice'));
        provider.enableReplication('alice');
        provider.setItem(VAULT_HEADER_KEY, JSON.stringify({ version: 1 }));
        expect(upsertHeader).toHaveBeenCalledTimes(1);

        provider.removeItem(VAULT_HEADER_KEY);
        provider.clear();
        expect(deleteRecord).not.toHaveBeenCalled();
    });

    it('removes vault keys locally only and disables replication in cloud mode', () => {
        provider.setSupabaseSession(sessionFor('alice'));
        provider.enableReplication('alice');
        provider.setItem('glassfolio_transactions', CIPHERTEXT);
        provider.setItem('gf_sb_session', '{"accessToken":"x"}');

        provider.removeVaultKeys(isVaultScopedKey);

        expect(provider.getItem('glassfolio_transactions')).toBeNull();
        expect(provider.getItem('gf_sb_session')).not.toBeNull();
        expect(deleteRecord).not.toHaveBeenCalled();
        expect(provider.isReplicationEnabled()).toBe(false);
    });

    it('reports an unreachable remote vault instead of an empty one', async () => {
        provider.setSupabaseSession(sessionFor('alice'));
        vi.spyOn(supabaseClient, 'getVaultHeader').mockRejectedValue(new Error('HTTP 503'));
        vi.spyOn(supabaseClient, 'getVaultRecords').mockResolvedValue([]);
        await expect(provider.pullFromRemote()).resolves.toEqual({ ok: false, hasRemoteHeader: false });
    });

    it('vault reset keeps the Supabase session, consent and theme', async () => {
        localStorage.setItem('gf_sb_session', '{"accessToken":"keep"}');
        localStorage.setItem('gf_consent_v1', 'granted');
        localStorage.setItem('gf_public_theme', 'night');
        await vaultService.setup('Strong-Vault-Secret-Key-2026!#');

        await vaultService.resetVault();

        expect(vaultService.isInitialized()).toBe(false);
        expect(localStorage.getItem('gf_sb_session')).toBe('{"accessToken":"keep"}');
        expect(localStorage.getItem('gf_consent_v1')).toBe('granted');
        expect(localStorage.getItem('gf_public_theme')).toBe('night');
    });
});

describe('supabaseClient fail-loud vault API (TGLA-101)', () => {
    beforeEach(() => {
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

    it('throws when the vault header cannot be read', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
        await expect(supabaseClient.getVaultHeader('tok')).rejects.toThrow(/HTTP 401/);
        await expect(supabaseClient.getVaultRecords('tok')).rejects.toThrow(/HTTP 401/);
    });

    it('surfaces the account deletion RPC refusal and deletes nothing beforehand', async () => {
        const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: 'mfa_required' }) });
        vi.stubGlobal('fetch', mockFetch);

        await expect(supabaseClient.deleteOwnAccount('tok')).rejects.toThrow('mfa_required');
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/rest/v1/rpc/delete_own_account'), expect.anything());
    });
});
