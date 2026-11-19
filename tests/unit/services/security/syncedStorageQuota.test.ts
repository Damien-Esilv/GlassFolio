import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// supabaseClient first: it pulls in appStorage, which instantiates the synced provider cleanly.
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';
import { IStorageProvider } from '../../../../src/types/storage';
import { SyncedBackingStorageProvider } from '../../../../src/services/storage/SyncedBackingStorageProvider';
import { VAULT_HEADER_KEY } from '../../../../src/services/storage/storageKeys';
import {
    VAULT_MAX_HEADER_BYTES,
    VAULT_MAX_RECORD_BYTES,
    VAULT_MAX_RECORDS,
    VAULT_MAX_TOTAL_BYTES,
    VaultQuotaError,
} from '../../../../src/services/storage/vaultQuota';
import { getStorageStatusTool } from '../../../../src/services/ai/tools/securityTools';
import * as deployment from '../../../../src/config/deployment';
import * as storageFactory from '../../../../src/services/storage/storageFactory';

class MemoryStorage implements IStorageProvider {
    private readonly map = new Map<string, string>();
    getItem(key: string): string | null { return this.map.get(key) ?? null; }
    setItem(key: string, value: string): void { this.map.set(key, value); }
    removeItem(key: string): void { this.map.delete(key); }
    clear(): void { this.map.clear(); }
    keys(): string[] { return Array.from(this.map.keys()); }
}

const makeEnvelope = (payloadSize: number): string => JSON.stringify({
    v: 1,
    alg: 'A256GCM',
    iv: 'AAAAAAAAAAAAAAAA',
    ct: 'a'.repeat(payloadSize),
});

const mockSession = {
    accessToken: 'jwt-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 3_600_000,
    user: { id: 'user-e38', email: 'e38@example.com' },
};

describe('SyncedBackingStorageProvider cloud quota enforcement & recovery (Epic E38 — TGLA-214)', () => {
    let local: MemoryStorage;
    let synced: SyncedBackingStorageProvider;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubEnv('VITE_SUPABASE_URL', 'https://mock-test.supabase.co');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'mock-anon-key-12345');
        process.env.VITE_SUPABASE_URL = 'https://mock-test.supabase.co';
        process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key-12345';

        local = new MemoryStorage();
        synced = new SyncedBackingStorageProvider(local, 'cloud');
        synced.setSupabaseSession(mockSession);
        synced.enableReplication(mockSession.user.id);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        delete process.env.VITE_SUPABASE_URL;
        delete process.env.VITE_SUPABASE_ANON_KEY;
    });

    it('rejects an oversized vault header (> 64 KB) pre-flight without calling Supabase', () => {
        const upsertHeader = vi.spyOn(supabaseClient, 'upsertVaultHeader').mockResolvedValue();
        const listener = vi.fn();
        synced.subscribe(listener);

        const oversizedHeader = JSON.stringify({
            version: 1,
            kdf: { iterations: 600_000 },
            wrappedKeys: { pad: 'z'.repeat(VAULT_MAX_HEADER_BYTES + 1024) },
        });
        synced.setItem(VAULT_HEADER_KEY, oversizedHeader);

        expect(upsertHeader).not.toHaveBeenCalled();
        expect(synced.getCloudSyncStatus().quotaError).toBe('header_size');
        expect(synced.getCloudSyncStatus().pendingCount).toBe(1);
        expect(listener).toHaveBeenCalled();
    });

    it('rejects a single record > 5 MB pre-flight without calling Supabase', () => {
        const upsertRecord = vi.spyOn(supabaseClient, 'upsertVaultRecord').mockResolvedValue();

        synced.setItem('glassfolio_huge', makeEnvelope(VAULT_MAX_RECORD_BYTES + 50));

        expect(upsertRecord).not.toHaveBeenCalled();
        expect(synced.getCloudSyncStatus().quotaError).toBe('record_size');
    });

    it('rejects the 65th sensitive key pre-flight without calling Supabase', async () => {
        const upsertRecord = vi.spyOn(supabaseClient, 'upsertVaultRecord').mockResolvedValue();

        for (let i = 1; i <= VAULT_MAX_RECORDS; i += 1) {
            local.setItem(`glassfolio_k${i}`, makeEnvelope(32));
        }
        synced.setItem('glassfolio_k65', makeEnvelope(32));

        expect(upsertRecord).not.toHaveBeenCalled();
        expect(synced.getCloudSyncStatus().quotaError).toBe('record_limit');
        expect(synced.getCloudSyncStatus().recordCount).toBe(65);
    });

    it('rejects cumulative encrypted storage > 10 MB pre-flight', () => {
        const upsertRecord = vi.spyOn(supabaseClient, 'upsertVaultRecord').mockResolvedValue();
        const chunk = makeEnvelope(4 * 1024 * 1024); // 4 MB each
        local.setItem('glassfolio_a', chunk);
        local.setItem('glassfolio_b', chunk);

        // 3rd 4 MB record pushes total to ~12 MB > 10 MB
        synced.setItem('glassfolio_c', chunk);

        expect(upsertRecord).not.toHaveBeenCalled();
        expect(synced.getCloudSyncStatus().quotaError).toBe('storage_limit');
        expect(synced.getCloudSyncStatus().usageBytes).toBeGreaterThan(VAULT_MAX_TOTAL_BYTES);
    });

    it('stops retrying when Supabase returns VaultQuotaError, then resumes once space is freed', async () => {
        const upsertRecord = vi.spyOn(supabaseClient, 'upsertVaultRecord')
            .mockRejectedValueOnce(new VaultQuotaError('storage_limit'))
            .mockResolvedValue(undefined);
        const deleteRecord = vi.spyOn(supabaseClient, 'deleteVaultRecord').mockResolvedValue();

        synced.setItem('glassfolio_tx', makeEnvelope(128));
        await vi.advanceTimersByTimeAsync(0);

        expect(upsertRecord).toHaveBeenCalledTimes(1);
        expect(synced.getCloudSyncStatus().quotaError).toBe('storage_limit');

        // Advancing time by 5 minutes must NOT re-fire Supabase calls while quota-blocked
        await vi.advanceTimersByTimeAsync(300_000);
        expect(upsertRecord).toHaveBeenCalledTimes(1);

        // Removing another key frees space and triggers recovery flush of queued keys
        local.setItem('glassfolio_old', makeEnvelope(128));
        synced.removeItem('glassfolio_old');
        await vi.advanceTimersByTimeAsync(0);

        expect(deleteRecord).toHaveBeenCalledWith('jwt-token', 'glassfolio_old');
        expect(upsertRecord).toHaveBeenCalledTimes(2);
        expect(synced.getCloudSyncStatus().quotaError).toBeNull();
        expect(synced.getCloudSyncStatus().pendingCount).toBe(0);
    });

    it('returns a referentially stable CloudSyncStatus snapshot when nothing changed', () => {
        const first = synced.getCloudSyncStatus();
        const second = synced.getCloudSyncStatus();
        expect(first).toBe(second);
    });

    it('surfaces cloud quota metrics in the get_storage_status AI/MCP tool without leaking secrets', async () => {
        vi.spyOn(deployment, 'getDeploymentMode').mockReturnValue('cloud');
        vi.spyOn(storageFactory, 'getLocalVaultProvider').mockReturnValue(null);
        vi.spyOn(storageFactory, 'getSyncedStorageProvider').mockReturnValue(synced);
        vi.spyOn(supabaseClient, 'upsertVaultRecord').mockRejectedValue(new VaultQuotaError('storage_limit'));

        synced.setItem('glassfolio_secret_portfolio', makeEnvelope(256));
        await vi.advanceTimersByTimeAsync(0);

        const result = await getStorageStatusTool.execute({});
        expect(result).toMatchObject({
            deploymentMode: 'cloud',
            storageLocation: 'cloud',
            pendingChanges: 1,
            saveError: true,
            quotaExceeded: true,
            quotaReason: 'storage_limit',
            quotaLimitBytes: VAULT_MAX_TOTAL_BYTES,
            quotaMaxRecords: VAULT_MAX_RECORDS,
            quotaRecordCount: 1,
        });
        expect(result.quotaUsageBytes).toBeGreaterThan(256);
    });
});
