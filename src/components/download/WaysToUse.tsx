import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Globe, HardDrive, Info } from 'lucide-react';
import { AppLink } from '../landing/LandingHeader';
import { Reveal } from '../landing/motion/Reveal';
import { buildPublicPagePath } from '../../config/project';
import { DemoButton } from '../landing/DemoButton';
import { LANDING_STAGGER_S } from '../../constants/animations';

const calmButton =
  'mt-auto inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold px-5 py-3 rounded-xl bg-subtle hover:bg-card-hover border border-subtle text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary';

export const GoodToKnow: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-subtle bg-subtle/60 p-5">
      <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-tertiary mb-2">
        <Info size={13} aria-hidden="true" />
        <span>{t('download:ways.goodToKnow')}</span>
      </p>
      <p className="text-sm text-secondary leading-relaxed">{children}</p>
    </div>
  );
};

/** The three ways to use GlassFolio: the desktop app (passed as children, it is the page's main block) first and larger, then Docker and the cloud version. */
export const WaysToUse: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="download-ways" className="mb-20">
      <Reveal>
        <h2 id="download-ways" className="text-2xl sm:text-3xl font-bold tracking-tight text-primary mb-3">{t('download:ways.title')}</h2>
        <p className="text-[15px] text-secondary leading-relaxed max-w-prose mb-10">{t('download:ways.intro')}</p>
      </Reveal>

      <div className="space-y-6">{children}</div>

      <div className="grid md:grid-cols-2 gap-6 mt-6">
        <Reveal className="h-full" delay={LANDING_STAGGER_S}>
          <div className="h-full rounded-2xl border border-positive/40 bg-card p-6 sm:p-8 flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
                <HardDrive size={20} aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-primary flex-1">{t('download:ways.docker.title')}</h3>
              <span className="px-2.5 py-1 rounded-full bg-positive-subtle text-positive text-[11px] font-semibold whitespace-nowrap">
                {t('download:ways.mostComplete')}
              </span>
            </div>
            <p className="text-sm text-secondary leading-relaxed">{t('download:ways.docker.body')}</p>
            <GoodToKnow>{t('download:ways.docker.note')}</GoodToKnow>
            <Link to={buildPublicPagePath('/self-host')} className={calmButton}>
              <span>{t('download:ways.docker.cta')}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
        <Reveal className="h-full" delay={2 * LANDING_STAGGER_S}>
          <div className="h-full rounded-2xl border border-subtle bg-card p-6 sm:p-8 flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
                <Globe size={20} aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-primary">{t('download:ways.cloud.title')}</h3>
            </div>
            <p className="text-sm text-secondary leading-relaxed">{t('download:ways.cloud.body')}</p>
            <GoodToKnow>{t('download:ways.cloud.note')}</GoodToKnow>
            {/* The demo, one click away (nothing on a local install not started for a demo) */}
            <DemoButton />
            <AppLink path="/signup" className={calmButton}>
              <span>{t('download:ways.cloud.cta')}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </AppLink>
          </div>
        </Reveal>
      </div>
    </section>
  );
};
