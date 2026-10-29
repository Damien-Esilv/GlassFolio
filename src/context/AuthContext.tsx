import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { userRepository } from '../services/repositories';
import { vaultService } from '../services/security/vaultService';
import { authService } from '../services/security/authService';
import { AuthResult, SecondFactorMethod, SignUpOptions } from '../services/security/authTypes';
import type { GoogleCallbackResult } from '../services/security/googleOidcService';
import { appStorage } from '../services/storage/appStorage';
import { PUBLIC_LANG_STORAGE_KEY, PUBLIC_THEME_STORAGE_KEY } from '../services/storage/storageKeys';
import {
  getSyncedPublicTheme,
  setSyncedPublicTheme,
  setSyncedPublicLanguage,
  applyPublicDomTheme,
} from '../services/storage/publicPreferencesSync';

import { consumeUrlBootstrapParams } from '../config/urlBootstrap';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, options?: { captchaToken?: string }) => Promise<AuthResult>;
  signup: (email: string, password: string, name: string, options?: SignUpOptions) => Promise<void>;
  verifySignupOtp: (email: string, token: string) => Promise<string>;
  /** Address confirmed through the emailed link: creates the vault with the in-memory password. */
  continueSignupAfterLink: () => Promise<string>;
  /** Cloud: a verified account whose vault was never finalized is waiting (after a sign-in). */
  pendingSignupCompletion: boolean;
  resumeSignup: () => Promise<string>;
  cancelSignup: () => Promise<void>;
  completeSignup: () => Promise<void>;
  unlockLocalVault: (password: string) => Promise<AuthResult>;
  /** Methods offered while a sign-in waits for its second factor; null when none is pending. */
  pendingSecondFactor: SecondFactorMethod[] | null;
  completeSecondFactor: (code: string) => Promise<AuthResult>;
  completeSecondFactorWithPasskey: () => Promise<AuthResult>;
  /** Direct Google OIDC callback: may leave a second factor pending, like a password sign-in. */
  handleGoogleCallback: (params: GoogleCallbackResult) => Promise<AuthResult>;
  cancelSecondFactor: () => Promise<void>;
  /** Google account: goes through Google again for an action that needs the Drive key file. */
  startGoogleReauth: (intent: 'delete-account' | 'recovery-key') => Promise<void>;
  /** After that round trip: removes the Drive key file, then deletes the account. */
  handleGoogleAccountDeletion: (params: GoogleCallbackResult) => Promise<void>;
  /** After that round trip: creates the emergency recovery key and returns it once. */
  createGoogleRecoveryKey: (params: GoogleCallbackResult) => Promise<string>;
  /** Reloads the profile from the unlocked vault (used once a sign-in flow finished outside the context). */
  loadUserFromRepo: () => Promise<void>;
  /** Local: passwordless vault unlock. Cloud: Supabase passkey sign-in. */
  signInWithPasskey: () => Promise<AuthResult>;
  setupLocalVault: (name: string, password: string, options?: { overwriteExisting?: boolean }) => Promise<string | undefined>;
  logout: () => void;
  lockVault: () => Promise<void>;
  deleteAccount: (options?: { password?: string; confirmationText?: string }) => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  isAuthenticated: boolean;
  isVaultLocked: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

const isValidAvatar = (avatar: string): boolean => {
  if (!avatar) return true;
  if (avatar.length > 2 * 1024 * 1024) return false;
  return (
    avatar.startsWith('/avatars/') ||
    avatar.startsWith('https://') ||
    avatar.startsWith('data:image/')
  );
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [vaultStatus, setVaultStatus] = useState<string>(() => vaultService.getStatus());
  const [pendingSecondFactor, setPendingSecondFactor] = useState<SecondFactorMethod[] | null>(null);
  const [pendingSignupCompletion, setPendingSignupCompletion] = useState(false);
  // Local vault created but its recovery key not confirmed yet: the user is signed in on confirmation.
  const pendingLocalUserRef = useRef<User | null>(null);
  const userRef = useRef<User | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  /** Signs the user in only once nothing is pending (second factor, signup completion). */
  const applyAuthResult = (res: AuthResult): AuthResult => {
    if (res.requiresTwoFactor) {
      setPendingSecondFactor(res.secondFactorMethods ?? ['totp']);
    } else if (res.requiresSignupCompletion) {
      setPendingSignupCompletion(true);
    } else {
      setPendingSecondFactor(null);
      setUser(res.user);
    }
    return res;
  };

  const loadUserFromRepo = async () => {
    // A profile is only trusted from an unlocked vault: never a plaintext leftover (TGLA-101).
    if (!vaultService.isUnlocked()) return;
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
      // Unlocking only refreshes a user who is already signed in (lock screen). Signing in goes
      // through the explicit flows below, which check the second factor first (TGLA-101).
      if (newStatus === 'unlocked' && userRef.current) {
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
            applyAuthResult(oauthRes);
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
          if ((bootstrappedTheme || bootstrappedLang) && vaultService.isUnlocked()) {
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
    const fallbackTheme = getSyncedPublicTheme();

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
      const i18n = (await import('../i18n')).default;
      if (i18n.language !== lang) {
        i18n.changeLanguage(lang);
      }
    };
    loadLanguage();
  }, [user?.preferences?.language]);

  const login = async (email: string, password: string, options?: { captchaToken?: string }): Promise<AuthResult> => {
    return applyAuthResult(await authService.signIn(email, password, options));
  };

  const unlockLocalVault = async (password: string): Promise<AuthResult> => {
    if (!authService.unlockLocalVault) throw new Error('Local vault unlock is unavailable.');
    return applyAuthResult(await authService.unlockLocalVault(password));
  };

  const completeSecondFactor = async (code: string): Promise<AuthResult> => {
    if (!authService.verifySecondFactor) throw new Error('Second factor verification is unavailable.');
    return applyAuthResult(await authService.verifySecondFactor(code));
  };

  const completeSecondFactorWithPasskey = async (): Promise<AuthResult> => {
    if (!authService.verifySecondFactorWithPasskey) throw new Error('Passkey verification is unavailable.');
    return applyAuthResult(await authService.verifySecondFactorWithPasskey());
  };

  const handleGoogleCallback = async (params: GoogleCallbackResult): Promise<AuthResult> => {
    if (!authService.handleGoogleOidcCallback) throw new Error('Google authentication is not supported in this deployment mode.');
    return applyAuthResult(await authService.handleGoogleOidcCallback(params));
  };

  const startGoogleReauth = async (intent: 'delete-account' | 'recovery-key'): Promise<void> => {
    if (!authService.startGoogleReauth) throw new Error('Google authentication is not supported in this deployment mode.');
    await authService.startGoogleReauth(intent);
  };

  const handleGoogleAccountDeletion = async (params: GoogleCallbackResult): Promise<void> => {
    if (!authService.completeGoogleAccountDeletion) throw new Error('Google authentication is not supported in this deployment mode.');
    await authService.completeGoogleAccountDeletion(params);
    setUser(null);
  };

  const createGoogleRecoveryKey = async (params: GoogleCallbackResult): Promise<string> => {
    if (!authService.createGoogleRecoveryKey) throw new Error('Google authentication is not supported in this deployment mode.');
    return authService.createGoogleRecoveryKey(params);
  };

  const signInWithPasskey = async (): Promise<AuthResult> => {
    if (!authService.signInWithPasskey) throw new Error('Passkey sign-in is unavailable.');
    return applyAuthResult(await authService.signInWithPasskey());
  };

  const cancelSecondFactor = async (): Promise<void> => {
    setPendingSecondFactor(null);
    await authService.cancelSecondFactor?.();
  };

  const setupLocalVault = async (name: string, password: string, options?: { overwriteExisting?: boolean }): Promise<string | undefined> => {
    if (!authService.setupLocalVault) throw new Error('Local vault setup is unavailable.');
    const res = await authService.setupLocalVault(name, password, options);
    // Signed in only once the recovery key is confirmed (completeSignup).
    pendingLocalUserRef.current = res.user;
    return res.recoveryKey;
  };

  const signup = async (email: string, password: string, name: string, options?: SignUpOptions): Promise<void> => {
    if (authService.beginSignupVerification) {
      await authService.beginSignupVerification(email, password, name, options);
      return;
    }
    await authService.signUp(email, password, name, options);
  };

  const verifySignupOtp = async (email: string, token: string): Promise<string> => {
    if (!authService.verifyEmailOtp || !authService.preparePendingSignup) throw new Error('Email verification is unavailable.');
    await authService.verifyEmailOtp(email, token);
    return authService.preparePendingSignup();
  };

  const continueSignupAfterLink = async (): Promise<string> => {
    if (!authService.continueSignupAfterLinkVerification) throw new Error('Email verification is unavailable.');
    return authService.continueSignupAfterLinkVerification();
  };

  const resumeSignup = async (): Promise<string> => {
    if (!authService.preparePendingSignup) throw new Error('Account completion is unavailable.');
    return authService.preparePendingSignup();
  };

  const cancelSignup = async (): Promise<void> => {
    setPendingSignupCompletion(false);
    await authService.cancelPendingSignup?.();
  };

  const completeSignup = async (): Promise<void> => {
    if (pendingLocalUserRef.current) {
      const localUser = pendingLocalUserRef.current;
      pendingLocalUserRef.current = null;
      setUser(localUser);
      return;
    }
    if (!authService.completePendingSignup) throw new Error('Account completion is unavailable.');
    const res = await authService.completePendingSignup();
    setPendingSignupCompletion(false);
    setUser(res.user);
  };

  const logout = () => {
    setUser(null);
    authService.signOut().catch(err => console.error('Error locking vault on logout', err));
    // Apply synced public base theme
    const storedPublicTheme = getSyncedPublicTheme();
    applyPublicDomTheme(storedPublicTheme);
  };

  const lockVault = async () => {
    if (user?.authProvider === 'google') {
      await logout();
      return;
    }
    await vaultService.lock();
  };

  const deleteAccount = async (options?: { password?: string; confirmationText?: string }) => {
    if (typeof authService.deleteAccountPermanently === 'function') {
      await authService.deleteAccountPermanently(options);
    } else {
      await authService.signOut();
    }
    setUser(null);
  };

  const updateProfile = async (data: Partial<User>): Promise<void> => {
    return new Promise((resolve) => {
      setTimeout(async () => {
        if (user) {
          if (data.avatar && !isValidAvatar(data.avatar)) {
            resolve();
            return;
          }
          const updatedUser = { ...user, ...data };
          // If preferences are partial, merge them
          if (data.preferences) {
            updatedUser.preferences = {
              ...(user.preferences || {}),
              ...data.preferences,
              theme: data.preferences.theme ?? user.preferences?.theme ?? 'night',
              currency: data.preferences.currency ?? user.preferences?.currency ?? 'USD',
              notifications: data.preferences.notifications ?? user.preferences?.notifications ?? true,
              language: data.preferences.language ?? user.preferences?.language ?? 'en',
              dateFormat: data.preferences.dateFormat ?? user.preferences?.dateFormat ?? 'DD/MM/YYYY'
            };
            if (updatedUser.preferences.theme) {
              setSyncedPublicTheme(updatedUser.preferences.theme);
            }
            if (updatedUser.preferences.language) {
              setSyncedPublicLanguage(updatedUser.preferences.language);
              if (updatedUser.preferences.language !== user.preferences?.language) {
                // Keep branded auth emails in the user's language (Epic E25); best effort.
                authService.syncEmailLocale?.(updatedUser.preferences.language).catch(() => undefined);
              }
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
      verifySignupOtp,
      continueSignupAfterLink,
      pendingSignupCompletion,
      resumeSignup,
      cancelSignup,
      completeSignup,
      unlockLocalVault,
      pendingSecondFactor,
      completeSecondFactor,
      handleGoogleCallback,
      completeSecondFactorWithPasskey,
      cancelSecondFactor,
      startGoogleReauth,
      handleGoogleAccountDeletion,
      createGoogleRecoveryKey,
      loadUserFromRepo,
      signInWithPasskey,
      setupLocalVault,
      logout,
      lockVault,
      deleteAccount,
      updateProfile,
      isAuthenticated: !!user,
      isVaultLocked: vaultStatus === 'locked',
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
};
