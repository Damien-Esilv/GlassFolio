import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { trackPublicEvent } from '../services/consentService';
import { getAppTarget, getAppUrl, buildAppDestinationUrl } from '../config/deployment';
import { appStorage } from '../services/storage/appStorage';
import { PUBLIC_LANG_STORAGE_KEY, PUBLIC_THEME_STORAGE_KEY } from '../services/storage/storageKeys';

export interface UseDemoAccessResult {
  launchDemo: (targetPath?: string) => Promise<void>;
  isLaunchingDemo: boolean;
  demoError: string;
}

/**
 * Shared 1-Click Demo Access Hook (TGLA-057 / TGLA-058).
 *
 * Handles both:
 *  1. Cross-subdomain redirection (from apex showcase to app subdomain with ?demo=1&theme=...&lang=...)
 *  2. Same-origin navigation in unified mode (preserving browser history so 'Back' returns to /welcome)
 */
export function useDemoAccess(): UseDemoAccessResult {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLaunchingDemo, setIsLaunchingDemo] = useState(false);
  const [demoError, setDemoError] = useState('');

  const launchDemo = useCallback(
    async (targetPath = '/'): Promise<void> => {
      setDemoError('');
      setIsLaunchingDemo(true);
      try {
        const appTarget = getAppTarget();
        const appUrl = getAppUrl();
        const theme = appStorage.getItem(PUBLIC_THEME_STORAGE_KEY) || 'night';
        const lang = appStorage.getItem(PUBLIC_LANG_STORAGE_KEY) || 'en';

        // 1. Cross-subdomain redirection (production apex -> app subdomain)
        if (appTarget === 'showcase' || appUrl) {
          const validPath = (targetPath === '/' || targetPath === '/login' || targetPath === '/signup')
            ? targetPath
            : '/';
          const destination = buildAppDestinationUrl(validPath, {
            demo: true,
            theme,
            lang,
          });
          trackPublicEvent('demo_launch_clicked', { target: destination });
          if (typeof window !== 'undefined') {
            window.location.assign(destination);
          }
          return;
        }

        // 2. Same-origin unified mode (local dev & test)
        trackPublicEvent('demo_launch_clicked', { target: targetPath });
        await login('demo@glassfolio.com', 'password');

        // From /welcome or showcase: push onto history so browser Back returns to /welcome
        const isFromWelcome = location.pathname === '/welcome' || location.pathname === '/';
        navigate(targetPath, { replace: !isFromWelcome });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t('auth:login.failedToLogin');
        setDemoError(message);
      } finally {
        setIsLaunchingDemo(false);
      }
    },
    [login, navigate, location.pathname, t]
  );

  return {
    launchDemo,
    isLaunchingDemo,
    demoError,
  };
}
