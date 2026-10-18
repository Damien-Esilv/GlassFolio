import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { userRepository } from '../src/services/repositories';
import { vaultService } from '../src/services/security/vaultService';
import { authService } from '../src/services/security/authService';
import { appStorage } from '../src/services/storage/appStorage';
import { PUBLIC_LANG_STORAGE_KEY, PUBLIC_THEME_STORAGE_KEY } from '../src/services/storage/storageKeys';

import { consumeUrlBootstrapParams } from '../src/config/urlBootstrap';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<string | undefined>;
  unlockLocalVault: (password: string) => Promise<void>;
  setupLocalVault: (name: string, password: string) => Promise<string | undefined>;
  logout: () => void;
  lockVault: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  isAuthenticated: boolean;
  isVaultLocked: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [vaultStatus, setVaultStatus] = useState<string>(() => vaultService.getStatus());

  const loadUserFromRepo = async () => {
    try {
      const storedUser = await userRepository.getUser();
      if (storedUser) {
        const parsedUser = { ...storedUser };
        // Ensure preferences exist (for legacy data)
        if (!parsedUser.preferences) {
          parsedUser.preferences = { theme: 'night', currency: 'EUR', notifications: true, language: 'fr', dateFormat: 'DD/MM/YYYY' };
        }
        if (!parsedUser.preferences.language) {
          parsedUser.preferences.language = 'en';
        }
        if (!parsedUser.preferences.dateFormat) {
          parsedUser.preferences.dateFormat = 'DD/MM/YYYY';
        }
        setUser(parsedUser);
      }
    } catch (err) {
      console.error('Failed to load user from repository', err);
    }
  };

  // Subscribe to vault status changes
  useEffect(() => {
    const unsub = vaultService.subscribeStatus((newStatus) => {
      setVaultStatus(newStatus);
      if (newStatus === 'unlocked') {
        loadUserFromRepo();
      }
    });
    return unsub;
  }, []);

  // Check repository on mount and handle URL bootstrap handoff (TGLA-058)
  useEffect(() => {
    const loadUser = async () => {
      try {
        if (authService.handleOAuthCallback) {
          const oauthRes = await authService.handleOAuthCallback();
          if (oauthRes) {
            setUser(oauthRes.user);
            return;
          }
        }

        const { demoRequested, theme: bootstrappedTheme, lang: bootstrappedLang } = consumeUrlBootstrapParams();

        if (demoRequested) {
          await authService.signIn('demo@glassfolio.com', 'password');
          const storedUser = await userRepository.getUser();
          if (storedUser) {
            if (bootstrappedTheme || bootstrappedLang) {
              storedUser.preferences = {
                ...storedUser.preferences,
                theme: bootstrappedTheme || storedUser.preferences?.theme || 'night',
                language: bootstrappedLang || storedUser.preferences?.language || 'fr',
                currency: storedUser.preferences?.currency || 'EUR',
                notifications: storedUser.preferences?.notifications ?? true,
                dateFormat: storedUser.preferences?.dateFormat || 'DD/MM/YYYY',
              };
              await userRepository.saveUser(storedUser);
            }
            setUser(storedUser);
          }
        } else {
          await loadUserFromRepo();
          if (bootstrappedTheme || bootstrappedLang) {
            const storedUser = await userRepository.getUser();
            if (storedUser) {
              storedUser.preferences = {
                ...storedUser.preferences,
                theme: bootstrappedTheme || storedUser.preferences?.theme || 'night',
                language: bootstrappedLang || storedUser.preferences?.language || 'fr',
                currency: storedUser.preferences?.currency || 'EUR',
                notifications: storedUser.preferences?.notifications ?? true,
                dateFormat: storedUser.preferences?.dateFormat || 'DD/MM/YYYY',
              };
              await userRepository.saveUser(storedUser);
              setUser(storedUser);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load user or bootstrap demo session', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadUser();
  }, []);

  // Theme Effect
  useEffect(() => {
    const root = document.documentElement;
    const storedPublicTheme = appStorage.getItem(PUBLIC_THEME_STORAGE_KEY);
    const fallbackTheme =
      storedPublicTheme === 'light' || storedPublicTheme === 'dark' || storedPublicTheme === 'night'
        ? storedPublicTheme
        : 'night';

    // Determine theme preference
    let theme = user?.preferences?.theme || fallbackTheme;

    // Resolve system theme
    if (theme === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      theme = systemDark ? 'night' : 'light';
    }

    // Apply Data Attribute for CSS Variables
    root.setAttribute('data-theme', theme);

    // Toggle 'dark' class for Tailwind utilities
    if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }

    // System listener for auto-switching
    if (user?.preferences?.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        const newTheme = e.matches ? 'night' : 'light';
        root.setAttribute('data-theme', newTheme);
        if (newTheme === 'light') root.classList.remove('dark');
        else root.classList.add('dark');
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

  }, [user?.preferences?.theme]);

  // Language Effect - Sync i18n with user language preference
  useEffect(() => {
    const loadLanguage = async () => {
      const storedPublicLang = appStorage.getItem(PUBLIC_LANG_STORAGE_KEY);
      const fallbackLang = storedPublicLang === 'fr' || storedPublicLang === 'en' ? storedPublicLang : 'en';
      const lang = user?.preferences?.language || fallbackLang;
      const i18n = (await import('../src/i18n')).default;
      if (i18n.language !== lang) {
        i18n.changeLanguage(lang);
      }
    };
    loadLanguage();
  }, [user?.preferences?.language]);

  const login = async (email: string, password: string): Promise<void> => {
    const res = await authService.signIn(email, password);
    setUser(res.user);
  };

  const unlockLocalVault = async (password: string): Promise<void> => {
    const res = await authService.unlockLocalVault(password);
    setUser(res.user);
  };

  const setupLocalVault = async (name: string, password: string): Promise<string | undefined> => {
    const res = await authService.setupLocalVault(name, password);
    setUser(res.user);
    return res.recoveryKey;
  };

  const signup = async (email: string, password: string, name: string): Promise<string | undefined> => {
    const res = await authService.signUp(email, password, name);
    setUser(res.user);
    return res.recoveryKey;
  };

  const logout = () => {
    setUser(null);
    authService.signOut().catch(err => console.error('Error locking vault on logout', err));
    // Preserve stored public theme instead of forcing hardcoded 'night'
    const storedPublicTheme = appStorage.getItem(PUBLIC_THEME_STORAGE_KEY) || 'night';
    document.documentElement.setAttribute('data-theme', storedPublicTheme);
    if (storedPublicTheme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  };

  const lockVault = async () => {
    await vaultService.lock();
  };

  const updateProfile = async (data: Partial<User>): Promise<void> => {
    return new Promise((resolve) => {
      setTimeout(async () => {
        if (user) {
          const updatedUser = { ...user, ...data };
          // If preferences are partial, merge them
          if (data.preferences) {
            updatedUser.preferences = {
              theme: data.preferences.theme ?? user.preferences?.theme ?? 'night',
              currency: data.preferences.currency ?? user.preferences?.currency ?? 'USD',
              notifications: data.preferences.notifications ?? user.preferences?.notifications ?? true,
              language: data.preferences.language ?? user.preferences?.language ?? 'en',
              dateFormat: data.preferences.dateFormat ?? user.preferences?.dateFormat ?? 'DD/MM/YYYY'
            };
            if (updatedUser.preferences.theme) {
              appStorage.setItem(PUBLIC_THEME_STORAGE_KEY, updatedUser.preferences.theme);
            }
            if (updatedUser.preferences.language) {
              appStorage.setItem(PUBLIC_LANG_STORAGE_KEY, updatedUser.preferences.language);
            }
          }
          setUser(updatedUser);
          await userRepository.saveUser(updatedUser);
        }
        resolve();
      }, 500); // Simulate network delay
    });
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      signup,
      unlockLocalVault,
      setupLocalVault,
      logout,
      lockVault,
      updateProfile,
      isAuthenticated: !!user,
      isVaultLocked: vaultStatus === 'locked',
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
};
