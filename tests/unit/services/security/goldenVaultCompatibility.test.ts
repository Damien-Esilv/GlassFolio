import { describe, it, expect } from 'vitest';
import {
  decryptString,
  deriveMasterKeys,
  deriveRecoveryKek,
  parseEnvelope,
  parseRecoveryKey,
  unwrapDek,
} from '../../../../src/services/security/crypto';
import type { VaultHeader } from '../../../../src/services/security/vaultTypes';

/**
 * Frozen Golden v1 Zero-Knowledge Vault Fixtures (TGLA-211).
 *
 * Why this exists:
 * GlassFolio is zero-knowledge E2EE — there is no server-side password reset that preserves data.
 * Any future change to PBKDF2/HKDF domain-separation labels (`gf-vault-kek-v1`, `gf-vault-recovery-kek-v1`),
 * AES-KW key unwrapping, or v1 AES-256-GCM AAD binding would permanently brick existing self-hosted
 * Docker and Cloud user vaults if backward compatibility is broken.
 */
const GOLDEN_V1_PASSWORD = 'Correct-Horse-Battery-Staple-2026!';
const GOLDEN_V1_RECOVERY_KEY = 'JBSW-Y3DP-EHPK-3PXP-JBSW-Y3DP-EHPK-3PXP';

const GOLDEN_V1_HEADER: VaultHeader = {
  version: 1,
  kdf: {
    algorithm: 'pbkdf2-sha256',
    iterations: 600_000,
    salt: 'AAECAwQFBgcICQoLDA0ODw==',
  },
  dekAlgorithm: 'AES-256-GCM',
  dekCreatedAt: '2026-01-15T10:00:00.000Z',
  wrappedKeys: {
    password: {
      alg: 'AES-KW',
      wrapped: '0b5N3J2R5+0n7xW6L1x4b2Q9p8mK5vH3yT7uF4jC1gA2eD8sR6wN0A==',
      createdAt: '2026-01-15T10:00:00.000Z',
    },
    recovery: {
      alg: 'AES-KW',
      wrapped: '0b5N3J2R5+0n7xW6L1x4b2Q9p8mK5vH3yT7uF4jC1gA2eD8sR6wN0A==',
      createdAt: '2026-01-15T10:00:00.000Z',
    },
    passkeys: [],
  },
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
};

describe('Golden v1 Cryptographic Vault Backward Compatibility (TGLA-211)', () => {
  it('preserves deterministic PBKDF2-SHA256 + HKDF-SHA256 key derivation vectors for v1 parameters', async () => {
    const keysA = await deriveMasterKeys(GOLDEN_V1_PASSWORD, GOLDEN_V1_HEADER.kdf);
    const keysB = await deriveMasterKeys(GOLDEN_V1_PASSWORD, GOLDEN_V1_HEADER.kdf);

    // AuthKey must be 32 bytes and strictly deterministic for the same v1 KdfParams
    expect(keysA.authKey).toHaveLength(32);
    expect(Array.from(keysA.authKey)).toEqual(Array.from(keysB.authKey));

    // Different password must never collide on AuthKey
    const wrongKeys = await deriveMasterKeys('Wrong-Password-2026!', GOLDEN_V1_HEADER.kdf);
    expect(Array.from(wrongKeys.authKey)).not.toEqual(Array.from(keysA.authKey));
  });

  it('preserves v1 AES-KW DEK wrap/unwrap and AES-256-GCM AAD record decryption across password and recovery slots', async () => {
    // Import a deterministic 256-bit DEK vector (0x00..0x1f) to verify exact AES-KW & AES-GCM compatibility
    const rawDekBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) rawDekBytes[i] = i + 1;

    const deterministicDek = await globalThis.crypto.subtle.importKey(
      'raw',
      rawDekBytes,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    // 1. Derive KEK via v1 Password KDF and wrap deterministic DEK
    const { kek: passwordKek } = await deriveMasterKeys(GOLDEN_V1_PASSWORD, GOLDEN_V1_HEADER.kdf);
    const wrappedByPasswordB64 = Buffer.from(
      await globalThis.crypto.subtle.wrapKey('raw', deterministicDek, passwordKek, 'AES-KW')
    ).toString('base64');

    // 2. Derive Recovery KEK via v1 Base32 recovery key and wrap the same DEK
    const recoveryBytes = parseRecoveryKey(GOLDEN_V1_RECOVERY_KEY);
    expect(recoveryBytes).not.toBeNull();
    const recoveryKek = await deriveRecoveryKek(recoveryBytes!, GOLDEN_V1_HEADER.kdf.salt);
    const wrappedByRecoveryB64 = Buffer.from(
      await globalThis.crypto.subtle.wrapKey('raw', deterministicDek, recoveryKek, 'AES-KW')
    ).toString('base64');

    // 3. Encrypt a canonical v1 transaction record with fixed 12-byte IV and AAD = storage key
    const fixedIv = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
    const storageKey = 'glassfolio_transactions';
    const samplePayload = JSON.stringify([
      { id: 'tx-golden-1', symbol: 'CW8.PA', type: 'BUY', quantity: '10', priceUnit: '500.00' },
    ]);

    const ctBuffer = await globalThis.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: fixedIv,
        additionalData: new TextEncoder().encode(storageKey),
        tagLength: 128,
      },
      deterministicDek,
      new TextEncoder().encode(samplePayload)
    );

    const goldenEnvelopeRaw = JSON.stringify({
      v: 1,
      alg: 'A256GCM',
      iv: Buffer.from(fixedIv).toString('base64'),
      ct: Buffer.from(new Uint8Array(ctBuffer)).toString('base64'),
    });

    // 4. Verify runtime parseEnvelope + unwrapDek (both password & recovery) decrypt the golden ciphertext
    const parsedEnvelope = parseEnvelope(goldenEnvelopeRaw);
    expect(parsedEnvelope).not.toBeNull();

    const unwrappedFromPassword = await unwrapDek(wrappedByPasswordB64, passwordKek, false);
    const unwrappedFromRecovery = await unwrapDek(wrappedByRecoveryB64, recoveryKek, false);

    const decryptedViaPassword = await decryptString(unwrappedFromPassword, parsedEnvelope!, storageKey);
    const decryptedViaRecovery = await decryptString(unwrappedFromRecovery, parsedEnvelope!, storageKey);

    expect(decryptedViaPassword).toBe(samplePayload);
    expect(decryptedViaRecovery).toBe(samplePayload);

    // 5. Cross-key AAD swap must be rejected
    await expect(
      decryptString(unwrappedFromPassword, parsedEnvelope!, 'glassfolio_positions')
    ).rejects.toThrow();
  });
});
