import React from 'react';
import { useTranslation } from 'react-i18next';
import { m } from 'motion/react';
import { Sparkles, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useDemoAccess } from '../../hooks/useDemoAccess';
import { useDemoOffered } from '../../hooks/useDemoOffered';
import { TiltCard } from './motion/TiltCard';
import { HeroModeChoice } from './HeroModeChoice';

/** One orchestrated page-load sequence: badge, headline words, copy, actions, then the live card. */
const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.7, ease: EASE_OUT },
});

export const LandingHero: React.FC = () => {
  const { t } = useTranslation();
  const { launchDemo, isLaunchingDemo, demoError } = useDemoAccess();
  const demoOffered = useDemoOffered();

  const titleWords = t('landing:hero.title').split(' ');
  const wordsDoneAt = 0.15 + titleWords.length * 0.045;

  return (
    <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20 lg:pb-24">
      <div className="landing-aurora" aria-hidden="true" />
      <div className="landing-grid" aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center max-w-3xl mx-auto mb-10 lg:mb-14">
          {/* Trust Badge */}
          <m.div
            {...rise(0)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/30 text-brand text-xs font-semibold mb-6"
          >
            <ShieldCheck size={14} />
            <span>{t('landing:hero.badge')}</span>
          </m.div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-primary leading-[1.15] mb-6 text-balance">
            {titleWords.map((word, index) => (
              <React.Fragment key={`${word}-${index}`}>
                <m.span
                  className="inline-block"
                  initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ delay: 0.15 + index * 0.045, duration: 0.6, ease: EASE_OUT }}
                >
                  {word}
                </m.span>
                {index < titleWords.length - 1 && ' '}
              </React.Fragment>
            ))}
          </h1>

          <m.p {...rise(wordsDoneAt)} className="text-base sm:text-lg text-secondary leading-relaxed mb-8">
            {t('landing:hero.subtitle')}
          </m.p>

          {/* Local or cloud: two choices of equal weight */}
          <m.div {...rise(wordsDoneAt + 0.1)} className="mb-2">
            <HeroModeChoice />
          </m.div>
        </div>

        {/* Prominent Animated 1-Click Demo Card (a local install offers it only when started for a demo) */}
        {demoOffered && (
        <m.div {...rise(wordsDoneAt + 0.25)} className="max-w-3xl mx-auto">
          <TiltCard maxTilt={3} className="bg-card border border-brand/30 rounded-2xl p-6 sm:p-7 shadow-xl relative overflow-hidden group">
            {/* Ambient Background Glow Layer */}
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-brand/10 rounded-full blur-3xl pointer-events-none group-hover:bg-brand/15 transition-all duration-700" />
            <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-positive/10 rounded-full blur-3xl pointer-events-none group-hover:bg-positive/15 transition-all duration-700" />

            <div className="relative z-10">
              {/* Top Row: Badge + Status */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand/10 border border-brand/25 text-brand text-xs font-semibold">
                  <Sparkles size={14} className="animate-pulse" />
                  <span>{t('landing:hero.demoCard.badge')}</span>
                </span>
                <span className="text-xs text-secondary font-medium">
                  {t('landing:hero.demoCard.stats.envelopes')}
                </span>
              </div>

              {/* Headline & Description */}
              <div className="mb-5 sm:mb-6 text-left">
                <h3 className="text-xl sm:text-2xl font-extrabold text-primary tracking-tight mb-2">
                  {t('landing:hero.demoCard.title')}
                </h3>
                <p className="text-sm text-secondary leading-relaxed">
                  {t('landing:hero.demoCard.subtitle')}
                </p>
              </div>

              {/* 4 Feature Pills Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-6">
                {(['noAccount', 'realAssets', 'aiAssistant', 'taxEngine'] as const).map((perkKey) => (
                  <div
                    key={perkKey}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-subtle border border-subtle text-xs sm:text-sm font-semibold text-primary"
                  >
                    <CheckCircle2 size={15} className="text-positive shrink-0" />
                    <span>{t(`landing:hero.demoCard.perks.${perkKey}`)}</span>
                  </div>
                ))}
              </div>

              {/* Centered CTA Button */}
              <div className="flex items-center justify-center pt-5 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => launchDemo('/')}
                  disabled={isLaunchingDemo}
                  className="inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-sm shadow-md shadow-brand/20 hover:shadow-lg hover:shadow-brand/30 hover:-translate-y-0.5 active:translate-y-0 transition-all focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 cursor-pointer"
                >
                  <Sparkles size={16} className="animate-spin-slow shrink-0" />
                  <span>{isLaunchingDemo ? t('landing:hero.demoCard.ctaLoading') : t('landing:hero.demoCard.cta')}</span>
                  <ArrowRight size={16} className="shrink-0 transition-transform group-hover:translate-x-1" />
                </button>
                {/* e.g. this device already holds a real vault: say why nothing happened */}
                {demoError && <p role="alert" className="text-xs text-negative mt-2">{demoError}</p>}
              </div>
            </div>
          </TiltCard>
        </m.div>
        )}
      </div>
    </section>
  );
};
