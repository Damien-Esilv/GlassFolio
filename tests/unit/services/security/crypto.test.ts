import { describe, it, expect } from 'vitest';
import {
    createKdfParams,
    decryptString,
    deriveMasterKeys,
    deriveRecoveryKek,
    encryptString,
    formatRecoveryKey,
    generateExtractableDek,
    parseEnvelope,
    parseRecoveryKey,
    randomBytes,
    RECOVERY_KEY_BYTES,
    serializeEnvelope,
    unwrapDek,
    wrapDek,
} from '../../../../src/services/security/crypto';

describe('Crypto Primitives — Zero-Knowledge Vault (TGLA-041)', () => {
    describe('Dual-Key Derivation (PBKDF2 + HKDF)', () => {
        it('derives independent KEK and AuthKey from password and salt', async () => {
            const kdf = createKdfParams(1000); // 1k iterations for fast unit test
            const derived1 = await deriveMasterKeys('TestPassword123!', kdf);
            const derived2 = await deriveMasterKeys('TestPassword123!', kdf);

            expect(derived1.kek).toBeDefined();
            expect(derived1.authKey).toBeInstanceOf(Uint8Array);
            expect(derived1.authKey.length).toBe(32);

            // Deterministic with same salt & password
            expect(Array.from(derived1.authKey)).toEqual(Array.from(derived2.authKey));
        });

        it('derives completely different keys for different passwords', async () => {
            const kdf = createKdfParams(1000);
            const derivedA = await deriveMasterKeys('PasswordA', kdf);
            const derivedB = await deriveMasterKeys('PasswordB', kdf);

            expect(Array.from(derivedA.authKey)).not.toEqual(Array.from(derivedB.authKey));
        });
    });

    describe('DEK Generation & AES-KW Wrapping', () => {
        it('wraps and unwraps DEK with correct KEK', async () => {
            const kdf = createKdfParams(1000);
            const { kek } = await deriveMasterKeys('VaultMasterPassword!', kdf);

            const dek = await generateExtractableDek();
            const wrappedB64 = await wrapDek(dek, kek);

            expect(typeof wrappedB64).toBe('string');
            expect(wrappedB64.length).toBeGreaterThan(20);

            // Unwrap as non-extractable (runtime mode)
            const unwrappedDek = await unwrapDek(wrappedB64, kek, false);
            expect(unwrappedDek).toBeDefined();
            expect(unwrappedDek.extractable).toBe(false);
            expect(unwrappedDek.algorithm.name).toBe('AES-GCM');
        });

        it('fails to unwrap DEK when wrong KEK is used', async () => {
            const kdf = createKdfParams(1000);
            const { kek: correctKek } = await deriveMasterKeys('CorrectPassword', kdf);
            const { kek: wrongKek } = await deriveMasterKeys('WrongPassword', kdf);

            const dek = await generateExtractableDek();
            const wrappedB64 = await wrapDek(dek, correctKek);

            await expect(unwrapDek(wrappedB64, wrongKek, false)).rejects.toThrow();
        });
    });

    describe('AES-256-GCM Record Envelopes & AAD Tamper Resistance', () => {
        it('encrypts and decrypts a record with storage key as AAD', async () => {
            const dek = await generateExtractableDek();
            const storageKey = 'glassfolio_transactions';
            const plaintext = JSON.stringify([{ id: 'tx-1', amount: 1500, symbol: 'AAPL' }]);

            const envelope = await encryptString(dek, plaintext, storageKey);
            expect(envelope.v).toBe(1);
            expect(envelope.alg).toBe('A256GCM');
            expect(envelope.iv).toBeDefined();
            expect(envelope.ct).toBeDefined();

            const decrypted = await decryptString(dek, envelope, storageKey);
            expect(decrypted).toBe(plaintext);
        });

        it('rejects decryption if ciphertext or AAD has been swapped/tampered', async () => {
            const dek = await generateExtractableDek();
            const plaintext = 'sensitive-portfolio-data';
            const envelope = await encryptString(dek, plaintext, 'glassfolio_positions');

            // Wrong AAD (e.g. attacker swapped ciphertext between keys)
            await expect(decryptString(dek, envelope, 'glassfolio_accounts')).rejects.toThrow();
        });

        it('generates distinct IVs for identical plaintexts (no deterministic leaks)', async () => {
            const dek = await generateExtractableDek();
            const text = 'same-string';
            const env1 = await encryptString(dek, text, 'key');
            const env2 = await encryptString(dek, text, 'key');

            expect(env1.iv).not.toEqual(env2.iv);
            expect(env1.ct).not.toEqual(env2.ct);
        });

        it('parses valid envelopes and rejects non-envelope strings', () => {
            const valid = { v: 1 as const, alg: 'A256GCM' as const, iv: 'iv123', ct: 'ct123' };
            const serialized = serializeEnvelope(valid);

            expect(parseEnvelope(serialized)).toEqual(valid);
            expect(parseEnvelope('plain text data')).toBeNull();
            expect(parseEnvelope('{"id":"legacy_object"}')).toBeNull();
            expect(parseEnvelope(null)).toBeNull();
        });
    });

    describe('Recovery Key Management', () => {
        it('formats, parses and derives KEK from high-entropy recovery key', async () => {
            const rawBytes = randomBytes(RECOVERY_KEY_BYTES);
            const formatted = formatRecoveryKey(rawBytes);

            // Must be 8 groups of 4 chars
            const parts = formatted.split('-');
            expect(parts.length).toBe(8);
            parts.forEach(p => expect(p.length).toBe(4));

            // Parsing tolerance (spaces, dashes, lowercase)
            const messyInput = formatted.toLowerCase().replace('-', ' ').replace('-', '');
            const parsed = parseRecoveryKey(messyInput);
            expect(parsed).not.toBeNull();
            expect(Array.from(parsed!)).toEqual(Array.from(rawBytes));

            // Derives recovery KEK and unwraps DEK
            const dek = await generateExtractableDek();
            const salt = 'dGVzdC1zYWx0LTE2Ynl0ZXM='; // 16 bytes base64
            const recoveryKek = await deriveRecoveryKek(parsed!, salt);
            const wrappedDek = await wrapDek(dek, recoveryKek);

            const unwrapped = await unwrapDek(wrappedDek, recoveryKek, false);
            expect(unwrapped).toBeDefined();
        });
    });
});
