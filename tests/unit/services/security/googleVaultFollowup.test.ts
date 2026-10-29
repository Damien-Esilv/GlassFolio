/**
 * Regression tests for the review of the security-audit remediation (TGLA-170).
 * Cloud mode is forced before any module loads: the storage factory reads it once.
 */
import { vi, describe, it, expect, beforeEach, afterAll } from 'vitest';

vi.hoisted(() => {
    process.env.VITE_DEPLOYMENT_MODE = 'cloud';
});
vi.mock('../../../../src/services/supabase/supabaseClient', async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    isSupabaseConfigured: () => true,
}));

import { vaultService } from '../../../../src/services/security/vaultService';
import { appStorage } from '../../../../src/services/storage/appStorage';
import { getSyncedStorageProvider } from '../../../../src/services/storage/storageFactory';
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';
import { deviceVaultKeyStore } from '../../../../src/services/security/deviceVaultKeyStore';
import { googleDriveVaultKeyService } from '../../../../src/services/security/googleDriveVaultKeyService';
import { PBKDF2_ITERATIONS } from '../../../../src/services/security/crypto';

const session = {
    accessToken: 'at',
    refreshToken: 'rt',
    expiresAt: Date.now() + 3_600_000,
    user: { id: 'u1', email: 'dummy@example.test' },
} as never;

afterAll(() => {
    delete process.env.VITE_DEPLOYMENT_MODE;
});

describe('legacy Google vault migration keeps the data after the next login', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        await vaultService.resetVault();
        await deviceVaultKeyStore.clearAll();
    });

    it('sends every re-encrypted record with the header so the next pull does not restore old-DEK ciphertext', async () => {
        const legacy = 'gf-oauth-e2ee-v1:u1:dummy@example.test';
        await vaultService.setupOAuthVault(legacy);
        appStorage.setItem('glassfolio_goals', JSON.stringify([{ id: 'g1', title: 'dummy goal' }]));
        await appStorage.getEncrypted()?.flush();
        // What the server already holds before the migration (sealed under the old DEK).
        const server = new Map<string, string>([['glassfolio_goals', appStorage.getBacking().getItem('glassfolio_goals') as string]]);

        const synced = getSyncedStorageProvider()!;
        synced.setSupabaseSession(session);
        const driveSecret = crypto.getRandomValues(new Uint8Array(32));
        await vaultService.migrateLegacyGoogleVault(legacy, driveSecret, 'key-1', 'u1');
        // Header + every record go in ONE call (server transaction, migration 0007).
        const records = synced.collectSensitiveEnvelopes();
        expect(records.length).toBeGreaterThan(0);
        const newHeader = JSON.parse(appStorage.getBacking().getItem('gf_vault_header') as string);
        for (const r of records) server.set(r.record_key, r.ciphertext);

        // Next login on any device: pull the server copy, then unlock with the Drive secret.
        await vaultService.lock();
        vi.spyOn(supabaseClient, 'getVaultHeader').mockResolvedValue({ header_json: newHeader } as never);
        vi.spyOn(supabaseClient, 'getVaultRecords').mockImplementation(async () =>
            [...server.entries()].map(([record_key, ciphertext]) => ({ record_key, ciphertext })) as never);
        await synced.pullFromRemote();
        await vaultService.unlockGoogleDriveVault(driveSecret, 'u1');

        expect(appStorage.getEncrypted()?.getCorruptedKeys()).toEqual([]);
        expect(appStorage.getItem('glassfolio_goals')).toBe(JSON.stringify([{ id: 'g1', title: 'dummy goal' }]));
    });
});

describe('a downgraded remote vault header', () => {
    it('is reported as a failure, never as "this account has no vault"', async () => {
        const synced = getSyncedStorageProvider()!;
        synced.setSupabaseSession(session);
        vi.spyOn(supabaseClient, 'getVaultHeader').mockResolvedValue({
            header_json: { version: 1, kdf: { algorithm: 'pbkdf2-sha256', iterations: 1, salt: 'AAAA' }, wrappedKeys: {} },
        } as never);
        vi.spyOn(supabaseClient, 'getVaultRecords').mockResolvedValue([] as never);
        const result = await synced.pullFromRemote();
        expect(PBKDF2_ITERATIONS).toBe(600_000);
        expect(result.ok).toBe(false);
        expect(result.hasRemoteHeader).toBe(false);
    });
});

describe('Google Drive key file handling', () => {
    const stubDrive = (mediaBody: string) => {
        const calls: string[] = [];
        globalThis.fetch = vi.fn(async (url: string, init?: { method?: string }) => {
            const u = String(url);
            calls.push(`${init?.method ?? 'GET'} ${u.replace(/\?.*/, '')}`);
            if (u.includes('spaces=appDataFolder')) return { ok: true, json: async () => ({ files: [{ id: 'f1', name: 'x' }] }) } as never;
            if (u.includes('alt=media')) return { ok: true, text: async () => mediaBody } as never;
            return { ok: true, json: async () => ({}) } as never;
        }) as never;
        return calls;
    };

    it('never overwrites a key file it cannot read', async () => {
        const calls = stubDrive('corrupted-or-newer-format');
        await expect(googleDriveVaultKeyService.getOrCreateRootSecret('drive-at', 'u1')).rejects.toThrow('DRIVE_KEY_FILE_UNREADABLE');
        expect(calls.some((c) => c.startsWith('PATCH') || c.startsWith('POST'))).toBe(false);
    });

    it('refuses a key file that belongs to another user', async () => {
        const secret = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
        stubDrive(JSON.stringify({ version: 1, keyId: 'k', userId: 'someone-else', secretBase64: secret, createdAt: 'x' }));
        await expect(googleDriveVaultKeyService.readRootSecret('drive-at', 'u1')).rejects.toThrow('DRIVE_KEY_FILE_USER_MISMATCH');
    });
});

describe('commitVaultMigration client call', () => {
    it('posts header and records together to the atomic RPC', async () => {
        const urls: string[] = [];
        let body: { p_header?: unknown; p_records?: unknown } = {};
        globalThis.fetch = vi.fn(async (url: string, init?: { body?: string }) => {
            urls.push(String(url));
            body = JSON.parse(init?.body ?? '{}');
            return { ok: true, json: async () => ({}) } as never;
        }) as never;
        vi.stubEnv('VITE_SUPABASE_URL', 'https://dummy.supabase.test');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
        await supabaseClient.commitVaultMigration('at', { version: 1 }, [{ record_key: 'glassfolio_goals', ciphertext: '{"v":1}' }]);
        expect(urls[0]).toContain('/rest/v1/rpc/commit_vault_migration');
        expect(body.p_header).toEqual({ version: 1 });
        expect(body.p_records).toEqual([{ record_key: 'glassfolio_goals', ciphertext: '{"v":1}' }]);
        vi.unstubAllEnvs();
    });
});
