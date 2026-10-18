import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePublicThemeLang, getInitialPublicPreferences } from '../../../src/hooks/usePublicThemeLang';
import { appStorage } from '../../../src/services/storage/appStorage';
import { PUBLIC_THEME_STORAGE_KEY, PUBLIC_LANG_STORAGE_KEY } from '../../../src/services/storage/storageKeys';
import i18n from '../../../src/i18n';

// Mock AuthContext
let mockUser: unknown = null;
const mockUpdateProfile = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    updateProfile: mockUpdateProfile,
  }),
}));

describe('usePublicThemeLang hook (TGLA-057 / TGLA-058)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    appStorage.removeItem(PUBLIC_THEME_STORAGE_KEY);
    appStorage.removeItem(PUBLIC_LANG_STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    appStorage.removeItem(PUBLIC_THEME_STORAGE_KEY);
    appStorage.removeItem(PUBLIC_LANG_STORAGE_KEY);
  });

  it('provides default fallback preferences (night / en)', () => {
    const initial = getInitialPublicPreferences();
    expect(initial.theme).toBe('night');
    expect(initial.language).toBe('en');
  });

  it('updates theme in state, local storage, and document attribute', () => {
    const { result } = renderHook(() => usePublicThemeLang());

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.theme).toBe('dark');
    expect(appStorage.getItem(PUBLIC_THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    act(() => {
      result.current.setTheme('light');
    });

    expect(result.current.theme).toBe('light');
    expect(appStorage.getItem(PUBLIC_THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('cycles theme through light -> dark -> night', () => {
    const { result } = renderHook(() => usePublicThemeLang());

    act(() => {
      result.current.setTheme('light');
    });
    expect(result.current.theme).toBe('light');

    act(() => {
      result.current.cycleTheme();
    });
    expect(result.current.theme).toBe('dark');

    act(() => {
      result.current.cycleTheme();
    });
    expect(result.current.theme).toBe('night');

    act(() => {
      result.current.cycleTheme();
    });
    expect(result.current.theme).toBe('light');
  });

  it('updates language in state, storage, and i18n runtime', async () => {
    const { result } = renderHook(() => usePublicThemeLang());

    await act(async () => {
      result.current.setLanguage('fr');
    });

    expect(result.current.language).toBe('fr');
    expect(appStorage.getItem(PUBLIC_LANG_STORAGE_KEY)).toBe('fr');
    expect(i18n.language).toBe('fr');

    await act(async () => {
      result.current.setLanguage('en');
    });

    expect(result.current.language).toBe('en');
    expect(appStorage.getItem(PUBLIC_LANG_STORAGE_KEY)).toBe('en');
    expect(i18n.language).toBe('en');
  });
});
