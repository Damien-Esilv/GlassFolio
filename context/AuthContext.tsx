import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { userRepository } from '../src/services/repositories';
import { vaultService } from '../src/services/security/vaultService';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
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
          parsedUser.preferences = { theme: 'night', currency: 'USD', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' };
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

  // Check repository on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        await loadUserFromRepo();
      } finally {
        setIsLoading(false);
      }
    };
    loadUser();
  }, []);

  // Theme Effect
  useEffect(() => {
    const root = document.documentElement;

    // Determine theme preference
    let theme = user?.preferences?.theme || 'night';

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
      const lang = user?.preferences?.language || 'en';
      const i18n = (await import('../src/i18n')).default;
      if (i18n.language !== lang) {
        i18n.changeLanguage(lang);
      }
    };
    loadLanguage();
  }, [user?.preferences?.language]);

  const login = async (email: string, password: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        // Demo Credentials
        if (email === 'demo@glassfolio.com' && password === 'password') {
          try {
            if (!vaultService.isInitialized()) {
              await vaultService.setup('password');
            } else if (vaultService.getStatus() === 'locked') {
              await vaultService.unlock('password');
            }
          } catch (err) {
            console.error('Failed to unlock demo vault', err);
          }

          const demoUser: User = {
            id: 'demo-123',
            name: 'Alex Trader',
            email: 'demo@glassfolio.com',
            avatar: 'https://i.pravatar.cc/150?u=alex',
            preferences: { theme: 'night', currency: 'USD', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
            xp: 1250,
            level: 5
          };
          setUser(demoUser);
          await userRepository.saveUser(demoUser);
          resolve();
        } else {
          // Custom account login
          try {
            if (vaultService.isInitialized() && vaultService.getStatus() === 'locked') {
              await vaultService.unlock(password);
            }
            const existingUser = await userRepository.getUser();
            if (existingUser && existingUser.email === email) {
              setUser(existingUser);
              resolve();
              return;
            }
          } catch {
            // credentials invalid for vault
          }
          reject(new Error('Invalid email or password. Try demo@glassfolio.com / password'));
        }
      }, 800); // Simulate network delay
    });
  };

  const signup = async (email: string, password: string, name: string): Promise<void> => {
    return new Promise((resolve) => {
      setTimeout(async () => {
        try {
          if (!vaultService.isInitialized()) {
            await vaultService.setup(password);
          }
        } catch (err) {
          console.error('Failed to setup vault on signup', err);
        }

        const newUser: User = {
          id: Math.random().toString(36).substr(2, 9),
          name,
          email,
          avatar: `https://i.pravatar.cc/150?u=${email}`,
          preferences: { theme: 'night', currency: 'USD', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
          xp: 0,
          level: 1
        };
        setUser(newUser);
        await userRepository.saveUser(newUser);
        resolve();
      }, 800);
    });
  };

  const logout = () => {
    setUser(null);
    userRepository.clearUser();
    vaultService.lock().catch(err => console.error('Error locking vault on logout', err));
    // Reset to default styling on logout
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'night');
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
