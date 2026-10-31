/**
 * Storage key classification.
 *
 * Sensitive (encrypted when a vault exists): every `glassfolio_*` key
 * (user profile, transactions, positions, goals, AI settings, …).
 *
 * Plaintext: vault header + public market-data caches (`gf_*`, `glassfolio_price_cache`).
 */

export const VAULT_HEADER_KEY = 'gf_vault_header';
export const CONSENT_STORAGE_KEY = 'gf_consent_v1';
export const PUBLIC_THEME_STORAGE_KEY = 'gf_public_theme';
export const PUBLIC_LANG_STORAGE_KEY = 'gf_public_lang';
/** Device preference: AI clients allowed, address and token of the MCP bridge on this computer. */
export const MCP_BRIDGE_STORAGE_KEY = 'gf_mcp_bridge';
/** Manually entered prices (encrypted sensitive user data). */
export const MANUAL_PRICE_HISTORY_KEY = 'glassfolio_manual_price_history';
export const LEGACY_MANUAL_PRICE_HISTORY_KEY = 'gf_manual_price_history';
/** RP ID of the server passkeys (cloud mode). Public deployment metadata, read while locked. */
export const PASSKEY_RP_ID_STORAGE_KEY = 'gf_passkey_rp_id';

const SENSITIVE_PREFIX = 'glassfolio_';

/** `glassfolio_*` keys that only hold public market data. */
const PLAINTEXT_EXCEPTIONS: ReadonlySet<string> = new Set([
    'glassfolio_price_cache',
    CONSENT_STORAGE_KEY,
    PUBLIC_THEME_STORAGE_KEY,
    PUBLIC_LANG_STORAGE_KEY,
]);

export const isSensitiveKey = (key: string): boolean =>
    key.startsWith(SENSITIVE_PREFIX) && !PLAINTEXT_EXCEPTIONS.has(key);

/** Any key owned by GlassFolio (never wipes other apps sharing the origin). */
export const isGlassFolioKey = (key: string): boolean =>
    key.startsWith(SENSITIVE_PREFIX) || key.startsWith('gf_');

/** Plaintext "TOTP enabled" marker written by earlier builds; only ever cleaned up now. */
export const LEGACY_TOTP_FLAG_KEY = 'gf_totp_enrolled';

/**
 * Keys that belong to this device's vault. A vault reset removes these and keeps the Supabase
 * session, consent, theme, language and public market caches.
 */
export const isVaultScopedKey = (key: string): boolean =>
    isSensitiveKey(key) || key === VAULT_HEADER_KEY || key === LEGACY_TOTP_FLAG_KEY;


/**
 * Keys persisted on the local server volume in local mode (Epic E33): the encrypted vault and
 * every user-data key. Everything else (consent, theme, language, UI state, public market
 * caches, Supabase session) is a per-browser preference and stays in the browser.
 * The server enforces the same list (server/localVault.mjs KEY_PATTERN).
 */
export const isServerPersistedKey = (key: string): boolean =>
    isVaultScopedKey(key) || key === MANUAL_PRICE_HISTORY_KEY || key === LEGACY_MANUAL_PRICE_HISTORY_KEY;
