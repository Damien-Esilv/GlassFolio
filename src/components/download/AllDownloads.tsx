import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { m } from 'motion/react';
import { AppWindow, Apple, ChevronDown, Download as DownloadIcon, Terminal } from 'lucide-react';
import { buildDownloadUrl, DESKTOP_OS_ORDER, downloadsFor, type DesktopOs } from '../../config/downloads';

const OS_ICONS: Record<DesktopOs, React.ReactNode> = {
  mac: <Apple size={22} aria-hidden="true" />,
  win: <AppWindow size={22} aria-hidden="true" />,
  linux: <Terminal size={22} aria-hidden="true" />,
};

const STEP_KEYS: Record<DesktopOs, readonly string[]> = {
  mac: ['s1', 's2', 's3'],
  win: ['s1', 's2'],
  linux: ['s1', 's2'],
};

const downloadButton =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary sm:w-56';

interface AllDownloadsProps {
  /** The visitor's system: its tab opens first and is marked. */
  detected: DesktopOs | null;
  open: boolean;
  onToggle: () => void;
  published: boolean;
  sectionRef: React.RefObject<HTMLElement | null>;
}

/**
 * Every installer, one system per tab, with the steps of the first launch of that system.
 * The panel folds away smoothly but stays in the page (hidden from the keyboard and screen readers while folded),
 * so the prerendered HTML carries all the texts.
 */
export const AllDownloads: React.FC<AllDownloadsProps> = ({ detected, open, onToggle, published, sectionRef }) => {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<DesktopOs | null>(null);
  const active = chosen ?? detected ?? 'mac';
  const tabRefs = useRef<Partial<Record<DesktopOs, HTMLButtonElement | null>>>({});

  const handleTabKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const count = DESKTOP_OS_ORDER.length;
    const targets: Record<string, number> = {
      ArrowRight: (index + 1) % count,
      ArrowLeft: (index - 1 + count) % count,
      Home: 0,
      End: count - 1,
    };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const os = DESKTOP_OS_ORDER[next];
    setChosen(os);
    tabRefs.current[os]?.focus();
  };

  return (
    <section id="downloads" ref={sectionRef} aria-labelledby="download-all-toggle" className="mb-20 scroll-mt-24">
      <button
        id="download-all-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="download-all-panel"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 rounded-2xl border border-subtle bg-card hover:bg-card-hover px-6 py-5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <span>
          <span className="block text-lg font-bold text-primary">{t('download:all.title')}</span>
          <span className="block text-sm text-secondary mt-0.5">{t('download:all.subtitle')}</span>
        </span>
        <ChevronDown
          size={22}
          aria-hidden="true"
          className={`shrink-0 text-brand transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        id="download-all-panel"
        inert={!open}
        className={`grid transition-[grid-template-rows,visibility] duration-300 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr] visible' : 'grid-rows-[0fr] invisible'}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-8">
            <div role="tablist" aria-label={t('download:all.tabsLabel')} className="inline-flex flex-wrap gap-1 rounded-2xl border border-subtle bg-subtle p-1 mb-8">
              {DESKTOP_OS_ORDER.map((os, index) => (
                <button
                  key={os}
                  ref={(node) => {
                    tabRefs.current[os] = node;
                  }}
                  id={`download-tab-${os}`}
                  type="button"
                  role="tab"
                  aria-selected={active === os}
                  aria-controls={`download-tabpanel-${os}`}
                  tabIndex={active === os ? 0 : -1}
                  onClick={() => setChosen(os)}
                  onKeyDown={(event) => handleTabKey(event, index)}
                  className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                    active === os ? 'bg-card text-primary shadow-md' : 'text-secondary hover:text-primary'
                  }`}
                >
                  {OS_ICONS[os]}
                  <span>{t(`download:platforms.${os}.name`)}</span>
                  {detected === os && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-brand bg-brand/10 border border-brand/30 rounded-full px-2 py-0.5">
                      {t('download:all.yours')}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {DESKTOP_OS_ORDER.map((os) => (
              <div key={os} id={`download-tabpanel-${os}`} role="tabpanel" aria-labelledby={`download-tab-${os}`} hidden={active !== os}>
                <m.div key={String(active === os)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
                  <p className="text-sm text-secondary mb-5">{t(`download:platforms.${os}.requirements`)}</p>
                  <ul className="space-y-4 mb-5">
                    {downloadsFor(os).map((item) => (
                      <li key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-5 rounded-2xl border border-subtle bg-subtle/50 p-5 sm:p-6">
                        <div className="w-12 h-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">{OS_ICONS[os]}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-bold text-primary">{t(`download:platforms.${os}.variants.${item.id}`)}</p>
                          <p className="text-xs text-tertiary mt-1 break-all">{item.file}</p>
                        </div>
                        {published ? (
                          <a href={buildDownloadUrl(item.file)} rel="noopener noreferrer" className={downloadButton}>
                            <DownloadIcon size={16} aria-hidden="true" />
                            <span>{t('download:card.download', { format: item.format })}</span>
                          </a>
                        ) : (
                          <span aria-disabled="true" className={`${downloadButton} !bg-subtle !text-tertiary border border-subtle !shadow-none cursor-not-allowed`}>
                            {t('download:card.soon')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-secondary leading-relaxed max-w-prose mb-10">{t(`download:platforms.${os}.hint`)}</p>

                  <h3 className="text-xl font-bold text-primary mb-2">{t(`download:firstLaunch.${os}.title`)}</h3>
                  <p className="text-[15px] text-secondary leading-relaxed max-w-prose mb-6">{t('download:firstLaunch.intro')}</p>
                  <ol className="space-y-4 list-none max-w-2xl">
                    {STEP_KEYS[os].map((step, index) => (
                      <li key={step} className="flex items-start gap-4">
                        <span aria-hidden="true" className="mt-0.5 w-8 h-8 rounded-full bg-brand/10 text-brand text-sm font-bold flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <span className="text-[15px] text-secondary leading-relaxed">{t(`download:firstLaunch.${os}.steps.${step}`)}</span>
                      </li>
                    ))}
                  </ol>
                  {os === 'mac' && <p className="text-sm text-tertiary mt-6 max-w-2xl">{t('download:firstLaunch.mac.after')}</p>}
                </m.div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
