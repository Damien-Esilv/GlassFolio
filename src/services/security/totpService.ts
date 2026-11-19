/**
 * RFC 6238 TOTP (Time-Based One-Time Password) Service (TGLA-042).
 *
 * Implements:
 *   - Native Web Crypto HMAC-SHA1.
 *   - Base32 secret generation and decoding (RFC 4648).
 *   - Drift tolerance window (±30s).
 *   - Anti-replay protection (monotonic time step).
 *   - Single-use SHA-256 hashed emergency backup codes.
 *   - E2EE storage in appStorage (encrypted at rest).
 */

import { constantTimeCompare, fromBase32, toBase32, toBase64, utf8Encode } from './encoding';
import { appStorage } from '../storage/appStorage';
import { LEGACY_TOTP_FLAG_KEY } from '../storage/storageKeys';
import { deduplicateLabel } from './passkeyAaguid';

const TOTP_STORAGE_KEY = 'glassfolio_security_totp';
const DEFAULT_STEP_SEC = 30;
const DEFAULT_DIGITS = 6;
const DEFAULT_TOLERANCE_STEPS = 1;
export const MAX_TOTP_FACTORS = 5;

export interface TotpConfig {
    secret: string;
    enabled: boolean;
    hashedBackupCodes: string[];
    lastVerifiedStep?: number;
    enrolledAt: string;
}

export interface TotpFactorRecord {
    id: string;
    friendlyName: string;
    secret: string;
    enrolledAt: string;
    lastVerifiedStep?: number;
}

export interface TotpStore {
    version: 2;
    factors: TotpFactorRecord[];
    hashedBackupCodes: string[];
}

export interface TotpEnrollment {
    secret: string;
    uri: string;
    plainBackupCodes: string[];
    hashedBackupCodes: string[];
}

/**
 * Generates a cryptographically random Base32 secret (20 bytes / 160 bits by default).
 */
export const generateTotpSecret = (lengthBytes = 20): string => {
    const bytes = new Uint8Array(lengthBytes);
    window.crypto.getRandomValues(bytes);
    return toBase32(bytes);
};

/**
 * Generates an RFC 6238 compatible otpauth:// URI.
 */
export const generateTotpUri = (
    accountName: string,
    secret: string,
    issuer = 'GlassFolio'
): string => {
    const cleanAccount = encodeURIComponent(accountName.trim());
    const cleanIssuer = encodeURIComponent(issuer.trim());
    return `otpauth://totp/${cleanIssuer}:${cleanAccount}?secret=${secret}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=30`;
};

/**
 * Computes an RFC 6238 6-digit TOTP code for a given timestamp.
 */
export const generateTotpCode = async (
    secret: string,
    timestampMs: number = Date.now(),
    timeStepSec: number = DEFAULT_STEP_SEC,
    digits: number = DEFAULT_DIGITS
): Promise<string> => {
    const keyBytes = fromBase32(secret);
    const counter = BigInt(Math.floor(timestampMs / 1000 / timeStepSec));

    // Convert 64-bit integer counter to 8-byte big-endian buffer
    const timeBuffer = new ArrayBuffer(8);
    const view = new DataView(timeBuffer);
    view.setBigUint64(0, counter, false);

    const hmacKey = await window.crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
    );

    const signature = await window.crypto.subtle.sign('HMAC', hmacKey, timeBuffer);
    const hash = new Uint8Array(signature);

    // Dynamic truncation (RFC 4226 section 5.4)
    const offset = hash[hash.length - 1] & 0x0f;
    const binary =
        ((hash[offset] & 0x7f) << 24) |
        ((hash[offset + 1] & 0xff) << 16) |
        ((hash[offset + 2] & 0xff) << 8) |
        (hash[offset + 3] & 0xff);

    const modulo = Math.pow(10, digits);
    const token = (binary % modulo).toString().padStart(digits, '0');
    return token;
};

/**
 * Verifies a 6-digit TOTP token against drift windows with anti-replay protection.
 */
export const verifyTotpCode = async (
    secret: string,
    token: string,
    options?: {
        timestampMs?: number;
        toleranceSteps?: number;
        lastVerifiedStep?: number;
    }
): Promise<{ valid: boolean; step?: number }> => {
    const cleanToken = token.trim().replace(/\s/g, '');
    if (!/^\d{6}$/.test(cleanToken)) {
        return { valid: false };
    }

    const timestampMs = options?.timestampMs ?? Date.now();
    const tolerance = options?.toleranceSteps ?? DEFAULT_TOLERANCE_STEPS;
    const lastStep = options?.lastVerifiedStep ?? -1;
    const currentStep = Math.floor(timestampMs / 1000 / DEFAULT_STEP_SEC);

    for (let offset = -tolerance; offset <= tolerance; offset++) {
        const checkStep = currentStep + offset;
        if (checkStep <= lastStep) {
            // Anti-replay: skip steps that were already consumed
            continue;
        }

        const candidate = await generateTotpCode(
            secret,
            checkStep * DEFAULT_STEP_SEC * 1000,
            DEFAULT_STEP_SEC,
            DEFAULT_DIGITS
        );

        if (constantTimeCompare(candidate, cleanToken)) {
            return { valid: true, step: checkStep };
        }
    }

    return { valid: false };
};

/**
 * Generates 10 single-use backup codes (XXXX-XXXX format) and their SHA-256 hashes.
 */
export const generateBackupCodes = async (count = 10): Promise<{ plainCodes: string[]; hashedCodes: string[] }> => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const plainCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < count; i++) {
        const randomBytes = new Uint8Array(8);
        window.crypto.getRandomValues(randomBytes);
        let raw = '';
        for (let j = 0; j < 8; j++) {
            raw += alphabet[randomBytes[j] % alphabet.length];
        }
        const formatted = `${raw.slice(0, 4)}-${raw.slice(4)}`;
        plainCodes.push(formatted);
        const hash = await hashBackupCode(formatted);
        hashedCodes.push(hash);
    }

    return { plainCodes, hashedCodes };
};

export const hashBackupCode = async (code: string): Promise<string> => {
    const normalized = code.replace(/[-\s]/g, '').toUpperCase();
    const digest = await window.crypto.subtle.digest('SHA-256', utf8Encode(normalized));
    return toBase64(new Uint8Array(digest));
};

/**
 * Verifies a single-use backup code, returning remaining unconsumed hashes if valid.
 */
export const verifyBackupCode = async (
    code: string,
    hashedCodes: string[]
): Promise<{ valid: boolean; remainingHashes: string[] }> => {
    if (!code || !hashedCodes || hashedCodes.length === 0) {
        return { valid: false, remainingHashes: hashedCodes || [] };
    }

    const testHash = await hashBackupCode(code);
    let foundIndex = -1;
    for (let i = 0; i < hashedCodes.length; i++) {
        if (constantTimeCompare(hashedCodes[i], testHash) && foundIndex === -1) {
            foundIndex = i;
        }
    }

    if (foundIndex === -1) {
        return { valid: false, remainingHashes: hashedCodes };
    }

    const remainingHashes = [...hashedCodes.slice(0, foundIndex), ...hashedCodes.slice(foundIndex + 1)];
    return { valid: true, remainingHashes };
};

// ── Persistent Configuration Service ─────────────────────────────────────────

const generateFactorId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
};

const isV2Store = (parsed: unknown): parsed is TotpStore =>
    Boolean(
        parsed
        && typeof parsed === 'object'
        && (parsed as { version?: unknown }).version === 2
        && Array.isArray((parsed as { factors?: unknown }).factors)
    );

const readStore = (): TotpStore | null => {
    const raw = appStorage.getItem(TOTP_STORAGE_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (isV2Store(parsed)) {
            return {
                version: 2,
                factors: parsed.factors,
                hashedBackupCodes: Array.isArray(parsed.hashedBackupCodes) ? parsed.hashedBackupCodes : [],
            };
        }
        // Transparent migration from v1 single-factor TotpConfig
        const legacy = parsed as Partial<TotpConfig>;
        if (legacy && legacy.enabled && typeof legacy.secret === 'string' && legacy.secret.length > 0) {
            return {
                version: 2,
                factors: [{
                    id: 'legacy-totp',
                    friendlyName: 'Authenticator',
                    secret: legacy.secret,
                    enrolledAt: legacy.enrolledAt || new Date().toISOString(),
                    lastVerifiedStep: legacy.lastVerifiedStep,
                }],
                hashedBackupCodes: Array.isArray(legacy.hashedBackupCodes) ? legacy.hashedBackupCodes : [],
            };
        }
        return null;
    } catch {
        return null;
    }
};

const writeStore = (store: TotpStore): void => {
    appStorage.setItem(TOTP_STORAGE_KEY, JSON.stringify(store));
};

export const totpService = {
    async getStore(): Promise<TotpStore | null> {
        return readStore();
    },

    async listFactors(): Promise<TotpFactorRecord[]> {
        const store = readStore();
        return store ? store.factors : [];
    },

    async getRemainingBackupCodesCount(): Promise<number> {
        const store = readStore();
        return store ? store.hashedBackupCodes.length : 0;
    },

    async getConfig(): Promise<TotpConfig | null> {
        const store = readStore();
        const primary = store?.factors[0];
        if (!store || !primary) return null;
        return {
            secret: primary.secret,
            enabled: true,
            hashedBackupCodes: store.hashedBackupCodes,
            lastVerifiedStep: primary.lastVerifiedStep,
            enrolledAt: primary.enrolledAt,
        };
    },

    /** Local mode only: reads the vault, so it must be called once the vault is unlocked. */
    async isEnabled(): Promise<boolean> {
        const store = readStore();
        return Boolean(store && store.factors.length > 0);
    },

    async initEnrollment(accountName: string, customSecret?: string, customUri?: string): Promise<TotpEnrollment> {
        const secret = customSecret || generateTotpSecret(20);
        const uri = customUri || generateTotpUri(accountName, secret);
        const store = readStore();
        const hasExistingFactors = Boolean(store && store.factors.length > 0);
        const { plainCodes, hashedCodes } = hasExistingFactors
            ? { plainCodes: [], hashedCodes: [] }
            : await generateBackupCodes(10);
        return {
            secret,
            uri,
            plainBackupCodes: plainCodes,
            hashedBackupCodes: hashedCodes,
        };
    },

    async confirmEnrollment(
        secret: string,
        token: string,
        hashedBackupCodes: string[],
        friendlyName?: string
    ): Promise<boolean> {
        const existing = readStore();
        const currentFactors = existing?.factors ?? [];
        if (currentFactors.length >= MAX_TOTP_FACTORS) {
            throw new Error('Maximum number of authenticator apps reached.');
        }

        const trimmedName = friendlyName?.trim();
        if (trimmedName) {
            const lower = trimmedName.toLowerCase();
            if (currentFactors.some(f => f.friendlyName.trim().toLowerCase() === lower)) {
                throw new Error('An authenticator app with this name already exists.');
            }
        }

        const result = await verifyTotpCode(secret, token);
        if (!result.valid || result.step === undefined) {
            return false;
        }

        const resolvedName = trimmedName || deduplicateLabel(
            'Authenticator',
            currentFactors.map(f => f.friendlyName)
        );

        const nextFactor: TotpFactorRecord = {
            id: generateFactorId(),
            friendlyName: resolvedName,
            secret,
            enrolledAt: new Date().toISOString(),
            lastVerifiedStep: result.step,
        };

        const preservedBackupCodes = existing && existing.factors.length > 0
            ? existing.hashedBackupCodes
            : hashedBackupCodes;

        writeStore({
            version: 2,
            factors: [...currentFactors, nextFactor],
            hashedBackupCodes: preservedBackupCodes,
        });
        return true;
    },

    async verify(tokenOrBackupCode: string, factorId?: string): Promise<boolean> {
        const store = readStore();
        if (!store || store.factors.length === 0) return false;

        const candidates = factorId
            ? store.factors.filter(f => f.id === factorId)
            : store.factors;

        for (const candidate of candidates) {
            const totpRes = await verifyTotpCode(candidate.secret, tokenOrBackupCode, {
                lastVerifiedStep: candidate.lastVerifiedStep,
            });

            if (totpRes.valid && totpRes.step !== undefined) {
                const updatedFactors = store.factors.map(f =>
                    f.id === candidate.id ? { ...f, lastVerifiedStep: totpRes.step } : f
                );
                writeStore({ ...store, factors: updatedFactors });
                return true;
            }
        }

        // Fallback to vault-wide single-use emergency backup codes
        const backupRes = await verifyBackupCode(tokenOrBackupCode, store.hashedBackupCodes);
        if (backupRes.valid) {
            writeStore({ ...store, hashedBackupCodes: backupRes.remainingHashes });
            return true;
        }

        return false;
    },

    async removeFactor(factorId: string): Promise<void> {
        const store = readStore();
        if (!store) return;
        const remaining = store.factors.filter(f => f.id !== factorId);
        if (remaining.length === 0) {
            await this.disable();
            return;
        }
        writeStore({ ...store, factors: remaining });
    },

    async renameFactor(factorId: string, newName: string): Promise<void> {
        const trimmed = newName.trim();
        if (!trimmed) return;
        const store = readStore();
        if (!store) return;
        const lower = trimmed.toLowerCase();
        if (store.factors.some(f => f.id !== factorId && f.friendlyName.trim().toLowerCase() === lower)) {
            throw new Error('An authenticator app with this name already exists.');
        }
        const updated = store.factors.map(f => (f.id === factorId ? { ...f, friendlyName: trimmed } : f));
        writeStore({ ...store, factors: updated });
    },

    async regenerateBackupCodes(): Promise<string[]> {
        const store = readStore();
        if (!store || store.factors.length === 0) {
            throw new Error('No verified authenticator app is enrolled on this account.');
        }
        const { plainCodes, hashedCodes } = await generateBackupCodes(10);
        writeStore({ ...store, hashedBackupCodes: hashedCodes });
        return plainCodes;
    },

    async disable(): Promise<void> {
        appStorage.removeItem(TOTP_STORAGE_KEY);
        appStorage.getBacking().removeItem(LEGACY_TOTP_FLAG_KEY);
    },
};
