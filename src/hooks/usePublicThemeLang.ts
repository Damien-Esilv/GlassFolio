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
import { getAppTarget } from '../config/deployment';
import { findPublicRoute, localizedPath } from '../config/publicRoutes';

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

/** Every hook instance (header, footer, app links) follows a theme picked in any of them. */
const PUBLIC_THEME_EVENT = 'gf:public-theme-changed';

export function usePublicThemeLang() {
  const { i18n } = useTranslation();
  const { user, updateProfile } = useAuth();

  const [theme, setThemeState] = useState<ShowcaseTheme>(() =>
    resolveInitialTheme(user?.preferences?.theme)
  );

  const currentLang: ShowcaseLanguage =
    i18n.language && i18n.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';

  // A signed-in user's own theme (emerald, cyber, system) is the app's: a public page must not
  // repaint it with the public base theme (nothing would put it back).
  const keepsOwnTheme = Boolean(user) && !isPublicBaseTheme(user?.preferences?.theme);
  useEffect(() => {
    const resolved = resolveInitialTheme(user?.preferences?.theme);
    setThemeState(resolved);
    if (!keepsOwnTheme) applyDomTheme(resolved);
  }, [user?.preferences?.theme, keepsOwnTheme]);

  useEffect(() => {
    const onThemeChanged = (event: Event) => {
      const next = (event as CustomEvent<ShowcaseTheme>).detail;
      if (isPublicBaseTheme(next)) setThemeState(next);
    };
    window.addEventListener(PUBLIC_THEME_EVENT, onThemeChanged);
    return () => window.removeEventListener(PUBLIC_THEME_EVENT, onThemeChanged);
  }, []);

  const setTheme = useCallback(
    (nextTheme: ShowcaseTheme) => {
      setThemeState(nextTheme);
      setSyncedPublicTheme(nextTheme);
      applyDomTheme(nextTheme);
      // The other instances (app links carry the theme to the app) must not keep the old one
      window.dispatchEvent(new CustomEvent<ShowcaseTheme>(PUBLIC_THEME_EVENT, { detail: nextTheme }));
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
      // On the public site each language has its own URL
      const { pathname, search, hash } = window.location;
      const route = getAppTarget() === 'showcase' ? findPublicRoute(pathname) : undefined;
      if (route) {
        window.location.assign(`${localizedPath(route.path, nextLang)}${search}${hash}`);
        return;
      }
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
