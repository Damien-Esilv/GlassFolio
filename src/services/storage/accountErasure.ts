/**
 * Local footprint purge for GDPR erasure (Art. 17).
 *
 * After an account is deleted, every GlassFolio key left in the browser is removed except the
 * visitor-level choices that are not account data: theme, language and the cookie consent record
 * (the consent proof must outlive the account, see Legal Center > Cookies).
 */

import { appStorage } from './appStorage';
import { CONSENT_STORAGE_KEY, isGlassFolioKey, PUBLIC_LANG_STORAGE_KEY, PUBLIC_THEME_STORAGE_KEY } from './storageKeys';

export const ERASURE_RETAINED_KEYS: ReadonlySet<string> = new Set([
    PUBLIC_THEME_STORAGE_KEY,
    PUBLIC_LANG_STORAGE_KEY,
    CONSENT_STORAGE_KEY,
]);

/** Removes every remaining GlassFolio key (session, caches, UI state) and returns the removed keys. */
export function purgeLocalAccountFootprint(): string[] {
    const backing = appStorage.getBacking();
    const removed = backing
        .keys()
        .filter(key => isGlassFolioKey(key) && !ERASURE_RETAINED_KEYS.has(key));
    removed.forEach(key => backing.removeItem(key));
    return removed;
}
