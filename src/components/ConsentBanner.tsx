import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import {
  getConsent,
  setConsent,
  subscribeConsent,
  subscribeConsentPreferencesOpen,
} from '../services/consentService';
import { getDeploymentMode, getAppTarget } from '../config/deployment';
import { LegalLink } from './ui/LegalLink';

export const ConsentBanner: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const location = useLocation();
  const deploymentMode = getDeploymentMode();
  const appTarget = getAppTarget();

  // In pure self-hosted app-only mode (Docker), don't auto-popup on load
  const isPureAppMode = deploymentMode === 'local' && appTarget === 'app';

  useEffect(() => {
    // Show banner if not in pure app-only Docker mode and consent has not been recorded yet
    if (!isPureAppMode) {
      const current = getConsent();
      if (!current) {
        setIsVisible(true);
      }
    }

    // Subscribe to external open triggers (e.g. from footer link or /cookies tab)
    const unsubOpen = subscribeConsentPreferencesOpen(() => {
      setIsVisible(true);
    });

    const unsubConsent = subscribeConsent((record) => {
      if (record) {
        setIsVisible(false);
      }
    });

    return () => {
      unsubOpen();
      unsubConsent();
    };
  }, [isPureAppMode]);

  if (!isVisible) {
    return null;
  }

  const handleAccept = () => {
    setConsent(true);
    setIsVisible(false);
  };

  const handleRefuse = () => {
    setConsent(false);
    setIsVisible(false);
  };

  const isWelcomeBase = location.pathname.startsWith('/welcome');
  const cookiesPath = isWelcomeBase ? '/welcome/cookies' : '/cookies';

  return (
    <aside
      role="region"
      aria-label={t('legal:banner.title')}
      className="fixed bottom-0 inset-x-0 z-50 bg-card border-t border-subtle shadow-2xl animate-fade-in"
    >
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <h3 className="sr-only">{t('legal:banner.title')}</h3>
          <p className="text-xs text-secondary leading-snug flex-1 py-1">
            {t('legal:banner.description')}{' '}
            {/* The app-only build has no /cookies route: the page lives on the showcase site */}
            {getAppTarget() === 'app' ? (
              <LegalLink path="/cookies" onClick={() => setIsVisible(false)} className="text-brand hover:underline font-semibold">
                {t('legal:banner.customizeLink')}
              </LegalLink>
            ) : (
              <Link
                to={cookiesPath}
                onClick={() => setIsVisible(false)}
                className="text-brand hover:underline font-semibold"
              >
                {t('legal:banner.customizeLink')}
              </Link>
            )}
          </p>

          <button
            type="button"
            onClick={handleRefuse}
            className="md:hidden w-11 h-11 -mt-1.5 -mr-2 flex items-center justify-center text-secondary hover:text-primary rounded-md transition-colors shrink-0"
            aria-label={t('common:buttons.close')}
          >
            <X size={16} />
          </button>
        </div>

        {/* CNIL-Compliant: Two buttons with strictly equal visual prominence and sizing */}
        <div className="grid grid-cols-2 gap-2 md:shrink-0 md:w-96">
          <button
            type="button"
            onClick={handleRefuse}
            className="min-h-11 px-3 rounded-xl bg-subtle hover:bg-card-hover text-primary border border-subtle text-xs font-bold transition-all text-center"
          >
            {t('legal:banner.refuseButton')}
          </button>

          <button
            type="button"
            onClick={handleAccept}
            className="min-h-11 px-3 rounded-xl bg-subtle hover:bg-card-hover text-primary border border-subtle text-xs font-bold transition-all text-center"
          >
            {t('legal:banner.acceptButton')}
          </button>
        </div>
      </div>
    </aside>
  );
};
