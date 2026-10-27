import { appStorage } from './appStorage';
import {
  PUBLIC_LANG_STORAGE_KEY,
  PUBLIC_THEME_STORAGE_KEY,
} from './storageKeys';

export const PUBLIC_BASE_THEMES = ['light', 'dark', 'night'] as const;
export type PublicBaseTheme = (typeof PUBLIC_BASE_THEMES)[number];

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const THEME_COOKIE_NAME = PUBLIC_THEME_STORAGE_KEY;
const LANG_COOKIE_NAME = PUBLIC_LANG_STORAGE_KEY;

export function isPublicBaseTheme(value: unknown): value is PublicBaseTheme {
  return typeof value === 'string' && (PUBLIC_BASE_THEMES as readonly string[]).includes(value);
}

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Returns a valid public base theme from any theme string (including system,
 * unlockable themes like emerald/cyber, or any future custom themes).
 */
export function getPublicThemeFallback(theme: unknown): PublicBaseTheme {
  if (isPublicBaseTheme(theme)) {
    return theme;
  }
  if (theme === 'system' && typeof window !== 'undefined' && window.matchMedia) {
    try {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return isDark ? 'night' : 'light';
    } catch {
      return 'night';
    }
  }
  return 'night';
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const target = `${encodeURIComponent(name)}=`;
  const cookies = document.cookie ? document.cookie.split(';') : [];
  for (let i = 0; i < cookies.length; i++) {
    const c = cookies[i].trim();
    if (c.startsWith(target)) {
      try {
        return decodeURIComponent(c.substring(target.length));
      } catch {
        return c.substring(target.length);
      }
    }
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  const hostname = window.location.hostname;
  const isGlassfolioDev = hostname === 'glassfolio.dev' || hostname.endsWith('.glassfolio.dev');
  const domainPart = isGlassfolioDev ? '; Domain=.glassfolio.dev' : '';
  const securePart = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax${domainPart}${securePart}`;
}

/**
 * Reads synced public theme with cascading fallback:
 * 1. URL bootstrap query param (?theme=...)
 * 2. Shared root-domain cookie (.glassfolio.dev)
 * 3. Local browser storage (appStorage gf_public_theme)
 * 4. DOM data-theme attribute
 * 5. Safe default: 'night'
 */
export function getSyncedPublicTheme(): PublicBaseTheme {
  if (typeof window !== 'undefined' && window.location) {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlTheme = params.get('theme');
      if (isPublicBaseTheme(urlTheme)) {
        return urlTheme;
      }
    } catch {
      // Ignore URL parsing errors
    }
  }

  const cookieTheme = readCookie(THEME_COOKIE_NAME);
  if (isPublicBaseTheme(cookieTheme)) {
    return cookieTheme;
  }

  const storedTheme = appStorage.getItem(PUBLIC_THEME_STORAGE_KEY);
  if (isPublicBaseTheme(storedTheme)) {
    return storedTheme;
  }

  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (isPublicBaseTheme(attr)) {
      return attr;
    }
  }

  return 'night';
}

/**
 * Stores synced public theme in both local storage and shared root-domain cookie.
 * Advanced or custom themes (emerald, cyber, etc.) are safely converted to a public fallback
 * for the showcase, preserving cross-theme stability.
 */
export function setSyncedPublicTheme(theme: string): void {
  const publicTheme = getPublicThemeFallback(theme);
  appStorage.setItem(PUBLIC_THEME_STORAGE_KEY, publicTheme);
  writeCookie(THEME_COOKIE_NAME, publicTheme);
}

/**
 * Reads synced public language with cascading fallback:
 * 1. URL bootstrap query param (?lang=...)
 * 2. Shared root-domain cookie (.glassfolio.dev)
 * 3. Local browser storage (appStorage gf_public_lang)
 * 4. Document html lang attribute
 * 5. Browser navigator language
 * 6. Safe default: 'en'
 */
export function getSyncedPublicLanguage(): SupportedLanguage {
  if (typeof window !== 'undefined' && window.location) {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlLang = params.get('lang')?.toLowerCase();
      if (isSupportedLanguage(urlLang)) {
        return urlLang;
      }
    } catch {
      // Ignore URL parsing errors
    }
  }

  const cookieLang = readCookie(LANG_COOKIE_NAME)?.toLowerCase();
  if (isSupportedLanguage(cookieLang)) {
    return cookieLang;
  }

  const storedLang = appStorage.getItem(PUBLIC_LANG_STORAGE_KEY)?.toLowerCase();
  if (isSupportedLanguage(storedLang)) {
    return storedLang;
  }

  if (typeof document !== 'undefined' && document.documentElement.lang) {
    const docLang = document.documentElement.lang.toLowerCase();
    if (docLang.startsWith('fr')) return 'fr';
    if (docLang.startsWith('en')) return 'en';
  }

  if (typeof navigator !== 'undefined' && navigator.language) {
    if (navigator.language.toLowerCase().startsWith('fr')) {
      return 'fr';
    }
  }

  return 'en';
}

/**
 * Stores synced public language in both local storage and shared root-domain cookie.
 */
export function setSyncedPublicLanguage(lang: string): void {
  const validLang: SupportedLanguage = lang.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  appStorage.setItem(PUBLIC_LANG_STORAGE_KEY, validLang);
  writeCookie(LANG_COOKIE_NAME, validLang);
}

/**
 * Applies the given theme to document.documentElement synchronously to prevent visual flash.
 */
export function applyPublicDomTheme(theme: PublicBaseTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
  }
}

/**
 * Synchronous bootstrap on page startup to consume and persist URL parameters.
 */
export function bootstrapPublicPreferences(): {
  theme: PublicBaseTheme;
  language: SupportedLanguage;
} {
  const theme = getSyncedPublicTheme();
  const language = getSyncedPublicLanguage();

  setSyncedPublicTheme(theme);
  setSyncedPublicLanguage(language);
  applyPublicDomTheme(theme);

  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
  }

  return { theme, language };
}
