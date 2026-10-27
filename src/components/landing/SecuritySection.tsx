import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { m } from 'motion/react';
import { Laptop, Network, Database, KeyRound, Lock, Unlock, Fingerprint, ShieldCheck, LifeBuoy } from 'lucide-react';

const STAGES = [
  { key: 'device', icon: Laptop },
  { key: 'transit', icon: Network },
  { key: 'rest', icon: Database },
] as const;

const POINT_KEYS = ['p1', 'p2', 'p3'] as const;

const KEY_FACTS = [
  { key: 'derived', icon: KeyRound },
  { key: 'maintainer', icon: ShieldCheck },
  { key: 'factors', icon: Fingerprint },
  { key: 'recovery', icon: LifeBuoy },
] as const;

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * Where the data is protected, as a flow: on the device, in transit, at rest. The connecting
 * rail draws itself once the section scrolls into view and the lock closes at the end.
 */
export const SecuritySection: React.FC = () => {
  const { t } = useTranslation();
  const [isSealed, setIsSealed] = useState(false);

  return (
    <section id="security" className="relative py-16 lg:py-24 border-t border-subtle bg-card overflow-hidden scroll-mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-primary tracking-tight leading-tight mb-4">
            {t('landing:security.title')}
          </h2>
          <p className="text-base text-secondary leading-relaxed">{t('landing:security.subtitle')}</p>
        </div>

        <m.div
          className="relative"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          onViewportEnter={() => window.setTimeout(() => setIsSealed(true), 1100)}
        >
          {/* Connecting rail behind the three stages (desktop) */}
          <m.span
            aria-hidden="true"
            className="hidden md:block absolute top-7 left-[16%] right-[16%] h-px bg-brand/40 origin-left"
            variants={{ hidden: { scaleX: 0 }, visible: { scaleX: 1, transition: { duration: 1, ease: EASE_OUT } } }}
          />
          <ol className="relative grid md:grid-cols-3 gap-6">
            {STAGES.map(({ key, icon: Icon }, index) => (
              <m.li
                key={key}
                variants={{
                  hidden: { opacity: 0, y: 18 },
                  visible: { opacity: 1, y: 0, transition: { delay: 0.15 + index * 0.25, duration: 0.55, ease: EASE_OUT } },
                }}
                className="flex flex-col"
              >
                <div className="relative z-10 w-14 h-14 mx-auto md:mx-0 md:self-center rounded-2xl bg-canvas border border-strong flex items-center justify-center text-brand shadow-lg mb-5">
                  {index === STAGES.length - 1 ? (
                    isSealed ? <Lock size={22} /> : <Unlock size={22} />
                  ) : (
                    <Icon size={22} />
                  )}
                </div>
                <div className="flex-1 rounded-2xl border border-subtle bg-canvas p-6">
                  <p className="text-base font-bold text-primary mb-3">{t(`landing:security.stages.${key}.title`)}</p>
                  <ul className="space-y-2.5">
                    {POINT_KEYS.map((point) => (
                      <li key={point} className="text-sm text-secondary leading-relaxed">
                        {t(`landing:security.stages.${key}.points.${point}`)}
                      </li>
                    ))}
                  </ul>
                </div>
              </m.li>
            ))}
          </ol>
        </m.div>

        {/* Key management: the same promise in local and cloud */}
        <div className="mt-14">
          <h3 className="text-xl sm:text-2xl font-bold text-primary tracking-tight mb-6">{t('landing:security.keys.title')}</h3>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-8">
            {KEY_FACTS.map(({ key, icon: Icon }, index) => (
              <m.li
                key={key}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ delay: index * 0.08, duration: 0.45, ease: EASE_OUT }}
                className="border-t-2 border-brand/30 pt-4"
              >
                <Icon size={20} className="text-brand mb-3" />
                <p className="text-sm font-bold text-primary mb-1.5">{t(`landing:security.keys.${key}.title`)}</p>
                <p className="text-sm text-secondary leading-relaxed">{t(`landing:security.keys.${key}.body`)}</p>
              </m.li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};
