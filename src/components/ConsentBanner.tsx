import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, X } from 'lucide-react';
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
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-lg z-50 bg-card border border-subtle rounded-2xl p-5 shadow-2xl backdrop-blur-xl transition-all animate-fade-in"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand/10 flex items-center justify-center text-brand shrink-0">
            <ShieldCheck size={16} />
          </div>
          <h3 className="text-sm font-bold text-primary">
            {t('legal:banner.title')}
          </h3>
        </div>

        <button
          type="button"
          onClick={handleRefuse}
          className="p-1 text-secondary hover:text-primary rounded-md transition-colors"
          aria-label={t('common:buttons.close')}
        >
          <X size={16} />
        </button>
      </div>

      <p className="text-xs text-secondary leading-relaxed mb-4">
        {t('legal:banner.description')}
      </p>

      {/* CNIL-Compliant: Two buttons with strictly equal visual prominence and sizing */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={handleRefuse}
          className="w-full py-2.5 px-3 rounded-xl bg-subtle hover:bg-card-hover text-primary border border-subtle text-xs font-bold transition-all text-center"
        >
          {t('legal:banner.refuseButton')}
        </button>

        <button
          type="button"
          onClick={handleAccept}
          className="w-full py-2.5 px-3 rounded-xl bg-subtle hover:bg-card-hover text-primary border border-subtle text-xs font-bold transition-all text-center"
        >
          {t('legal:banner.acceptButton')}
        </button>
      </div>

      <div className="mt-3 text-center">
        {/* The app-only build has no /cookies route: the page lives on the showcase site */}
        {getAppTarget() === 'app' ? (
          <LegalLink path="/cookies" onClick={() => setIsVisible(false)} className="text-[11px] text-brand hover:underline font-semibold">
            {t('legal:banner.customizeLink')} &rarr;
          </LegalLink>
        ) : (
          <Link
            to={cookiesPath}
            onClick={() => setIsVisible(false)}
            className="text-[11px] text-brand hover:underline font-semibold"
          >
            {t('legal:banner.customizeLink')} &rarr;
          </Link>
        )}
      </div>
    </aside>
  );
};
