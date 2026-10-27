import React from 'react';
import { useTranslation } from 'react-i18next';
import { m } from 'motion/react';
import { Palette, Download, Coins, BellRing } from 'lucide-react';
import { TiltCard } from './motion/TiltCard';

/**
 * Everything not shown in the product story: real features, no overlap with the story steps,
 * the security and AI sections or the local/cloud choice.
 */
const CARDS = [
  { key: 'theming', icon: Palette, wide: true },
  { key: 'portability', icon: Download, wide: false },
  { key: 'currencies', icon: Coins, wide: false },
  { key: 'alerts', icon: BellRing, wide: true },
] as const;

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const FeatureBentoGrid: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section id="more" className="py-16 lg:py-24 border-t border-subtle bg-card scroll-mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-primary tracking-tight leading-tight mb-4">
            {t('landing:bento.title')}
          </h2>
          <p className="text-base text-secondary leading-relaxed">{t('landing:bento.subtitle')}</p>
        </div>

        <ul className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {CARDS.map(({ key, icon: Icon, wide }, index) => (
            <m.li
              key={key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ delay: (index % 2) * 0.12, duration: 0.55, ease: EASE_OUT }}
              className={`h-full flex ${wide ? 'md:col-span-2' : ''}`}
            >
              <TiltCard maxTilt={3} className="h-full w-full rounded-2xl border border-subtle bg-canvas p-6 sm:p-8 hover:border-brand/40 transition-colors flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-3 mb-5">
                    <div className="w-11 h-11 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                      <Icon size={21} />
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-subtle text-secondary border border-subtle text-[11px] font-semibold">
                      {t(`landing:bento.${key}.badge`)}
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-primary mb-2">{t(`landing:bento.${key}.title`)}</h3>
                  <p className="text-sm text-secondary leading-relaxed">{t(`landing:bento.${key}.description`)}</p>
                </div>
              </TiltCard>
            </m.li>
          ))}
        </ul>
      </div>
    </section>
  );
};
