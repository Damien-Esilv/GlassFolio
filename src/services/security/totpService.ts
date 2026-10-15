/**
 * RFC 6238 TOTP (Time-Based One-Time Password) Service (TGLA-042).
 *
 * Implements:
 *   - Native Web Crypto HMAC-SHA1.
 *   - Base32 secret generation and decoding (RFC 4648).
 *   - Drift tolerance window (±30s).
 *   - Anti-replay protection (monotonic time step).
 *   - Single-use SHA-256 hashed emergency backup codes.
 *   - Zero-knowledge storage in appStorage (encrypted at rest).
 */

import { fromBase32, toBase32, toBase64, utf8Encode } from './encoding';
import { appStorage } from '../storage/appStorage';

const TOTP_STORAGE_KEY = 'glassfolio_security_totp';
const DEFAULT_STEP_SEC = 30;
const DEFAULT_DIGITS = 6;
const DEFAULT_TOLERANCE_STEPS = 1;

export interface TotpConfig {
    secret: string;
    enabled: boolean;
    hashedBackupCodes: string[];
    lastVerifiedStep?: number;
    enrolledAt: string;
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

        if (candidate === cleanToken) {
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
    const index = hashedCodes.indexOf(testHash);

    if (index === -1) {
        return { valid: false, remainingHashes: hashedCodes };
    }

    const remainingHashes = [...hashedCodes.slice(0, index), ...hashedCodes.slice(index + 1)];
    return { valid: true, remainingHashes };
};

// ── Persistent Configuration Service ─────────────────────────────────────────

export const totpService = {
    async getConfig(): Promise<TotpConfig | null> {
        const raw = appStorage.getItem(TOTP_STORAGE_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as TotpConfig;
        } catch {
            return null;
        }
    },

    async isEnabled(): Promise<boolean> {
        const config = await this.getConfig();
        return Boolean(config && config.enabled);
    },

    async initEnrollment(accountName: string): Promise<TotpEnrollment> {
        const secret = generateTotpSecret(20);
        const uri = generateTotpUri(accountName, secret);
        const { plainCodes, hashedCodes } = await generateBackupCodes(10);
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
        hashedBackupCodes: string[]
    ): Promise<boolean> {
        const result = await verifyTotpCode(secret, token);
        if (!result.valid || result.step === undefined) {
            return false;
        }

        const config: TotpConfig = {
            secret,
            enabled: true,
            hashedBackupCodes,
            lastVerifiedStep: result.step,
            enrolledAt: new Date().toISOString(),
        };

        appStorage.setItem(TOTP_STORAGE_KEY, JSON.stringify(config));
        return true;
    },

    async verify(tokenOrBackupCode: string): Promise<boolean> {
        const config = await this.getConfig();
        if (!config || !config.enabled) return false;

        // Try TOTP 6-digit first
        const totpRes = await verifyTotpCode(config.secret, tokenOrBackupCode, {
            lastVerifiedStep: config.lastVerifiedStep,
        });

        if (totpRes.valid && totpRes.step !== undefined) {
            config.lastVerifiedStep = totpRes.step;
            appStorage.setItem(TOTP_STORAGE_KEY, JSON.stringify(config));
            return true;
        }

        // Fallback to emergency backup code
        const backupRes = await verifyBackupCode(tokenOrBackupCode, config.hashedBackupCodes);
        if (backupRes.valid) {
            config.hashedBackupCodes = backupRes.remainingHashes;
            appStorage.setItem(TOTP_STORAGE_KEY, JSON.stringify(config));
            return true;
        }

        return false;
    },

    async disable(): Promise<void> {
        appStorage.removeItem(TOTP_STORAGE_KEY);
    },
};
