/**
 * Crypto primitives for the GlassFolio E2EE encrypted vault (TGLA-041).
 *
 * Built only on the native Web Crypto API (no third-party crypto, no WASM).
 *
 * Key hierarchy (Dual-Key derivation):
 *   password ──PBKDF2-SHA256 (600k, 16B salt)──► Master Key (256 bits, transient)
 *   Master Key ──HKDF-SHA256 info="gf-vault-kek-v1"──► KEK  (AES-KW, non-extractable)
 *   Master Key ──HKDF-SHA256 info="gf-auth-key-v1"───► AuthKey (256 bits, for authService)
 *   recovery key ──HKDF-SHA256 info="gf-vault-recovery-kek-v1"──► Recovery KEK
 *   KEK ──AES-KW wrap──► DEK (AES-256-GCM) — encrypts every sensitive record.
 */

import { Bytes, fromBase32, fromBase64, toBase32, toBase64, utf8Decode, utf8Encode } from './encoding';
import { EncryptedEnvelope, KdfParams } from './vaultTypes';

export { toBase64, fromBase64, toBase32, fromBase32, utf8Encode, utf8Decode };

export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const RECOVERY_KEY_BYTES = 20; // 160 bits → 32 Base32 chars
export const RECOVERY_KEY_256_BYTES = 32; // 256 bits → 52/56 Base32 chars
const KEY_BITS = 256;
const MAX_ITERATIONS = 10_000_000;

export const HKDF_INFO = {
    KEK: 'gf-vault-kek-v1',
    AUTH: 'gf-auth-key-v1',
    RECOVERY_KEK: 'gf-vault-recovery-kek-v1',
    PASSKEY_KEK: 'gf-vault-passkey-kek-v1',
    OAUTH_KEK: 'gf-vault-oauth-kek-v1',
    DRIVE_KEK: 'gf-vault-gdrive-kek-v1',
} as const;

export class CryptoUnavailableError extends Error {
    constructor() {
        super('Web Crypto API (crypto.subtle) is not available in this context.');
        this.name = 'CryptoUnavailableError';
    }
}

const subtle = (): SubtleCrypto => {
    const s = globalThis.crypto?.subtle;
    if (!s) throw new CryptoUnavailableError();
    return s;
};

export const isCryptoAvailable = (): boolean => Boolean(globalThis.crypto?.subtle);

export const randomBytes = (length: number): Bytes =>
    globalThis.crypto.getRandomValues(new Uint8Array(length));

/** Best-effort wipe of transient key material. */
export const wipe = (bytes: Uint8Array): void => {
    bytes.fill(0);
};

// ── KDF ───────────────────────────────────────────────────────────────────────

export const createKdfParams = (iterations: number = PBKDF2_ITERATIONS): KdfParams => ({
    algorithm: 'pbkdf2-sha256',
    iterations,
    salt: toBase64(randomBytes(SALT_BYTES)),
});

export interface MasterKeys {
    /** AES-KW key used exclusively to wrap/unwrap the DEK. Non-extractable. */
    kek: CryptoKey;
    /** 256-bit key reserved for authentication verification (authService). */
    authKey: Bytes;
}

const hkdfParams = (info: string, salt: Bytes = new Uint8Array(0)): HkdfParams => ({
    name: 'HKDF',
    hash: 'SHA-256',
    salt,
    info: utf8Encode(info),
});

/**
 * Derives the KEK and AuthKey from the master password (PBKDF2 → HKDF).
 * The intermediate Master Key never leaves this function.
 */
export const deriveMasterKeys = async (password: string, params: KdfParams): Promise<MasterKeys> => {
    if (params.algorithm !== 'pbkdf2-sha256') {
        throw new Error(`Unsupported KDF: ${String(params.algorithm)}`);
    }
    if (!Number.isInteger(params.iterations) || params.iterations < PBKDF2_ITERATIONS || params.iterations > MAX_ITERATIONS) {
        throw new Error('Invalid KDF iteration count: below security floor');
    }
    const s = subtle();
    const passwordBytes = utf8Encode(password.normalize('NFKC'));
    const passwordKey = await s.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveBits']);
    wipe(passwordBytes);

    const masterBits = new Uint8Array(
        await s.deriveBits(
            { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(params.salt), iterations: params.iterations },
            passwordKey,
            KEY_BITS
        )
    );
    const masterKey = await s.importKey('raw', masterBits, 'HKDF', false, ['deriveKey', 'deriveBits']);
    wipe(masterBits);

    const kek = await s.deriveKey(
        hkdfParams(HKDF_INFO.KEK),
        masterKey,
        { name: 'AES-KW', length: KEY_BITS },
        false,
        ['wrapKey', 'unwrapKey']
    );
    const authKey = new Uint8Array(await s.deriveBits(hkdfParams(HKDF_INFO.AUTH), masterKey, KEY_BITS));
    return { kek, authKey };
};

/** Derives the recovery KEK from the high-entropy recovery key (no PBKDF2 needed). */
export const deriveRecoveryKek = async (recoveryBytes: Bytes, saltB64: string): Promise<CryptoKey> => {
    const s = subtle();
    const base = await s.importKey('raw', recoveryBytes, 'HKDF', false, ['deriveKey']);
    return s.deriveKey(
        hkdfParams(HKDF_INFO.RECOVERY_KEK, fromBase64(saltB64)),
        base,
        { name: 'AES-KW', length: KEY_BITS },
        false,
        ['wrapKey', 'unwrapKey']
    );
};

/** Derives the passkey KEK from the high-entropy WebAuthn PRF output. */
export const derivePasskeyKek = async (prfSecret: Bytes, saltB64: string): Promise<CryptoKey> => {
    const s = subtle();
    const base = await s.importKey('raw', prfSecret, 'HKDF', false, ['deriveKey']);
    return s.deriveKey(
        hkdfParams(HKDF_INFO.PASSKEY_KEK, fromBase64(saltB64)),
        base,
        { name: 'AES-KW', length: KEY_BITS },
        false,
        ['wrapKey', 'unwrapKey']
    );
};

/** Derives the Google Drive vault KEK from the 256-bit root secret stored in appDataFolder. */
export const deriveDriveVaultKek = async (driveSecret: Uint8Array, saltB64: string): Promise<CryptoKey> => {
    const s = subtle();
    const base = await s.importKey('raw', driveSecret, 'HKDF', false, ['deriveKey']);
    return s.deriveKey(
        hkdfParams(HKDF_INFO.DRIVE_KEK, fromBase64(saltB64)),
        base,
        { name: 'AES-KW', length: KEY_BITS },
        false,
        ['wrapKey', 'unwrapKey']
    );
};

/** Derives the OAuth KEK from verified Google OAuth identity material (0-Password flow). */
export const deriveOAuthKek = async (oauthSecret: string, saltB64: string): Promise<CryptoKey> => {
    const s = subtle();
    const secretBytes = utf8Encode(oauthSecret.normalize('NFKC'));
    const base = await s.importKey('raw', secretBytes, 'HKDF', false, ['deriveKey']);
    wipe(secretBytes);
    return s.deriveKey(
        hkdfParams(HKDF_INFO.OAUTH_KEK, fromBase64(saltB64)),
        base,
        { name: 'AES-KW', length: KEY_BITS },
        false,
        ['wrapKey', 'unwrapKey']
    );
};

// ── DEK management ────────────────────────────────────────────────────────────

/** Generates a fresh DEK. Extractable ONLY so it can be wrapped during setup/enrollment. */
export const generateExtractableDek = async (): Promise<CryptoKey> =>
    subtle().generateKey({ name: 'AES-GCM', length: KEY_BITS }, true, ['encrypt', 'decrypt']);

export const wrapDek = async (dek: CryptoKey, kek: CryptoKey): Promise<string> =>
    toBase64(new Uint8Array(await subtle().wrapKey('raw', dek, kek, 'AES-KW')));

/**
 * Unwraps the DEK. Use `extractable: false` for runtime (XSS hardening); `true` only
 * momentarily when the DEK must be re-wrapped under a new KEK.
 * Rejects (OperationError) if the KEK is wrong — AES-KW has a built-in integrity check.
 */
export const unwrapDek = async (wrappedB64: string, kek: CryptoKey, extractable: boolean): Promise<CryptoKey> =>
    subtle().unwrapKey(
        'raw',
        fromBase64(wrappedB64),
        kek,
        'AES-KW',
        { name: 'AES-GCM', length: KEY_BITS },
        extractable,
        ['encrypt', 'decrypt']
    );

// ── Record encryption (AES-256-GCM, AAD = storage key) ───────────────────────

export const encryptString = async (dek: CryptoKey, plaintext: string, aad: string): Promise<EncryptedEnvelope> => {
    const iv = randomBytes(IV_BYTES);
    const ct = await subtle().encrypt(
        { name: 'AES-GCM', iv, additionalData: utf8Encode(aad), tagLength: 128 },
        dek,
        utf8Encode(plaintext)
    );
    return { v: 1, alg: 'A256GCM', iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
};

/** Rejects if the key, IV, AAD or ciphertext do not match (tamper detection). */
export const decryptString = async (dek: CryptoKey, envelope: EncryptedEnvelope, aad: string): Promise<string> => {
    const pt = await subtle().decrypt(
        { name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData: utf8Encode(aad), tagLength: 128 },
        dek,
        fromBase64(envelope.ct)
    );
    return utf8Decode(new Uint8Array(pt));
};

export const serializeEnvelope = (envelope: EncryptedEnvelope): string => JSON.stringify(envelope);

/** Returns the envelope if `raw` is a valid v1 envelope, otherwise null (e.g. legacy plaintext). */
export const parseEnvelope = (raw: string | null): EncryptedEnvelope | null => {
    if (!raw || !raw.startsWith('{"v":1')) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (
            typeof parsed === 'object' && parsed !== null &&
            (parsed as EncryptedEnvelope).v === 1 &&
            (parsed as EncryptedEnvelope).alg === 'A256GCM' &&
            typeof (parsed as EncryptedEnvelope).iv === 'string' &&
            typeof (parsed as EncryptedEnvelope).ct === 'string' &&
            Object.keys(parsed).length === 4
        ) {
            return parsed as EncryptedEnvelope;
        }
    } catch {
        // not JSON → not an envelope
    }
    return null;
};

// ── Recovery key formatting ───────────────────────────────────────────────────

/** "ABCD-EFGH-…" (8 groups of 4 Base32 chars). */
export const formatRecoveryKey = (bytes: Uint8Array): string =>
    (toBase32(bytes).match(/.{1,4}/g) ?? []).join('-');

/** Parses a user-typed recovery key (case/space/dash tolerant). Returns null if malformed. */
export const parseRecoveryKey = (input: string): Bytes | null => {
    try {
        const bytes = fromBase32(input);
        return (bytes.length === RECOVERY_KEY_BYTES || bytes.length === RECOVERY_KEY_256_BYTES)
            ? bytes
            : null;
    } catch {
        return null;
    }
};

// ── Lightweight WebCrypto SHA-256 Proof-of-Work (Anti-Bot) ───────────────────

export const POW_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes TTL

export const createPowChallenge = (prefix = 'gf-pow'): string => {
    const random = toBase64(randomBytes(16));
    const timestamp = Date.now().toString(36);
    return `${prefix}:${timestamp}:${random}`;
};

export const solveProofOfWork = async (
    challenge: string,
    difficultyZeroNibbles = 3
): Promise<{ nonce: number; hash: string }> => {
    const s = subtle();
    const targetPrefix = '0'.repeat(difficultyZeroNibbles);
    let nonce = 0;

    while (nonce < 1_000_000) {
        const payload = `${challenge}:${nonce}`;
        const digest = await s.digest('SHA-256', utf8Encode(payload));
        const hex = Array.from(new Uint8Array(digest))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        if (hex.startsWith(targetPrefix)) {
            return { nonce, hash: hex };
        }
        nonce++;
    }

    throw new Error('PoW solution exceeded maximum iterations');
};

export const verifyProofOfWork = async (
    challenge: string,
    nonce: number,
    claimedHash: string,
    difficultyZeroNibbles = 3,
    options?: { maxAgeMs?: number; now?: number }
): Promise<boolean> => {
    try {
        if (!challenge || typeof challenge !== 'string') return false;
        const parts = challenge.split(':');
        // Validate challenge format: prefix:timestampBase36:randomBytesBase64
        if (parts.length >= 3) {
            const timestamp = parseInt(parts[1], 36);
            if (!Number.isNaN(timestamp)) {
                const now = options?.now ?? Date.now();
                const maxAge = options?.maxAgeMs ?? POW_MAX_AGE_MS;
                // Clock skew allowance: 60s into future, maxAge into past
                if (timestamp > now + 60_000 || now - timestamp > maxAge) {
                    return false;
                }
            }
        }

        const targetPrefix = '0'.repeat(difficultyZeroNibbles);
        if (!claimedHash.startsWith(targetPrefix)) return false;

        const s = subtle();
        const payload = `${challenge}:${nonce}`;
        const digest = await s.digest('SHA-256', utf8Encode(payload));
        const calculatedHex = Array.from(new Uint8Array(digest))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        return calculatedHex === claimedHash;
    } catch {
        return false;
    }
};
