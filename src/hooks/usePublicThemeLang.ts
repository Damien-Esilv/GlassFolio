import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import {
  getSyncedPublicTheme,
  setSyncedPublicTheme,
  getSyncedPublicLanguage,
  setSyncedPublicLanguage,
  applyPublicDomTheme,
  isPublicBaseTheme,
  type PublicBaseTheme,
  type SupportedLanguage,
} from '../services/storage/publicPreferencesSync';

export type ShowcaseTheme = PublicBaseTheme;
export type ShowcaseLanguage = SupportedLanguage;

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
  const theme = getSyncedPublicTheme();
  const language = getSyncedPublicLanguage();
  const currency = language === 'fr' ? 'EUR' : 'USD';
  return { theme, language, currency };
}

function resolveInitialTheme(userTheme?: string): ShowcaseTheme {
  if (isPublicBaseTheme(userTheme)) {
    return userTheme;
  }
  return getSyncedPublicTheme();
}

function applyDomTheme(theme: ShowcaseTheme): void {
  applyPublicDomTheme(theme);
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
      setSyncedPublicTheme(nextTheme);
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
      setSyncedPublicLanguage(nextLang);
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
