import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { m } from 'motion/react';
import { ArrowRight, Briefcase, ExternalLink, Landmark, Laptop, ShieldCheck, Wallet } from 'lucide-react';
import { TiltCard } from './motion/TiltCard';
import { Reveal } from './motion/Reveal';
import { LANDING_EASE_OUT, LANDING_REVEAL_DURATION_S, LANDING_STAGGER_S } from '../../constants/animations';
import { buildPublicPagePath, SNAPTRADE_SITE_URL, WOOB_SITE_URL } from '../../config/project';

/** The three automatic sync modes, in the order a user meets them: brokers, wallets, French banks (local only). */
const MODES = [
  { key: 'brokers', icon: Briefcase, site: SNAPTRADE_SITE_URL, localOnly: false },
  { key: 'wallets', icon: Wallet, site: null, localOnly: false },
  { key: 'banks', icon: Landmark, site: WOOB_SITE_URL, localOnly: true },
] as const;

/**
 * Landing: automatic sync in three ways (TGLA-246). Each card says what it reads and where it runs; French banks
 * through Woob run only on the user's computer (desktop app or Docker), never in the online app.
 */
export const SyncSection: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section id="sync" className="py-16 lg:py-24 border-t border-subtle bg-canvas scroll-mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-primary tracking-tight leading-tight mb-4">
            {t('landing:sync.title')}
          </h2>
          <p className="text-base text-secondary leading-relaxed">{t('landing:sync.subtitle')}</p>
        </Reveal>

        <ul className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {MODES.map(({ key, icon: Icon, site, localOnly }, index) => (
            <m.li
              key={key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: (index + 1) * LANDING_STAGGER_S, duration: LANDING_REVEAL_DURATION_S, ease: LANDING_EASE_OUT }}
              className="h-full flex"
            >
              <TiltCard maxTilt={3} className="h-full w-full rounded-2xl border border-subtle bg-card p-6 sm:p-8 hover:border-brand/40 transition-colors flex flex-col">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className="w-11 h-11 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                    <Icon size={21} aria-hidden="true" />
                  </div>
                  <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${localOnly ? 'bg-warning-subtle text-warning border-warning/30' : 'bg-subtle text-secondary border-subtle'}`}>
                    {t(`landing:sync.modes.${key}.where`)}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-primary mb-2">{t(`landing:sync.modes.${key}.title`)}</h3>
                <p className="text-sm text-secondary leading-relaxed flex-1">{t(`landing:sync.modes.${key}.description`)}</p>

                {localOnly && (
                  <p className="mt-4 flex items-start gap-2 text-xs text-primary bg-warning-subtle rounded-lg p-3">
                    <Laptop size={14} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      {t('landing:sync.localOnly')}{' '}
                      <Link to={buildPublicPagePath('/download')} className="font-semibold text-brand hover:underline inline-flex items-center gap-1">
                        {t('landing:sync.localOnlyLink')}
                        <ArrowRight size={12} aria-hidden="true" />
                      </Link>
                    </span>
                  </p>
                )}

                {site && (
                  <div className="mt-4 space-y-1">
                    <a href={site} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">
                      {t(`landing:sync.modes.${key}.siteLink`)}
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                    <p className="text-[11px] text-tertiary">{t(`landing:sync.modes.${key}.siteNote`)}</p>
                  </div>
                )}
              </TiltCard>
            </m.li>
          ))}
        </ul>

        <Reveal delay={(MODES.length + 1) * LANDING_STAGGER_S} className="mt-8">
          <p className="flex items-start gap-2 text-sm text-secondary max-w-3xl">
            <ShieldCheck size={18} className="text-positive shrink-0 mt-0.5" aria-hidden="true" />
            {t('landing:sync.promise')}
          </p>
        </Reveal>
      </div>
    </section>
  );
};
