import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { appStorage } from '../services/storage/appStorage';
import {
  PUBLIC_LANG_STORAGE_KEY,
  PUBLIC_THEME_STORAGE_KEY,
} from '../services/storage/storageKeys';

export type ShowcaseTheme = 'light' | 'dark' | 'night';
export type ShowcaseLanguage = 'en' | 'fr';

export interface LanguageOption {
  code: ShowcaseLanguage;
  shortLabel: string;
  nativeName: string;
  labelKey: string;
}

export const SUPPORTED_LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', shortLabel: 'EN', nativeName: 'English', labelKey: 'settings:preferences.english' },
  { code: 'fr', shortLabel: 'FR', nativeName: 'Français', labelKey: 'settings:preferences.french' },
];

export interface ThemeOption {
  id: ShowcaseTheme;
  labelKey: string;
}

export const SUPPORTED_THEMES: readonly ThemeOption[] = [
  { id: 'light', labelKey: 'settings:preferences.light' },
  { id: 'dark', labelKey: 'settings:preferences.dark' },
  { id: 'night', labelKey: 'settings:preferences.night' },
];

const THEME_ORDER: readonly ShowcaseTheme[] = ['light', 'dark', 'night'];

export function getInitialPublicPreferences(): {
  theme: ShowcaseTheme;
  language: ShowcaseLanguage;
  currency: string;
} {
  const storedTheme = appStorage.getItem(PUBLIC_THEME_STORAGE_KEY);
  let validTheme: ShowcaseTheme = 'night';
  if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'night') {
    validTheme = storedTheme;
  } else if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark' || attr === 'night') {
      validTheme = attr;
    }
  }

  const storedLang = appStorage.getItem(PUBLIC_LANG_STORAGE_KEY);
  let validLang: ShowcaseLanguage = 'en';
  if (storedLang === 'fr' || storedLang === 'en') {
    validLang = storedLang;
  } else if (typeof document !== 'undefined' && document.documentElement.lang?.toLowerCase().startsWith('fr')) {
    validLang = 'fr';
  }

  const currency = validLang === 'fr' ? 'EUR' : 'USD';
  return { theme: validTheme, language: validLang, currency };
}

function resolveInitialTheme(userTheme?: string): ShowcaseTheme {
  if (userTheme === 'light' || userTheme === 'dark' || userTheme === 'night') {
    return userTheme;
  }
  const stored = appStorage.getItem(PUBLIC_THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'night') {
    return stored;
  }
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark' || attr === 'night') {
      return attr;
    }
  }
  return 'night';
}

function applyDomTheme(theme: ShowcaseTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
  }
}

export function usePublicThemeLang() {
  const { i18n } = useTranslation();
  const { user, updateProfile } = useAuth();

  const [theme, setThemeState] = useState<ShowcaseTheme>(() =>
    resolveInitialTheme(user?.preferences?.theme)
  );

  const currentLang: ShowcaseLanguage =
    i18n.language && i18n.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';

  useEffect(() => {
    const resolved = resolveInitialTheme(user?.preferences?.theme);
    setThemeState(resolved);
    applyDomTheme(resolved);
  }, [user?.preferences?.theme]);

  const setTheme = useCallback(
    (nextTheme: ShowcaseTheme) => {
      setThemeState(nextTheme);
      appStorage.setItem(PUBLIC_THEME_STORAGE_KEY, nextTheme);
      applyDomTheme(nextTheme);
      if (user && updateProfile) {
        updateProfile({
          preferences: {
            theme: nextTheme,
            currency: user.preferences?.currency ?? 'EUR',
            notifications: user.preferences?.notifications ?? true,
            language: user.preferences?.language ?? currentLang,
            dateFormat: user.preferences?.dateFormat ?? 'DD/MM/YYYY',
          },
        }).catch(() => {
          // ignore async profile sync error on public showcase
        });
      }
    },
    [user, updateProfile, currentLang]
  );

  const cycleTheme = useCallback(() => {
    const currentIndex = THEME_ORDER.indexOf(theme);
    const nextTheme = THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length];
    setTheme(nextTheme);
  }, [theme, setTheme]);

  const setLanguage = useCallback(
    (nextLang: ShowcaseLanguage) => {
      appStorage.setItem(PUBLIC_LANG_STORAGE_KEY, nextLang);
      if (typeof i18n.changeLanguage === 'function') {
        i18n.changeLanguage(nextLang);
      }
      if (user && updateProfile) {
        updateProfile({
          preferences: {
            theme: user.preferences?.theme ?? theme,
            currency: user.preferences?.currency ?? 'EUR',
            notifications: user.preferences?.notifications ?? true,
            language: nextLang,
            dateFormat: user.preferences?.dateFormat ?? 'DD/MM/YYYY',
          },
        }).catch(() => {
          // ignore async profile sync error
        });
      }
    },
    [i18n, user, updateProfile, theme]
  );

  const toggleLanguage = useCallback(() => {
    setLanguage(currentLang === 'en' ? 'fr' : 'en');
  }, [currentLang, setLanguage]);

  return {
    theme,
    setTheme,
    cycleTheme,
    language: currentLang,
    setLanguage,
    toggleLanguage,
  };
}
