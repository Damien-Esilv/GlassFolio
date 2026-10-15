import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageProvider, InMemoryStorageProvider } from '../../../../src/types/storage';
import { generateExtractableDek, parseEnvelope } from '../../../../src/services/security/crypto';
import { EncryptedStorageProvider } from '../../../../src/services/storage/EncryptedStorageProvider';
import { appStorage } from '../../../../src/services/storage/appStorage';
import { vaultService } from '../../../../src/services/security/vaultService';
import { VAULT_HEADER_KEY } from '../../../../src/services/storage/storageKeys';

describe('EncryptedStorageProvider — Zero-Plaintext Leakage & Sync Queue (TGLA-041)', () => {
    beforeEach(async () => {
        localStorage.clear();
        await vaultService.resetVault();
    });

    describe('Canary Plaintext Scan & Zero Storage Leakage', () => {
        it('ensures zero canary secrets leak in plaintext across raw localStorage', async () => {
            const password = 'StrongVaultMasterPassword2026!';
            await vaultService.setup(password);

            const canaries = [
                'CANARY_IBAN_FR7630006000011234567890189',
                'CANARY_API_KEY_sk-live-9999988887777',
                'CANARY_NET_WORTH_987654.32',
                'CANARY_SECRET_NOTE_RETIREMENT_PLAN_2035',
            ];

            // Write canaries into various sensitive domain tables via appStorage
            appStorage.setItem('glassfolio_accounts', JSON.stringify({ iban: canaries[0], holder: 'Alex Trader' }));
            appStorage.setItem('glassfolio_transactions', JSON.stringify([{ id: 'tx-1', apiKeyRef: canaries[1] }]));
            appStorage.setItem('glassfolio_positions', JSON.stringify([{ symbol: 'BTC', total: canaries[2] }]));
            appStorage.setItem('glassfolio_goals', JSON.stringify({ note: canaries[3] }));

            // Add an allowlisted public cache key for comparison
            appStorage.setItem('gf_price_cache', JSON.stringify({ 'BTC': 65000 }));

            // Wait for background write queue to encrypt and persist all dirty records
            const encrypted = appStorage.getEncrypted();
            expect(encrypted).not.toBeNull();
            await encrypted!.flush();

            // Scan every single key and value inside raw browser localStorage
            const rawKeys: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k) rawKeys.push(k);
            }

            expect(rawKeys.length).toBeGreaterThan(0);

            for (const key of rawKeys) {
                const rawValue = localStorage.getItem(key) || '';

                // Verify that no canary string is ever present in any key name
                for (const canary of canaries) {
                    expect(key).not.toContain(canary);
                }

                // If key is a sensitive table, assert value is an encrypted envelope and contains zero canary plaintext
                if (key.startsWith('glassfolio_')) {
                    for (const canary of canaries) {
                        expect(rawValue).not.toContain(canary);
                    }
                    const envelope = parseEnvelope(rawValue);
                    expect(envelope).not.toBeNull();
                    expect(envelope?.alg).toBe('A256GCM');
                    expect(envelope?.v).toBe(1);
                }
            }
        });
    });

    describe('Synchronous Read / Serialized Write Queue', () => {
        it('serves reads synchronously from memory immediately after setItem while serializing writes', async () => {
            const backing = new InMemoryStorageProvider();
            const dek = await generateExtractableDek();
            const provider = await EncryptedStorageProvider.open(backing, dek);

            const sensitiveKey = 'glassfolio_transactions';
            const sample1 = JSON.stringify([{ id: 'tx-1', amount: 500 }]);
            const sample2 = JSON.stringify([{ id: 'tx-1', amount: 1500 }]);

            // Synchronous write & immediate synchronous read
            provider.setItem(sensitiveKey, sample1);
            expect(provider.getItem(sensitiveKey)).toBe(sample1);

            // Immediate update
            provider.setItem(sensitiveKey, sample2);
            expect(provider.getItem(sensitiveKey)).toBe(sample2);

            // Before flush, backing store has not completed write (or has older envelope)
            // After flush, backing store contains valid envelope with encrypted sample2
            await provider.flush();
            const rawInBacking = backing.getItem(sensitiveKey);
            expect(rawInBacking).not.toBeNull();
            expect(rawInBacking).not.toContain('1500');

            const envelope = parseEnvelope(rawInBacking);
            expect(envelope?.alg).toBe('A256GCM');
        });
    });

    describe('Memory Wipe on Lock', () => {
        it('wipes in-memory cache and clears DEK on lock()', async () => {
            const password = 'StrongPassword!2026';
            await vaultService.setup(password);

            appStorage.setItem('glassfolio_accounts', JSON.stringify([{ id: 'acc-secret', balance: 100000 }]));
            await appStorage.getEncrypted()!.flush();

            expect(appStorage.getItem('glassfolio_accounts')).toContain('acc-secret');

            // Lock the vault
            await vaultService.lock();

            // Protected read returns null
            expect(appStorage.getItem('glassfolio_accounts')).toBeNull();

            // In-memory encrypted provider is detached & disposed
            expect(appStorage.getEncrypted()).toBeNull();

            // Unlock and verify data can be recovered
            await vaultService.unlock(password);
            expect(appStorage.getItem('glassfolio_accounts')).toContain('acc-secret');
        });
    });

    describe('Transparent Migration & Public Cache Pass-Through', () => {
        it('passes non-sensitive keys directly to backing storage unencrypted', async () => {
            const backing = new InMemoryStorageProvider();
            const dek = await generateExtractableDek();
            const provider = await EncryptedStorageProvider.open(backing, dek);

            const publicCacheKey = 'gf_price_cache';
            const publicPayload = '{"AAPL": 220.5}';

            provider.setItem(publicCacheKey, publicPayload);

            // Non-sensitive keys bypass encryption
            expect(provider.getItem(publicCacheKey)).toBe(publicPayload);
            expect(backing.getItem(publicCacheKey)).toBe(publicPayload);
        });

        it('migrates pre-existing legacy plaintext into encrypted envelopes on open', async () => {
            const backing = new InMemoryStorageProvider();
            const dek = await generateExtractableDek();

            const sensitiveKey = 'glassfolio_positions';
            const legacyPlaintext = JSON.stringify([{ symbol: 'BTC', quantity: 1.5 }]);
            backing.setItem(sensitiveKey, legacyPlaintext);

            const provider = await EncryptedStorageProvider.open(backing, dek);
            expect(provider.getItem(sensitiveKey)).toBe(legacyPlaintext);

            await provider.flush();

            const rawAfterMigration = backing.getItem(sensitiveKey);
            expect(rawAfterMigration).not.toContain('BTC');
            expect(parseEnvelope(rawAfterMigration)).not.toBeNull();
        });

        it('handles key removal and clear correctly', async () => {
            const backing = new InMemoryStorageProvider();
            const dek = await generateExtractableDek();

            const provider = await EncryptedStorageProvider.open(backing, dek);
            provider.setItem('glassfolio_goals', '{"goal":"Fire"}');
            await provider.flush();
            expect(backing.getItem('glassfolio_goals')).not.toBeNull();

            provider.removeItem('glassfolio_goals');
            expect(provider.getItem('glassfolio_goals')).toBeNull();

            await provider.flush();
            expect(backing.getItem('glassfolio_goals')).toBeNull();
        });
    });
});
