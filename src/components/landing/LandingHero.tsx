import React from 'react';
import { useTranslation } from 'react-i18next';
import { m } from 'motion/react';
import { ShieldCheck } from 'lucide-react';
import { DemoButton } from './DemoButton';
import { HeroModeChoice } from './HeroModeChoice';
import { LANDING_EASE_OUT } from '../../constants/animations';

/** One orchestrated page-load sequence: badge, headline words, copy, actions, then the live card. */
const EASE_OUT = LANDING_EASE_OUT;
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.7, ease: EASE_OUT },
});

export const LandingHero: React.FC = () => {
  const { t } = useTranslation();

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

          {/* The demo, framed and visible under the two choices (nothing on a local install not started for a demo) */}
          <m.div {...rise(wordsDoneAt + 0.2)}>
            <DemoButton className="mt-6" />
          </m.div>
        </div>
      </div>
    </section>
  );
};
