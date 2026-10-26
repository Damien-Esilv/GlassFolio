import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * LegacyHashRedirect (TGLA-067)
 * Intercepte et migre automatiquement les URLs d'anciens signets avec hashtag (#/path)
 * vers les chemins propres HTML5 (/path) sans recharger la page,
 * tout en préservant intacts les fragments d'authentification OAuth Supabase (#access_token=...).
 */
export const LegacyHashRedirect: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const hasMigrated = useRef(false);

  useEffect(() => {
    if (hasMigrated.current) return;
    if (typeof window === 'undefined' || !window.location.hash) return;

    const hash = window.location.hash;

    // Préserver les jetons et fragments du flux OAuth Supabase
    if (
      hash.includes('access_token=') ||
      hash.includes('refresh_token=') ||
      hash.includes('error=') ||
      hash.includes('error_description=')
    ) {
      return;
    }

    if (hash.startsWith('#/')) {
      hasMigrated.current = true;
      const cleanPath = hash.slice(1);
      const currentFull = location.pathname + location.search;

      if (cleanPath && cleanPath !== currentFull) {
        if (window.history?.replaceState) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        navigate(cleanPath, { replace: true });
      }
    }
  }, [navigate, location]);

  return null;
};
