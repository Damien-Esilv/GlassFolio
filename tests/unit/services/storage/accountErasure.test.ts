/**
 * Tests — GDPR erasure footprint (E15): after account deletion only theme, language and the
 * consent record remain in the browser.
 */

import { describe, it, expect } from 'vitest';
import { purgeLocalAccountFootprint, ERASURE_RETAINED_KEYS } from '../../../../src/services/storage/accountErasure';
import { appStorage } from '../../../../src/services/storage/appStorage';
import { isGlassFolioKey } from '../../../../src/services/storage/storageKeys';

describe('purgeLocalAccountFootprint', () => {
  it('removes every GlassFolio key except theme, language and consent', () => {
    const backing = appStorage.getBacking();
    [
      'gf_sb_session', 'gf_oauth_pkce_verifier', 'gf_manual_price_history', 'gf_price_cache',
      'gf_fx_rates_cache', 'gf_sidebar_collapsed', 'glassfolio_price_cache', 'glassfolio_user',
      'gf_public_theme', 'gf_public_lang', 'gf_consent_v1',
    ].forEach(key => backing.setItem(key, 'x'));
    backing.setItem('unrelated_app_key', 'keep');

    const removed = purgeLocalAccountFootprint();

    const remaining = backing.keys().filter(isGlassFolioKey).sort();
    expect(remaining).toEqual([...ERASURE_RETAINED_KEYS].sort());
    expect(removed).toContain('gf_sb_session');
    expect(backing.getItem('unrelated_app_key')).toBe('keep');
  });
});
