import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'motion/react';
import { CountUp } from './motion/CountUp';
import {
  AI_TOOL_COUNT,
  SUPPORTED_BROKERS,
  SUPPORTED_LANGUAGE_COUNT,
  VAULT_PBKDF2_ITERATIONS,
} from '../../constants/productFacts';

const FACTS = [
  { key: 'aiTools', value: AI_TOOL_COUNT },
  { key: 'brokers', value: SUPPORTED_BROKERS.length },
  { key: 'kdf', value: VAULT_PBKDF2_ITERATIONS },
  { key: 'languages', value: SUPPORTED_LANGUAGE_COUNT },
] as const;

/** Verifiable product figures; each one is checked against the code by productFacts.test.ts. */
export const LandingStats: React.FC = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const containerRef = useRef<HTMLDListElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.3 });

  return (
    <section aria-label={t('landing:stats.ariaLabel')} className="border-t border-subtle bg-canvas">
      <dl ref={containerRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 lg:grid-cols-4">
        {FACTS.map(({ key, value }, index) => (
          <div
            key={key}
            className={`flex flex-col py-8 lg:py-10 pr-4 ${index > 0 ? 'lg:pl-8 lg:border-l border-subtle' : ''} ${index % 2 === 1 ? 'pl-4 border-l lg:pl-8' : ''} ${index > 1 ? 'border-t lg:border-t-0' : ''}`}
          >
            <dt className="text-sm text-secondary leading-snug order-2 max-w-[16rem]">{t(`landing:stats.${key}`)}</dt>
            <dd className="text-3xl sm:text-4xl font-extrabold tracking-tight text-primary mb-1.5 order-1 tabular-nums">
              <CountUp value={value} locale={locale} inView={isInView} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
