import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HardDrive, Globe, Check, ArrowRight } from 'lucide-react';
import { AppLink } from './LandingHeader';
import { buildPublicPagePath } from '../../config/project';

const POINT_KEYS = ['p1', 'p2'] as const;

const cardClass =
  'h-full rounded-2xl border border-subtle bg-card/80 p-5 sm:p-6 text-left flex flex-col shadow-lg hover:border-brand/40 transition-colors';
const buttonClass =
  'mt-auto inline-flex items-center justify-center gap-2 w-full bg-subtle hover:bg-card-hover border border-subtle text-primary text-sm font-bold px-4 py-3 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary';
/** The desktop app is the easiest way to run it at home, so its button is the one that stands out. */
const primaryButtonClass =
  'mt-auto inline-flex items-center justify-center gap-2 w-full bg-primary hover:bg-primary-hover text-white text-sm font-bold px-4 py-3 rounded-xl shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-canvas';

/**
 * Where to run GlassFolio: at home or online, with the same weight. At home offers the desktop app first
 * (its button is the main one) and Docker right under the points, so there are three ways in all.
 */
export const HeroModeChoice: React.FC = () => {
  const { t } = useTranslation();

  const renderCard = (mode: 'local' | 'cloud', icon: React.ReactNode, extra: React.ReactNode, action: React.ReactNode) => (
    <li className={cardClass}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">{icon}</div>
        <div>
          <p className="text-base font-bold text-primary leading-tight">{t(`landing:hero.modes.${mode}.title`)}</p>
          <p className="text-xs text-secondary">{t(`landing:hero.modes.${mode}.tagline`)}</p>
        </div>
      </div>
      <ul className="space-y-1.5 mb-5">
        {POINT_KEYS.map((point) => (
          <li key={point} className="flex items-start gap-2 text-sm text-secondary">
            <Check size={15} className="text-positive mt-0.5 shrink-0" />
            <span>{t(`landing:hero.modes.${mode}.points.${point}`)}</span>
          </li>
        ))}
      </ul>
      {extra}
      {action}
    </li>
  );

  return (
    <ul className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto" aria-label={t('landing:hero.modes.ariaLabel')}>
      {renderCard(
        'local',
        <HardDrive size={20} />,
        <Link
          to={buildPublicPagePath('/self-host')}
          className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-brand hover:underline mb-4 focus:outline-none focus:ring-2 focus:ring-primary rounded"
        >
          <span>{t('landing:hero.modes.local.ctaDocker')}</span>
          <ArrowRight size={14} />
        </Link>,
        <Link to={buildPublicPagePath('/download')} className={primaryButtonClass}>
          <span>{t('landing:hero.modes.local.cta')}</span>
          <ArrowRight size={15} />
        </Link>
      )}
      {renderCard(
        'cloud',
        <Globe size={20} />,
        null,
        <AppLink path="/signup" className={buttonClass}>
          <span>{t('landing:hero.modes.cloud.cta')}</span>
          <ArrowRight size={15} />
        </AppLink>
      )}
    </ul>
  );
};
