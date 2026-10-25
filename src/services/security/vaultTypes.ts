/**
 * Vault types — serializable, non-secret metadata only.
 * All dates are ISO 8601 strings.
 */

export interface KdfParams {
    algorithm: 'pbkdf2-sha256';
    iterations: number;
    /** Base64, 16 random bytes. */
    salt: string;
}

export interface WrappedKeyEntry {
    alg: 'AES-KW';
    /** Base64 AES-KW-wrapped DEK. */
    wrapped: string;
    createdAt: string;
    /** Dedicated 16-byte random salt (Base64) to preserve slot independence across password changes. */
    salt?: string;
}

/** Reserved for TGLA-042 (WebAuthn PRF unlock). */
export interface PasskeyWrappedKeyEntry extends WrappedKeyEntry {
    credentialId: string;
    label: string;
}

/** Single serializable record stored under `gf_vault_header`. */
export interface VaultHeader {
    version: 1;
    kdf: KdfParams;
    dekAlgorithm: 'AES-256-GCM';
    wrappedKeys: {
        password: WrappedKeyEntry;
        recovery: WrappedKeyEntry | null;
        passkeys: PasskeyWrappedKeyEntry[];
    };
    /** Aliases maintained in sync for multi-slot clarity */
    passwordSlot?: WrappedKeyEntry;
    recoverySlot?: WrappedKeyEntry | null;
    createdAt: string;
    updatedAt: string;
    dekCreatedAt: string;
    /** Distinguishes demo/test vaults from real personal/cloud user vaults */
    isDemo?: boolean;
    /** Tracks whether vault was initialized via local, email, or Google OAuth */
    authProvider?: 'local' | 'email' | 'google' | 'demo';
    /** Tracks whether two-factor authentication is active on this vault */
    totpEnabled?: boolean;
}

/** On-disk format of every encrypted record. */
export interface EncryptedEnvelope {
    v: 1;
    alg: 'A256GCM';
    /** Base64 96-bit IV. */
    iv: string;
    /** Base64 ciphertext + 128-bit GCM tag. */
    ct: string;
}

export type VaultStatus = 'uninitialized' | 'locked' | 'unlocked';

export interface VaultSetupResult {
    /** Shown ONCE to the user. Never persisted in clear. */
    recoveryKey: string;
    authKey: Uint8Array;
}

export interface VaultUnlockResult {
    authKey: Uint8Array;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class VaultLockedError extends Error {
    constructor(key?: string) {
        super(key ? `Vault is locked — cannot write "${key}".` : 'Vault is locked.');
        this.name = 'VaultLockedError';
    }
}

export class VaultNotInitializedError extends Error {
    constructor() {
        super('Vault is not initialized.');
        this.name = 'VaultNotInitializedError';
    }
}

export class VaultAlreadyInitializedError extends Error {
    constructor() {
        super('A vault already exists on this device.');
        this.name = 'VaultAlreadyInitializedError';
    }
}

export class InvalidVaultCredentialsError extends Error {
    constructor() {
        super('Invalid password or recovery key.');
        this.name = 'InvalidVaultCredentialsError';
    }
}

export class VaultHeaderCorruptedError extends Error {
    constructor() {
        super('Vault header is missing or corrupted.');
        this.name = 'VaultHeaderCorruptedError';
    }
}
