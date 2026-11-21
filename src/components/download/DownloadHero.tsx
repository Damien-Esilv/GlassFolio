import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { m } from 'motion/react';
import { Check, ChevronDown, Clock, Download as DownloadIcon, Laptop } from 'lucide-react';
import { AppLink } from '../landing/LandingHeader';
import { SCREENSHOT_HEIGHT, SCREENSHOT_WIDTH } from '../landing/BrowserFrame';
import { TiltCard } from '../landing/motion/TiltCard';
import { buildDownloadUrl, otherMacDownload, primaryDownloadFor, type DesktopArch, type DesktopOs } from '../../config/downloads';
import { buildPublicPagePath } from '../../config/project';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const bigButton =
  'relative inline-flex items-center justify-center gap-3 whitespace-nowrap text-base font-bold px-8 py-4 rounded-2xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-canvas';
const calmButton =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold px-5 py-3 rounded-xl bg-subtle hover:bg-card-hover border border-subtle text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary';

interface DownloadHeroProps {
  /** The visitor's system, once known (null: unknown, a phone, or not asked yet). */
  os: DesktopOs | null;
  macArch: DesktopArch | null;
  /** True once the browser has been asked about the system. */
  resolved: boolean;
  /** False until the installers exist on the GitHub release: the page then never links to them. */
  published: boolean;
  onShowAll: () => void;
}

/** App window around a screenshot, leaning toward the pointer and floating gently. */
const AppWindow: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lang: 'en' | 'fr' = i18n.language?.startsWith('fr') ? 'fr' : 'en';
  return (
    <m.div animate={{ y: [0, -8, 0] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }} className="relative">
      <div className="absolute -inset-6 rounded-[2rem] bg-brand/15 blur-3xl" aria-hidden="true" />
      <TiltCard maxTilt={4} className="relative rounded-2xl border border-strong bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-subtle bg-subtle" aria-hidden="true">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-negative opacity-70" />
            <span className="w-2.5 h-2.5 rounded-full bg-warning opacity-70" />
            <span className="w-2.5 h-2.5 rounded-full bg-positive opacity-70" />
          </div>
          <span className="flex-1 text-center text-[11px] font-semibold text-tertiary">{t('download:hero.windowTitle')}</span>
          <span className="w-10" />
        </div>
        <img
          src={`/screenshots/${lang}/dashboard.webp`}
          alt=""
          width={SCREENSHOT_WIDTH}
          height={SCREENSHOT_HEIGHT}
          loading="eager"
          decoding="async"
          className="w-full h-auto object-cover object-top"
        />
      </TiltCard>
    </m.div>
  );
};

/**
 * The first thing on the page: one big button for the visitor's system, a discreet way to the other
 * systems and versions, and a window with the app to show what is being installed.
 */
export const DownloadHero: React.FC<DownloadHeroProps> = ({ os, macArch, resolved, published, onShowAll }) => {
  const { t } = useTranslation();
  const primary = os ? primaryDownloadFor(os, os === 'mac' ? macArch : null) : null;
  const otherMac = os === 'mac' && primary ? otherMacDownload(primary) : undefined;
  const osName = os ? t(`download:platforms.${os}.name`) : '';
  const phoneOrUnknown = resolved && !os;

  const showAllLink = (
    <button type="button" onClick={onShowAll} className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-brand hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded">
      <span>{t('download:hero.showAll')}</span>
      <ChevronDown size={15} aria-hidden="true" />
    </button>
  );

  let action: React.ReactNode;
  if (!published) {
    action = (
      <span aria-disabled="true" className={`${bigButton} bg-subtle border border-subtle text-tertiary cursor-not-allowed`}>
        <Clock size={19} aria-hidden="true" />
        <span>{t('download:card.soon')}</span>
      </span>
    );
  } else if (primary) {
    action = (
      <span className="relative inline-flex">
        <span className="absolute -inset-1 rounded-3xl bg-primary/30 blur-xl motion-safe:animate-pulse" aria-hidden="true" />
        <a href={buildDownloadUrl(primary.file)} rel="noopener noreferrer" className={`${bigButton} bg-primary hover:bg-primary-hover text-white shadow-lg`}>
          <DownloadIcon size={20} aria-hidden="true" />
          <span>{t('download:hero.download', { os: osName })}</span>
        </a>
      </span>
    );
  } else {
    action = (
      <button type="button" onClick={onShowAll} className={`${bigButton} bg-primary hover:bg-primary-hover text-white shadow-lg`}>
        <span>{t('download:hero.choose')}</span>
        <ChevronDown size={19} aria-hidden="true" />
      </button>
    );
  }

  const specLine = primary
    ? `${t(`download:platforms.${primary.os}.variants.${primary.id}`)} · .${primary.format}`
    : t(phoneOrUnknown ? 'download:hero.mobileNote' : 'download:hero.anySpec');

  return (
    <section aria-labelledby="download-primary" className="mb-10">
      <m.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
        className="relative overflow-hidden rounded-3xl border border-brand/30 bg-card shadow-2xl"
      >
        <div className="landing-aurora opacity-60" aria-hidden="true" />
        <div className="relative grid lg:grid-cols-[1fr_1.05fr] gap-12 lg:gap-14 items-center p-6 sm:p-10 lg:p-14">
          <div className="flex flex-col items-start">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold text-brand bg-brand/10 border border-brand/30 rounded-full px-3 py-1 mb-6">
              {os ? <Check size={13} aria-hidden="true" /> : <Laptop size={13} aria-hidden="true" />}
              <span>{t(os ? 'download:hero.recommended' : 'download:hero.eyebrow')}</span>
            </p>
            <h2 id="download-primary" className="text-3xl sm:text-4xl font-extrabold tracking-tight text-primary text-balance mb-3">
              {os ? t('download:hero.heading', { os: osName }) : t('download:hero.headingAny')}
            </h2>
            <p className="text-base text-secondary leading-relaxed max-w-md mb-8">{specLine}</p>

            {action}

            <div className="mt-7 flex flex-col gap-3">
              {published && otherMac && (
                <a href={buildDownloadUrl(otherMac.file)} rel="noopener noreferrer" className="text-sm font-semibold text-brand hover:underline">
                  {t(otherMac.arch === 'x64' ? 'download:hero.switchToIntel' : 'download:hero.switchToSilicon')}
                </a>
              )}
              {showAllLink}
            </div>

            {!published && (
              <div className="mt-8 w-full max-w-md rounded-2xl border border-subtle bg-subtle/60 p-5">
                <p className="text-sm text-secondary leading-relaxed mb-4">{t('download:comingSoon.body')}</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link to={buildPublicPagePath('/self-host')} className={calmButton}>
                    <span>{t('download:comingSoon.docker')}</span>
                  </Link>
                  <AppLink path="/signup" className={calmButton}>
                    <span>{t('download:comingSoon.cloud')}</span>
                  </AppLink>
                </div>
              </div>
            )}
          </div>
          <AppWindow />
        </div>
      </m.div>
    </section>
  );
};
