import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppWindow, Apple, ArrowRight, Check, Clock, Cpu, Download as DownloadIcon, Github, HardDrive, Laptop, RefreshCw, ShieldCheck, Terminal } from 'lucide-react';
import { PublicPageShell } from '../components/landing/PublicPageShell';
import { AppLink } from '../components/landing/LandingHeader';
import {
  buildDownloadUrl,
  DESKTOP_CHECKSUMS_FILE,
  DESKTOP_INSTALLERS_PUBLISHED,
  DESKTOP_OS_ORDER,
  DESKTOP_RELEASES_URL,
  downloadsFor,
  primaryDownloadFor,
  type DesktopOs,
} from '../config/downloads';
import { buildPublicPagePath } from '../config/project';
import { useDetectedOs } from '../hooks/useDetectedOs';

const OS_ICONS: Record<DesktopOs, React.ReactNode> = {
  mac: <Apple size={22} aria-hidden="true" />,
  win: <AppWindow size={22} aria-hidden="true" />,
  linux: <Terminal size={22} aria-hidden="true" />,
};

const BENEFITS = [
  { key: 'window', icon: Laptop },
  { key: 'local', icon: HardDrive },
  { key: 'updates', icon: RefreshCw },
  { key: 'ai', icon: Cpu },
] as const;

const STEP_KEYS: Record<DesktopOs, readonly string[]> = {
  mac: ['s1', 's2', 's3'],
  win: ['s1', 's2'],
  linux: ['s1', 's2'],
};

const linkButton =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold px-5 py-3 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary';
const primaryButton = `${linkButton} bg-primary hover:bg-primary-hover text-white shadow-lg`;
const secondaryButton = `${linkButton} bg-subtle hover:bg-card-hover border border-subtle text-primary`;

/** Download page of the desktop app: one card per system, the visitor's own highlighted, with the first-launch steps. */
const Download: React.FC = () => {
  const { t } = useTranslation();
  const detected = useDetectedOs();
  const published = DESKTOP_INSTALLERS_PUBLISHED;
  const primary = detected ? primaryDownloadFor(detected) : null;

  const heroActions = (
    <>
      {published && primary && detected ? (
        <a href={buildDownloadUrl(primary.file)} rel="noopener noreferrer" className={primaryButton}>
          <DownloadIcon size={17} aria-hidden="true" />
          <span>{t('download:actions.detected', { os: t(`download:platforms.${detected}.name`) })}</span>
        </a>
      ) : (
        <a href="#downloads" className={primaryButton}>
          <DownloadIcon size={17} aria-hidden="true" />
          <span>{t(published ? 'download:actions.choose' : 'download:actions.pending')}</span>
        </a>
      )}
      <Link to={buildPublicPagePath('/self-host')} className={secondaryButton}>
        <span>{t('download:alternatives.docker.cta')}</span>
        <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </>
  );

  return (
    <PublicPageShell title={t('download:title')} intro={t('download:intro')} actions={heroActions}>
      {!published && (
        <section aria-labelledby="download-soon" className="mb-12 rounded-2xl border border-brand/30 bg-brand/10 p-6">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold text-brand mb-2">
            <Clock size={14} aria-hidden="true" />
            <span>{t('download:comingSoon.badge')}</span>
          </p>
          <h2 id="download-soon" className="text-xl font-bold text-primary mb-2">{t('download:comingSoon.title')}</h2>
          <p className="text-[15px] text-secondary leading-relaxed max-w-prose mb-5">{t('download:comingSoon.body')}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link to={buildPublicPagePath('/self-host')} className={primaryButton}>
              <span>{t('download:comingSoon.docker')}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <AppLink path="/signup" className={secondaryButton}>
              <span>{t('download:comingSoon.cloud')}</span>
            </AppLink>
          </div>
        </section>
      )}

      <section id="downloads" aria-labelledby="download-systems" className="mb-16 scroll-mt-24">
        <h2 id="download-systems" className="sr-only">{t('download:actions.choose')}</h2>
        <ul className="grid lg:grid-cols-3 gap-5">
          {DESKTOP_OS_ORDER.map((os) => {
            const isDetected = detected === os;
            return (
              <li
                key={os}
                className={`rounded-2xl border bg-card p-6 flex flex-col ${isDetected ? 'border-brand/50 ring-1 ring-brand/30' : 'border-subtle'}`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">{OS_ICONS[os]}</div>
                  <div>
                    <h3 className="text-lg font-bold text-primary leading-tight">{t(`download:platforms.${os}.name`)}</h3>
                    <p className="text-xs text-secondary">{t(`download:platforms.${os}.requirements`)}</p>
                  </div>
                </div>
                {isDetected && (
                  <p className="inline-flex items-center gap-1.5 self-start text-xs font-bold text-brand bg-brand/10 border border-brand/30 rounded-full px-2.5 py-1 mb-4">
                    <Check size={12} aria-hidden="true" />
                    <span>{t('download:card.recommended')}</span>
                  </p>
                )}
                <ul className="space-y-3 mb-4">
                  {downloadsFor(os).map((item) => (
                    <li key={item.id} className="space-y-1.5">
                      <p className="text-sm font-semibold text-primary">{t(`download:platforms.${os}.variants.${item.id}`)}</p>
                      {published ? (
                        <a href={buildDownloadUrl(item.file)} rel="noopener noreferrer" className={`${secondaryButton} w-full`}>
                          <DownloadIcon size={15} aria-hidden="true" />
                          <span>{t('download:card.download', { format: item.format })}</span>
                        </a>
                      ) : (
                        <span aria-disabled="true" className={`${linkButton} w-full bg-subtle border border-subtle text-tertiary cursor-not-allowed`}>
                          {t('download:card.soon')}
                        </span>
                      )}
                      <p className="text-[11px] text-tertiary break-all">{item.file}</p>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-secondary leading-relaxed mt-auto">{t(`download:platforms.${os}.hint`)}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="download-benefits" className="mb-16">
        <h2 id="download-benefits" className="text-2xl font-bold tracking-tight text-primary mb-6">{t('download:benefits.title')}</h2>
        <ul className="grid sm:grid-cols-2 gap-5">
          {BENEFITS.map(({ key, icon: Icon }) => (
            <li key={key} className="rounded-2xl border border-subtle bg-card p-6">
              <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center mb-3">
                <Icon size={19} aria-hidden="true" />
              </div>
              <h3 className="text-base font-bold text-primary mb-1.5">{t(`download:benefits.${key}.title`)}</h3>
              <p className="text-sm text-secondary leading-relaxed">{t(`download:benefits.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="download-first-launch" className="mb-16">
        <h2 id="download-first-launch" className="text-2xl font-bold tracking-tight text-primary mb-3">{t('download:firstLaunch.title')}</h2>
        <p className="text-[15px] text-secondary leading-relaxed max-w-prose mb-6">{t('download:firstLaunch.intro')}</p>
        <div className="grid lg:grid-cols-3 gap-5">
          {DESKTOP_OS_ORDER.map((os) => (
            <div key={os} className="rounded-2xl border border-subtle bg-card p-6">
              <h3 className="text-base font-bold text-primary mb-3">{t(`download:firstLaunch.${os}.title`)}</h3>
              <ol className="space-y-3 list-decimal list-outside pl-5 text-sm text-secondary leading-relaxed marker:text-brand marker:font-bold">
                {STEP_KEYS[os].map((step) => (
                  <li key={step}>{t(`download:firstLaunch.${os}.steps.${step}`)}</li>
                ))}
              </ol>
              {os === 'mac' && <p className="text-xs text-tertiary mt-4">{t('download:firstLaunch.mac.after')}</p>}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="download-updates" className="mb-16 grid md:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-subtle bg-card p-6">
          <h2 id="download-updates" className="text-lg font-bold text-primary mb-2 flex items-center gap-2">
            <RefreshCw size={18} className="text-brand" aria-hidden="true" />
            <span>{t('download:updates.title')}</span>
          </h2>
          <p className="text-sm text-secondary leading-relaxed">{t('download:updates.body')}</p>
        </div>
        <div className="rounded-2xl border border-subtle bg-card p-6">
          <h2 className="text-lg font-bold text-primary mb-2 flex items-center gap-2">
            <ShieldCheck size={18} className="text-brand" aria-hidden="true" />
            <span>{t('download:verify.title')}</span>
          </h2>
          <p className="text-sm text-secondary leading-relaxed mb-4">{t('download:verify.body')}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
            {published && (
              <a href={buildDownloadUrl(DESKTOP_CHECKSUMS_FILE)} rel="noopener noreferrer" className="text-brand hover:underline">
                {t('download:verify.checksums')}
              </a>
            )}
            <a href={DESKTOP_RELEASES_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-brand hover:underline">
              <Github size={14} aria-hidden="true" />
              <span>{t('download:verify.releases')}</span>
            </a>
          </div>
        </div>
      </section>

      <section aria-labelledby="download-alternatives">
        <h2 id="download-alternatives" className="text-2xl font-bold tracking-tight text-primary mb-6">{t('download:alternatives.title')}</h2>
        <div className="grid sm:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-subtle bg-card p-6 flex flex-col">
            <h3 className="text-base font-bold text-primary mb-1.5">{t('download:alternatives.docker.title')}</h3>
            <p className="text-sm text-secondary leading-relaxed mb-5">{t('download:alternatives.docker.body')}</p>
            <Link to={buildPublicPagePath('/self-host')} className={`${secondaryButton} mt-auto`}>
              <span>{t('download:alternatives.docker.cta')}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className="rounded-2xl border border-subtle bg-card p-6 flex flex-col">
            <h3 className="text-base font-bold text-primary mb-1.5">{t('download:alternatives.cloud.title')}</h3>
            <p className="text-sm text-secondary leading-relaxed mb-5">{t('download:alternatives.cloud.body')}</p>
            <AppLink path="/signup" className={`${secondaryButton} mt-auto`}>
              <span>{t('download:alternatives.cloud.cta')}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </AppLink>
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
};

export default Download;
