/**
 * Request signing for sync sources (TGLA-221).
 *
 * Signatures are computed in the browser with WebCrypto, so a provider secret (e.g. the SnapTrade
 * consumer key) never leaves the device: only the one-time signature travels through the relay.
 */
import { toBase64, utf8Encode, type Bytes } from './encoding';

const subtle = (): SubtleCrypto => {
    const api = globalThis.crypto?.subtle;
    if (!api) throw new Error('WebCrypto is not available in this browser.');
    return api;
};

export async function hmacSha256(key: string, message: string): Promise<Bytes> {
    const cryptoKey = await subtle().importKey('raw', utf8Encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await subtle().sign('HMAC', cryptoKey, utf8Encode(message))) as Bytes;
}

export async function hmacSha256Base64(key: string, message: string): Promise<string> {
    return toBase64(await hmacSha256(key, message));
}

export const toHex = (bytes: Uint8Array): string =>
    Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

/**
 * JSON with object keys sorted at every level and no whitespace: the canonical form signed by
 * providers such as SnapTrade (`json.dumps(..., sort_keys=True, separators=(",", ":"))`).
 */
export function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item === undefined ? null : item)).join(',')}]`;
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}
