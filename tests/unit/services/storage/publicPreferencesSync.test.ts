import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getSyncedPublicTheme,
  setSyncedPublicTheme,
  getSyncedPublicLanguage,
  setSyncedPublicLanguage,
  getPublicThemeFallback,
  isPublicBaseTheme,
  isSupportedLanguage,
  bootstrapPublicPreferences,
  applyPublicDomTheme,
} from '../../../../src/services/storage/publicPreferencesSync';
import { appStorage } from '../../../../src/services/storage/appStorage';
import {
  PUBLIC_LANG_STORAGE_KEY,
  PUBLIC_THEME_STORAGE_KEY,
} from '../../../../src/services/storage/storageKeys';

describe('publicPreferencesSync service', () => {
  beforeEach(() => {
    appStorage.removeItem(PUBLIC_THEME_STORAGE_KEY);
    appStorage.removeItem(PUBLIC_LANG_STORAGE_KEY);
    document.cookie = `${PUBLIC_THEME_STORAGE_KEY}=; Max-Age=0; Path=/`;
    document.cookie = `${PUBLIC_LANG_STORAGE_KEY}=; Max-Age=0; Path=/`;
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    appStorage.removeItem(PUBLIC_THEME_STORAGE_KEY);
    appStorage.removeItem(PUBLIC_LANG_STORAGE_KEY);
  });

  describe('Theme validation and extensibility', () => {
    it('accepts valid public base themes', () => {
      expect(isPublicBaseTheme('light')).toBe(true);
      expect(isPublicBaseTheme('dark')).toBe(true);
      expect(isPublicBaseTheme('night')).toBe(true);
    });

    it('identifies custom or level-unlocked themes as non-public base themes', () => {
      expect(isPublicBaseTheme('emerald')).toBe(false);
      expect(isPublicBaseTheme('cyber')).toBe(false);
      expect(isPublicBaseTheme('sunset')).toBe(false);
      expect(isPublicBaseTheme('unknown')).toBe(false);
    });

    it('safely maps custom, unlocked, or unknown themes to a stable public fallback (night)', () => {
      expect(getPublicThemeFallback('light')).toBe('light');
      expect(getPublicThemeFallback('dark')).toBe('dark');
      expect(getPublicThemeFallback('night')).toBe('night');
      expect(getPublicThemeFallback('emerald')).toBe('night');
      expect(getPublicThemeFallback('cyber')).toBe('night');
      expect(getPublicThemeFallback('any-future-theme')).toBe('night');
    });
  });

  describe('Synced storage and cookie persistence', () => {
    it('persists public theme to appStorage and document.cookie simultaneously', () => {
      setSyncedPublicTheme('light');
      expect(appStorage.getItem(PUBLIC_THEME_STORAGE_KEY)).toBe('light');
      expect(document.cookie).toContain('gf_public_theme=light');
      expect(getSyncedPublicTheme()).toBe('light');
    });

    it('converts advanced themes to public fallback when writing synced public theme', () => {
      setSyncedPublicTheme('cyber');
      expect(appStorage.getItem(PUBLIC_THEME_STORAGE_KEY)).toBe('night');
      expect(document.cookie).toContain('gf_public_theme=night');
      expect(getSyncedPublicTheme()).toBe('night');
    });

    it('persists public language to appStorage and document.cookie simultaneously', () => {
      setSyncedPublicLanguage('fr');
      expect(appStorage.getItem(PUBLIC_LANG_STORAGE_KEY)).toBe('fr');
      expect(document.cookie).toContain('gf_public_lang=fr');
      expect(getSyncedPublicLanguage()).toBe('fr');
    });

    it('applies DOM theme and dark class properly', () => {
      applyPublicDomTheme('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      applyPublicDomTheme('night');
      expect(document.documentElement.getAttribute('data-theme')).toBe('night');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('bootstraps public preferences synchronously on startup', () => {
      setSyncedPublicTheme('dark');
      setSyncedPublicLanguage('fr');

      const bootstrapped = bootstrapPublicPreferences();
      expect(bootstrapped.theme).toBe('dark');
      expect(bootstrapped.language).toBe('fr');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(document.documentElement.lang).toBe('fr');
    });
  });
});
