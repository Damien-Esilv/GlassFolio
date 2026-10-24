/**
 * Binary encoding helpers (Base64 / Base32 / UTF-8) for the security layer.
 *
 * Pure functions, no I/O. Base32 follows RFC 4648 (no padding) and is shared
 * with the future TOTP implementation (TGLA-042).
 */

export type Bytes = Uint8Array<ArrayBuffer>;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const utf8Encode = (value: string): Bytes => textEncoder.encode(value) as Bytes;

export const utf8Decode = (bytes: Uint8Array): string => textDecoder.decode(bytes);

// ── Base64 ────────────────────────────────────────────────────────────────────

export const toBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
};

export const fromBase64 = (value: string): Bytes => {
    let standard = value.replace(/-/g, '+').replace(/_/g, '/');
    while (standard.length % 4 !== 0) {
        standard += '=';
    }
    const binary = atob(standard);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

// ── Base32 (RFC 4648, no padding) ─────────────────────────────────────────────

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const toBase32 = (bytes: Uint8Array): string => {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }
    return output;
};

/**
 * Decodes RFC 4648 Base32. Ignores whitespace, dashes and padding; case-insensitive.
 * Throws on any other invalid character.
 */
export const fromBase32 = (value: string): Bytes => {
    const clean = value.toUpperCase().replace(/[\s=-]/g, '');
    let bits = 0;
    let acc = 0;
    const out: number[] = [];
    for (const char of clean) {
        const idx = BASE32_ALPHABET.indexOf(char);
        if (idx === -1) {
            throw new Error('Invalid Base32 character');
        }
        acc = (acc << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((acc >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return new Uint8Array(out);
};

// ── Timing-Safe Comparison ───────────────────────────────────────────────────

/**
 * Constant-time string comparison to prevent timing side-channel attacks on secret/hash verifications.
 */
export const constantTimeCompare = (a: string, b: string): boolean => {
    let diff = a.length ^ b.length;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
};
