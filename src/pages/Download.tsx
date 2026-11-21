import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, Github, HardDrive, Laptop, RefreshCw, ShieldCheck } from 'lucide-react';
import { PublicPageShell } from '../components/landing/PublicPageShell';
import { Reveal } from '../components/landing/motion/Reveal';
import { AllDownloads } from '../components/download/AllDownloads';
import { DownloadHero } from '../components/download/DownloadHero';
import { WaysToUse } from '../components/download/WaysToUse';
import { buildDownloadUrl, DESKTOP_CHECKSUMS_FILE, DESKTOP_INSTALLERS_PUBLISHED, DESKTOP_RELEASES_URL } from '../config/downloads';
import { useDetectedPlatform } from '../hooks/useDetectedOs';

const BENEFITS = [
  { key: 'window', icon: Laptop },
  { key: 'local', icon: HardDrive },
  { key: 'updates', icon: RefreshCw },
  { key: 'ai', icon: Cpu },
] as const;

/** Moves the page to the panel of all the versions, gently unless the system asks for less motion. */
const scrollToPanel = (panel: HTMLElement | null): void => {
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  panel?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
};

/**
 * Download page of the desktop app: one big button for the visitor's system, a panel with every system and version,
 * then the three ways to use GlassFolio (the desktop app first), what it brings, how it updates and how to verify it.
 */
const Download: React.FC = () => {
  const { t } = useTranslation();
  const { os, macArch, resolved } = useDetectedPlatform();
  const published = DESKTOP_INSTALLERS_PUBLISHED;
  const panelRef = useRef<HTMLElement | null>(null);

  // Folded when the system is known (the big button is enough), open on a phone or an unknown system
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? (resolved && os === null);

  const showAll = (): void => {
    setUserOpen(true);
    window.requestAnimationFrame(() => scrollToPanel(panelRef.current));
  };

  return (
    <PublicPageShell wide title={t('download:title')} intro={t('download:intro')}>
      <DownloadHero os={os} macArch={macArch} resolved={resolved} published={published} onShowAll={showAll} />
      <AllDownloads detected={os} open={open} onToggle={() => setUserOpen(!open)} published={published} sectionRef={panelRef} />

      <section aria-labelledby="download-benefits" className="mb-20">
        <Reveal>
          <h2 id="download-benefits" className="text-2xl sm:text-3xl font-bold tracking-tight text-primary mb-8">{t('download:benefits.title')}</h2>
        </Reveal>
        <ul className="grid sm:grid-cols-2 gap-6">
          {BENEFITS.map(({ key, icon: Icon }, index) => (
            <li key={key}>
              <Reveal className="h-full" delay={(index % 2) * 0.08}>
                <div className="h-full rounded-2xl border border-subtle bg-card p-6 sm:p-8">
                  <div className="w-12 h-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center mb-4">
                    <Icon size={22} aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-bold text-primary mb-2">{t(`download:benefits.${key}.title`)}</h3>
                  <p className="text-[15px] text-secondary leading-relaxed">{t(`download:benefits.${key}.body`)}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      <WaysToUse />

      <section aria-labelledby="download-updates" className="grid md:grid-cols-2 gap-6">
        <Reveal className="h-full">
          <div className="h-full rounded-2xl border border-subtle bg-card p-6 sm:p-8">
            <h2 id="download-updates" className="text-lg font-bold text-primary mb-3 flex items-center gap-2">
              <RefreshCw size={18} className="text-brand" aria-hidden="true" />
              <span>{t('download:updates.title')}</span>
            </h2>
            <p className="text-[15px] text-secondary leading-relaxed">{t('download:updates.body')}</p>
          </div>
        </Reveal>
        <Reveal className="h-full" delay={0.08}>
          <div className="h-full rounded-2xl border border-subtle bg-card p-6 sm:p-8">
            <h2 className="text-lg font-bold text-primary mb-3 flex items-center gap-2">
              <ShieldCheck size={18} className="text-brand" aria-hidden="true" />
              <span>{t('download:verify.title')}</span>
            </h2>
            <p className="text-[15px] text-secondary leading-relaxed mb-5">{t('download:verify.body')}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
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
        </Reveal>
      </section>
    </PublicPageShell>
  );
};

export default Download;
