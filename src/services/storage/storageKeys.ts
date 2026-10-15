/**
 * Storage key classification.
 *
 * Sensitive (encrypted when a vault exists): every `glassfolio_*` key
 * (user profile, transactions, positions, goals, AI settings, …).
 *
 * Plaintext: vault header + public market-data caches (`gf_*`, `glassfolio_price_cache`).
 */

export const VAULT_HEADER_KEY = 'gf_vault_header';

const SENSITIVE_PREFIX = 'glassfolio_';

/** `glassfolio_*` keys that only hold public market data. */
const PLAINTEXT_EXCEPTIONS: ReadonlySet<string> = new Set(['glassfolio_price_cache']);

export const isSensitiveKey = (key: string): boolean =>
    key.startsWith(SENSITIVE_PREFIX) && !PLAINTEXT_EXCEPTIONS.has(key);

/** Any key owned by GlassFolio (used by the vault reset to avoid wiping other apps on the same origin). */
export const isGlassFolioKey = (key: string): boolean =>
    key.startsWith(SENSITIVE_PREFIX) || key.startsWith('gf_');
