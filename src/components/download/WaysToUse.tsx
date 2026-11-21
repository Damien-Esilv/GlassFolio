import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, Globe, HardDrive, Info, Laptop } from 'lucide-react';
import { AppLink } from '../landing/LandingHeader';
import { Reveal } from '../landing/motion/Reveal';
import { buildPublicPagePath } from '../../config/project';

const DESKTOP_POINTS = ['p1', 'p2', 'p3'] as const;

const calmButton =
  'mt-auto inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold px-5 py-3 rounded-xl bg-subtle hover:bg-card-hover border border-subtle text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary';
const primaryButton =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-canvas';

const GoodToKnow: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

/** The three ways to use GlassFolio, with the desktop app first and larger, then Docker and the cloud version. */
export const WaysToUse: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="download-ways" className="mb-20">
      <Reveal>
        <h2 id="download-ways" className="text-2xl sm:text-3xl font-bold tracking-tight text-primary mb-3">{t('download:ways.title')}</h2>
        <p className="text-[15px] text-secondary leading-relaxed max-w-prose mb-10">{t('download:ways.intro')}</p>
      </Reveal>

      <Reveal>
        <div className="rounded-3xl border border-brand/40 ring-1 ring-brand/20 bg-card p-6 sm:p-10 grid lg:grid-cols-[1.15fr_1fr] gap-8 lg:gap-12">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
                <Laptop size={22} aria-hidden="true" />
              </div>
              <h3 className="text-2xl font-bold text-primary">{t('download:ways.desktop.title')}</h3>
              <span className="text-[10px] font-bold uppercase tracking-wide text-brand bg-brand/10 border border-brand/30 rounded-full px-2.5 py-1">
                {t('download:ways.recommended')}
              </span>
            </div>
            <p className="text-[15px] text-secondary leading-relaxed mb-6 max-w-prose">{t('download:ways.desktop.body')}</p>
            <ul className="space-y-3 mb-8">
              {DESKTOP_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm text-primary">
                  <Check size={16} className="text-positive mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{t(`download:ways.desktop.points.${point}`)}</span>
                </li>
              ))}
            </ul>
            <a href="#download-primary" className={primaryButton}>
              <span>{t('download:ways.desktop.cta')}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
          <div className="self-center">
            <GoodToKnow>{t('download:ways.desktop.note')}</GoodToKnow>
          </div>
        </div>
      </Reveal>

      <div className="grid md:grid-cols-2 gap-6 mt-6">
        <Reveal className="h-full" delay={0.05}>
          <div className="h-full rounded-2xl border border-subtle bg-card p-6 sm:p-8 flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
                <HardDrive size={20} aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-primary">{t('download:ways.docker.title')}</h3>
            </div>
            <p className="text-sm text-secondary leading-relaxed">{t('download:ways.docker.body')}</p>
            <GoodToKnow>{t('download:ways.docker.note')}</GoodToKnow>
            <Link to={buildPublicPagePath('/self-host')} className={calmButton}>
              <span>{t('download:ways.docker.cta')}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
        <Reveal className="h-full" delay={0.12}>
          <div className="h-full rounded-2xl border border-subtle bg-card p-6 sm:p-8 flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
                <Globe size={20} aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-primary">{t('download:ways.cloud.title')}</h3>
            </div>
            <p className="text-sm text-secondary leading-relaxed">{t('download:ways.cloud.body')}</p>
            <GoodToKnow>{t('download:ways.cloud.note')}</GoodToKnow>
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
