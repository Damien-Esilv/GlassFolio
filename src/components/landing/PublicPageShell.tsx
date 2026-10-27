import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { m } from 'motion/react';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { LandingMotionProvider } from './motion/LandingMotionProvider';
import { buildPublicPagePath } from '../../config/project';

interface PublicPageShellProps {
  title: string;
  intro: string;
  /** Optional actions under the intro (buttons, links). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/** Common frame of the public pages (about, roadmap, changelog): header, animated title, footer. */
export const PublicPageShell: React.FC<PublicPageShellProps> = ({ title, intro, actions, children }) => {
  const { t } = useTranslation();

  return (
    <LandingMotionProvider>
      <div className="min-h-screen bg-canvas text-primary font-display flex flex-col">
        <LandingHeader />
        <main className="flex-1">
          <div className="relative overflow-hidden border-b border-subtle">
            <div className="landing-grid" aria-hidden="true" />
            <m.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-12 lg:pt-20"
            >
              <Link to={buildPublicPagePath('') || '/'} className="text-sm font-semibold text-brand hover:underline">
                {t('selfhost:backToHome')}
              </Link>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-primary mt-4 mb-5 text-balance">{title}</h1>
              <p className="text-lg text-secondary leading-relaxed max-w-2xl">{intro}</p>
              {actions && <div className="mt-8 flex flex-col sm:flex-row gap-3">{actions}</div>}
            </m.div>
          </div>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">{children}</div>
        </main>
        <LandingFooter />
      </div>
    </LandingMotionProvider>
  );
};
