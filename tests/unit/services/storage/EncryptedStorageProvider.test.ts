import { describe, it, expect } from 'vitest';
import { InMemoryStorageProvider } from '../../../../src/types/storage';
import { generateExtractableDek, parseEnvelope } from '../../../../src/services/security/crypto';
import { EncryptedStorageProvider } from '../../../../src/services/storage/EncryptedStorageProvider';

describe('EncryptedStorageProvider — Transparent E2EE Storage (TGLA-041)', () => {
    it('serves reads synchronously from memory and persists encrypted records in background', async () => {
        const backing = new InMemoryStorageProvider();
        const dek = await generateExtractableDek();

        const provider = await EncryptedStorageProvider.open(backing, dek);

        // 1. Synchronous write & immediate synchronous read
        const sensitiveKey = 'glassfolio_transactions';
        const samplePayload = JSON.stringify([{ id: 'tx-1', amount: 500, symbol: 'MSFT' }]);

        provider.setItem(sensitiveKey, samplePayload);
        expect(provider.getItem(sensitiveKey)).toBe(samplePayload);

        // 2. Flush dirty queue and verify backing store contains only ciphertext
        await provider.flush();

        const rawInBacking = backing.getItem(sensitiveKey);
        expect(rawInBacking).not.toBeNull();
        expect(rawInBacking).not.toContain('MSFT'); // Zero plaintext leakage
        expect(rawInBacking).not.toContain('500');

        const envelope = parseEnvelope(rawInBacking);
        expect(envelope).not.toBeNull();
        expect(envelope?.v).toBe(1);
        expect(envelope?.alg).toBe('A256GCM');
    });

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

        // Simulate legacy unencrypted user data left before vault initialization
        const sensitiveKey = 'glassfolio_positions';
        const legacyPlaintext = JSON.stringify([{ symbol: 'BTC', quantity: 1.5 }]);
        backing.setItem(sensitiveKey, legacyPlaintext);

        // Open vault — should adopt and self-heal
        const provider = await EncryptedStorageProvider.open(backing, dek);
        expect(provider.getItem(sensitiveKey)).toBe(legacyPlaintext);

        await provider.flush();

        // Raw backing store is now encrypted
        const rawAfterMigration = backing.getItem(sensitiveKey);
        expect(rawAfterMigration).not.toContain('BTC');
        expect(parseEnvelope(rawAfterMigration)).not.toBeNull();
    });

    it('handles removal and clear correctly', async () => {
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
