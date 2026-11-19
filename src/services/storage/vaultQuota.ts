/**
 * Vault storage quota constants & error classification (Epic E38 — TGLA-214).
 *
 * Single source of truth mirrored on PostgreSQL by migrations 0001, 0006 and 0008:
 *  - public.vault_headers.header_json  <= 64 KB   (check_vault_header_size_limit)
 *  - public.vault_records.ciphertext   <= 5 MB    (check_ciphertext_size_limit)
 *  - public.vault_records per user     <= 64 keys (enforce_vault_record_quotas)
 *  - public.vault_records per user     <= 10 MB   (enforce_vault_record_quotas)
 */

export const VAULT_MAX_RECORDS = 64;
export const VAULT_MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 485 760 bytes (10 MB)
export const VAULT_MAX_RECORD_BYTES = 5 * 1024 * 1024; // 5 242 880 bytes (5 MB)
export const VAULT_MAX_HEADER_BYTES = 64 * 1024; // 65 536 bytes (64 KB)
export const VAULT_QUOTA_WARNING_RATIO = 0.8;

export type VaultQuotaReason = 'storage_limit' | 'record_limit' | 'record_size' | 'header_size';

export class VaultQuotaError extends Error {
    public readonly reason: VaultQuotaReason;

    constructor(reason: VaultQuotaReason, message?: string) {
        super(message ?? `Vault quota exceeded (${reason}).`);
        this.name = 'VaultQuotaError';
        this.reason = reason;
    }
}

const utf8Encoder = new TextEncoder();

/** UTF-8 byte length matching PostgreSQL octet_length() semantics. */
export function utf8ByteLength(value: string): number {
    return utf8Encoder.encode(value).byteLength;
}

/**
 * Classifies a PostgREST / PostgreSQL error payload into a typed VaultQuotaError,
 * or returns null if the error is unrelated to storage quotas.
 */
export function parseVaultQuotaError(rawMessage: string): VaultQuotaError | null {
    const normalized = rawMessage.toLowerCase();
    if (normalized.includes('vault storage quota exceeded')) {
        return new VaultQuotaError('storage_limit', rawMessage);
    }
    if (normalized.includes('vault record quota exceeded')) {
        return new VaultQuotaError('record_limit', rawMessage);
    }
    if (normalized.includes('check_ciphertext_size_limit')) {
        return new VaultQuotaError('record_size', rawMessage);
    }
    if (normalized.includes('check_vault_header_size_limit')) {
        return new VaultQuotaError('header_size', rawMessage);
    }
    return null;
}

export function isVaultQuotaError(err: unknown): err is VaultQuotaError {
    return err instanceof VaultQuotaError;
}
