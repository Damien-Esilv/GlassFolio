import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDemoAccess } from '../../../src/hooks/useDemoAccess';
import * as deploymentModule from '../../../src/config/deployment';
import { appStorage } from '../../../src/services/storage/appStorage';
import { PUBLIC_THEME_STORAGE_KEY, PUBLIC_LANG_STORAGE_KEY } from '../../../src/services/storage/storageKeys';
import '../../../src/i18n';

// Mock react-router-dom
const mockNavigate = vi.fn();
let mockPathname = '/welcome';

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockPathname }),
}));

// Mock AuthContext
const mockLogin = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    user: null,
  }),
}));

describe('useDemoAccess hook (TGLA-057 / TGLA-058)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockPathname = '/welcome';
    appStorage.setItem(PUBLIC_THEME_STORAGE_KEY, 'night');
    appStorage.setItem(PUBLIC_LANG_STORAGE_KEY, 'fr');
  });

  afterEach(() => {
    appStorage.removeItem(PUBLIC_THEME_STORAGE_KEY);
    appStorage.removeItem(PUBLIC_LANG_STORAGE_KEY);
  });

  it('performs local login and preserves history ({ replace: false }) when launched from /welcome', async () => {
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('unified');
    vi.spyOn(deploymentModule, 'getAppUrl').mockReturnValue('');

    const { result } = renderHook(() => useDemoAccess());

    await act(async () => {
      await result.current.launchDemo('/');
    });

    expect(mockLogin).toHaveBeenCalledWith('demo@glassfolio.com', 'password');
    // Crucial UX invariant: replace: false ensures Back button returns to /welcome
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: false });
    expect(result.current.isLaunchingDemo).toBe(false);
    expect(result.current.demoError).toBe('');
  });

  it('redirects to external subdomain with theme, lang, and demo params in showcase mode', async () => {
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('showcase');
    vi.stubEnv('VITE_APP_URL', 'https://app.glassfolio.dev');

    const assignMock = vi.fn();
    vi.stubGlobal('location', {
      assign: assignMock,
      pathname: '/',
    });

    const { result } = renderHook(() => useDemoAccess());

    await act(async () => {
      await result.current.launchDemo('/login');
    });

    expect(assignMock).toHaveBeenCalledWith(
      'https://app.glassfolio.dev/login?theme=night&lang=fr&demo=1'
    );
    expect(mockLogin).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('captures login errors and updates demoError state', async () => {
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('unified');
    vi.spyOn(deploymentModule, 'getAppUrl').mockReturnValue('');
    mockLogin.mockRejectedValueOnce(new Error('Vault locked or credentials invalid'));

    const { result } = renderHook(() => useDemoAccess());

    await act(async () => {
      await result.current.launchDemo('/');
    });

    // Unknown service text is never shown raw: the translated login failure is used instead
    expect(result.current.demoError).toBe('Failed to login');
    expect(result.current.isLaunchingDemo).toBe(false);
  });
});
