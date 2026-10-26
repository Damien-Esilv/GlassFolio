import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
    CONSENT_STORAGE_KEY,
    isServerPersistedKey,
    MANUAL_PRICE_HISTORY_KEY,
    PUBLIC_LANG_STORAGE_KEY,
    PUBLIC_THEME_STORAGE_KEY,
    VAULT_HEADER_KEY,
} from '../../../../src/services/storage/storageKeys';
import { KEY_PATTERN } from '../../../../server/localVault.mjs';

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(entry) ? [full] : [];
    });

describe('server-persisted key classification (E33 — TGLA-138/139)', () => {
    it('persists the vault and user data, and keeps browser preferences in the browser', () => {
        for (const key of [VAULT_HEADER_KEY, MANUAL_PRICE_HISTORY_KEY, 'glassfolio_user', 'glassfolio_transactions', 'gf_totp_enrolled']) {
            expect(isServerPersistedKey(key), key).toBe(true);
        }
        for (const key of [CONSENT_STORAGE_KEY, PUBLIC_THEME_STORAGE_KEY, PUBLIC_LANG_STORAGE_KEY, 'glassfolio_price_cache', 'gf_sidebar_collapsed', 'gf_fx_rates_cache', 'gf_sb_session']) {
            expect(isServerPersistedKey(key), key).toBe(false);
        }
    });

    it('is accepted by the server allow-list for every persisted key literal used in src/', () => {
        const literals = new Set<string>();
        for (const file of walk(join(process.cwd(), 'src'))) {
            for (const match of readFileSync(file, 'utf8').matchAll(/['"`]((?:glassfolio|gf)_[a-z0-9_]+)['"`]/g)) literals.add(match[1]);
        }
        const persisted = [...literals].filter(isServerPersistedKey);
        expect(persisted.length).toBeGreaterThan(20);
        for (const key of persisted) expect(KEY_PATTERN.test(key), `server would reject ${key}`).toBe(true);
    });

    it('is rejected by the server allow-list for every browser-only key', () => {
        for (const key of ['gf_consent_v1', 'gf_public_theme', 'gf_public_lang', 'gf_sidebar_collapsed', 'gf_sb_session', 'gf_price_cache']) {
            expect(isServerPersistedKey(key)).toBe(false);
            expect(KEY_PATTERN.test(key), key).toBe(false);
        }
    });
});
