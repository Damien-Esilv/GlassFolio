import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    isVaultQuotaError,
    parseVaultQuotaError,
    utf8ByteLength,
    VAULT_MAX_HEADER_BYTES,
    VAULT_MAX_RECORD_BYTES,
    VAULT_MAX_RECORDS,
    VAULT_MAX_TOTAL_BYTES,
    VaultQuotaError,
} from '../../../../src/services/storage/vaultQuota';
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';

describe('Vault quota classification & constants (Epic E38 — TGLA-214)', () => {
    it('exports Option B limits matching PostgreSQL migrations 0001/0006/0008', () => {
        expect(VAULT_MAX_RECORDS).toBe(64);
        expect(VAULT_MAX_TOTAL_BYTES).toBe(10 * 1024 * 1024);
        expect(VAULT_MAX_RECORD_BYTES).toBe(5 * 1024 * 1024);
        expect(VAULT_MAX_HEADER_BYTES).toBe(64 * 1024);
    });

    it('computes UTF-8 byte lengths matching PostgreSQL octet_length()', () => {
        expect(utf8ByteLength('abc')).toBe(3);
        expect(utf8ByteLength('€')).toBe(3);
        expect(utf8ByteLength('🔒')).toBe(4);
    });

    it('classifies all PostgreSQL / PostgREST quota errors into typed VaultQuotaError', () => {
        const storage = parseVaultQuotaError('{"message":"Vault storage quota exceeded: maximum 10 MB total encrypted data per account."}');
        expect(isVaultQuotaError(storage)).toBe(true);
        expect(storage?.reason).toBe('storage_limit');

        const records = parseVaultQuotaError('Vault record quota exceeded: maximum 64 storage keys per account.');
        expect(records?.reason).toBe('record_limit');

        const recSize = parseVaultQuotaError('new row for relation "vault_records" violates check constraint "check_ciphertext_size_limit"');
        expect(recSize?.reason).toBe('record_size');

        const headerSize = parseVaultQuotaError('new row for relation "vault_headers" violates check constraint "check_vault_header_size_limit"');
        expect(headerSize?.reason).toBe('header_size');

        expect(parseVaultQuotaError('network timeout')).toBeNull();
        expect(isVaultQuotaError(new Error('plain'))).toBe(false);
    });

    describe('supabaseClient quota error mapping', () => {
        beforeEach(() => {
            vi.stubEnv('VITE_SUPABASE_URL', 'https://mock-test.supabase.co');
            vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'mock-anon-key-12345');
            process.env.VITE_SUPABASE_URL = 'https://mock-test.supabase.co';
            process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key-12345';
        });

        afterEach(() => {
            vi.restoreAllMocks();
            vi.unstubAllEnvs();
            delete process.env.VITE_SUPABASE_URL;
            delete process.env.VITE_SUPABASE_ANON_KEY;
        });

        it('throws VaultQuotaError(header_size) when upsertVaultHeader violates check_vault_header_size_limit', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
                new Response(JSON.stringify({ message: 'violates check constraint "check_vault_header_size_limit"' }), { status: 400 }),
            );

            await expect(supabaseClient.upsertVaultHeader('tok', { version: 1 })).rejects.toMatchObject({
                name: 'VaultQuotaError',
                reason: 'header_size',
            });
        });

        it('throws VaultQuotaError(storage_limit) when upsertVaultRecord exceeds 10 MB trigger', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
                new Response(JSON.stringify({ message: 'Vault storage quota exceeded: maximum 10 MB total encrypted data per account.' }), { status: 400 }),
            );

            await expect(supabaseClient.upsertVaultRecord('tok', 'glassfolio_tx', 'cipher')).rejects.toBeInstanceOf(VaultQuotaError);
        });

        it('throws VaultQuotaError(record_limit) when commitVaultMigration exceeds 64 keys', async () => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
                new Response(JSON.stringify({ message: 'Vault record quota exceeded: maximum 64 storage keys per account.' }), { status: 400 }),
            );

            await expect(supabaseClient.commitVaultMigration('tok', { version: 1 }, [])).rejects.toMatchObject({
                name: 'VaultQuotaError',
                reason: 'record_limit',
            });
        });
    });
});
