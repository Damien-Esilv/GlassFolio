import { describe, it, expect } from 'vitest';
import {
    createKdfParams,
    decryptString,
    deriveMasterKeys,
    deriveRecoveryKek,
    derivePasskeyKek,
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
    createPowChallenge,
    solveProofOfWork,
    verifyProofOfWork,
    POW_MAX_AGE_MS,
} from '../../../../src/services/security/crypto';
import { fromBase64, toBase64 } from '../../../../src/services/security/encoding';

describe('Crypto Primitives & Adversarial Security (TGLA-041)', () => {
    describe('Dual-Key Domain Separation (PBKDF2 + HKDF)', () => {
        it('derives two mathematically independent keys (KEK !== AuthKey)', async () => {
            const kdf = createKdfParams();
            const derived = await deriveMasterKeys('TestPassword123!', kdf);

            expect(derived.kek).toBeDefined();
            expect(derived.authKey).toBeInstanceOf(Uint8Array);
            expect(derived.authKey.length).toBe(32);

            // Export KEK if possible or verify domain separation:
            // Since KEK is non-extractable, we prove mathematically and operationally
            // that AuthKey imported as an AES-KW key CANNOT unwrap a DEK wrapped by KEK.
            const dek = await generateExtractableDek();
            const wrappedDek = await wrapDek(dek, derived.kek);

            // Import authKey as an AES-KW key
            const fakeKekFromAuthKey = await window.crypto.subtle.importKey(
                'raw',
                derived.authKey,
                { name: 'AES-KW', length: 256 },
                false,
                ['unwrapKey']
            );

            // AuthKey must fail to unwrap DEK wrapped by KEK
            await expect(unwrapDek(wrappedDek, fakeKekFromAuthKey, false)).rejects.toThrow();
        });

        it('derives completely different keys for different passwords and salts', async () => {
            const kdfA = createKdfParams();
            const kdfB = createKdfParams();
            const derivedA = await deriveMasterKeys('PasswordA', kdfA);
            const derivedB = await deriveMasterKeys('PasswordB', kdfB);

            expect(Array.from(derivedA.authKey)).not.toEqual(Array.from(derivedB.authKey));
        });

        it('strictly rejects KDF iterations below 600,000 security floor (Finding #5)', async () => {
            const weakKdf = { ...createKdfParams(), iterations: 1000 };
            await expect(deriveMasterKeys('Password123!', weakKdf)).rejects.toThrow(
                /below security floor/i
            );
        });
    });

    describe('AES-256-GCM Round-Trip & 500x IV Uniqueness', () => {
        it('encrypts the same payload 500 times with strictly unique 96-bit IVs and ciphertexts', async () => {
            const dek = await generateExtractableDek();
            const payload = JSON.stringify({ account: 'FR7630006000011234567890189', balance: 450000 });
            const aad = 'gf_transactions';

            const iterations = 500;
            const ivSet = new Set<string>();
            const ctSet = new Set<string>();

            for (let i = 0; i < iterations; i++) {
                const envelope = await encryptString(dek, payload, aad);

                // Assert IV is 96-bit (12 bytes)
                const ivBytes = fromBase64(envelope.iv);
                expect(ivBytes.byteLength).toBe(12);

                ivSet.add(envelope.iv);
                ctSet.add(envelope.ct);

                // Quick spot-check round-trip on first and last
                if (i === 0 || i === iterations - 1) {
                    const decrypted = await decryptString(dek, envelope, aad);
                    expect(decrypted).toBe(payload);
                }
            }

            // Zero IV collisions across 500 encryptions
            expect(ivSet.size).toBe(iterations);
            expect(ctSet.size).toBe(iterations);
        });
    });

    describe('Tamper Resistance & Authentication Failure', () => {
        it('rejects decryption when a single bit is flipped in the ciphertext', async () => {
            const dek = await generateExtractableDek();
            const payload = 'Confidential Portfolio Position: BTC 10.5';
            const aad = 'gf_positions';
            const envelope = await encryptString(dek, payload, aad);

            // Flip a single bit in the raw ciphertext bytes
            const rawCt = fromBase64(envelope.ct);
            const tamperedCtBytes = new Uint8Array(rawCt);
            tamperedCtBytes[0] ^= 0x01; // flip 1 bit
            const tamperedCt = toBase64(tamperedCtBytes);

            const tamperedEnvelope = { ...envelope, ct: tamperedCt };

            await expect(decryptString(dek, tamperedEnvelope, aad)).rejects.toThrow();
        });

        it('rejects decryption when a single bit is flipped in the IV', async () => {
            const dek = await generateExtractableDek();
            const payload = 'Confidential Portfolio Position: BTC 10.5';
            const aad = 'gf_positions';
            const envelope = await encryptString(dek, payload, aad);

            // Flip a single bit in the IV
            const rawIv = fromBase64(envelope.iv);
            const tamperedIvBytes = new Uint8Array(rawIv);
            tamperedIvBytes[0] ^= 0x01;
            const tamperedIv = toBase64(tamperedIvBytes);

            const tamperedEnvelope = { ...envelope, iv: tamperedIv };

            await expect(decryptString(dek, tamperedEnvelope, aad)).rejects.toThrow();
        });
    });

    describe('AAD Key-Swap Attack Prevention', () => {
        it('fails immediately when decrypting under swapped AAD context', async () => {
            const dek = await generateExtractableDek();
            const payload = JSON.stringify([{ id: 'tx-1', amount: 10000, recipient: 'Alice' }]);
            
            // Encrypt data under AAD = "gf_transactions"
            const envelope = await encryptString(dek, payload, 'gf_transactions');

            // Decryption with correct AAD succeeds
            const ok = await decryptString(dek, envelope, 'gf_transactions');
            expect(ok).toBe(payload);

            // Attempting to decrypt the exact envelope under AAD = "gf_accounts" MUST fail
            await expect(decryptString(dek, envelope, 'gf_accounts')).rejects.toThrow();
        });
    });

    describe('XSS Memory Protection (extractable: false)', () => {
        it('unwraps DEK as non-extractable and blocks exportKey with InvalidAccessError', async () => {
            const kdf = createKdfParams();
            const { kek } = await deriveMasterKeys('VaultMasterKey2026!', kdf);
            const extractableDek = await generateExtractableDek();
            const wrappedB64 = await wrapDek(extractableDek, kek);

            // Standard runtime unlock uses extractable: false
            const runtimeDek = await unwrapDek(wrappedB64, kek, false);

            expect(runtimeDek).toBeDefined();
            expect(runtimeDek.extractable).toBe(false);

            // Attempting to export the raw key from browser memory via malicious XSS script fails
            await expect(window.crypto.subtle.exportKey('raw', runtimeDek)).rejects.toThrow(/InvalidAccessError|key is not extractable/i);
        });
    });

    describe('WebAuthn Passkey PRF Derivation', () => {
        it('derives passkey KEK and wraps/unwraps DEK', async () => {
            const prfSecret = randomBytes(32);
            const saltB64 = toBase64(randomBytes(16));
            const passkeyKek = await derivePasskeyKek(prfSecret, saltB64);

            const dek = await generateExtractableDek();
            const wrapped = await wrapDek(dek, passkeyKek);

            const unwrapped = await unwrapDek(wrapped, passkeyKek, false);
            expect(unwrapped.extractable).toBe(false);

            // Wrong PRF secret fails
            const wrongPrfSecret = randomBytes(32);
            const wrongKek = await derivePasskeyKek(wrongPrfSecret, saltB64);
            await expect(unwrapDek(wrapped, wrongKek, false)).rejects.toThrow();
        });
    });

    describe('Recovery Key Parsing & Formatting', () => {
        it('formats, parses and derives KEK from high-entropy recovery key', async () => {
            const rawBytes = randomBytes(RECOVERY_KEY_BYTES);
            const formatted = formatRecoveryKey(rawBytes);

            // Must be 8 groups of 4 chars
            const parts = formatted.split('-');
            expect(parts.length).toBe(8);
            parts.forEach(p => expect(p.length).toBe(4));

            // Tolerates lowercase and spaces
            const messyInput = formatted.toLowerCase().replace('-', ' ').replace('-', '');
            const parsed = parseRecoveryKey(messyInput);
            expect(parsed).not.toBeNull();
            expect(Array.from(parsed!)).toEqual(Array.from(rawBytes));

            // Derives recovery KEK and unwraps DEK
            const dek = await generateExtractableDek();
            const salt = toBase64(randomBytes(16));
            const recoveryKek = await deriveRecoveryKek(parsed!, salt);
            const wrappedDek = await wrapDek(dek, recoveryKek);

            const unwrapped = await unwrapDek(wrappedDek, recoveryKek, false);
            expect(unwrapped).toBeDefined();
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

    describe('Proof-of-Work Anti-Bot Challenge & Timestamp Validation', () => {
        it('validates fresh PoW solutions and rejects expired or future-dated challenges', async () => {
            const challenge = createPowChallenge('test-pow');
            const { nonce, hash } = await solveProofOfWork(challenge, 2);

            // Fresh challenge is valid
            expect(await verifyProofOfWork(challenge, nonce, hash, 2)).toBe(true);

            // Expired challenge (simulated clock in the future beyond POW_MAX_AGE_MS)
            const expiredNow = Date.now() + POW_MAX_AGE_MS + 5_000;
            expect(await verifyProofOfWork(challenge, nonce, hash, 2, { now: expiredNow })).toBe(false);

            // Future-skewed challenge (> 60s ahead of server/verifier clock)
            const pastNow = Date.now() - 120_000;
            expect(await verifyProofOfWork(challenge, nonce, hash, 2, { now: pastNow })).toBe(false);
        });
    });
});
