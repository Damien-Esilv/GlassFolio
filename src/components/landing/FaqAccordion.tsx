import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, ChevronDown, Sparkles, ArrowRight } from 'lucide-react';
import { useDemoAccess } from '../../hooks/useDemoAccess';
import { useDemoOffered } from '../../hooks/useDemoOffered';

/** From "can I try it?" to "how do I install it?" to "is it safe?" to the details of the features. */
const FAQ_KEYS = ['q6', 'q5', 'q8', 'q9', 'q10', 'q7', 'q1', 'q4', 'q3', 'q2'] as const;

export const FaqAccordion: React.FC = () => {
  const { t } = useTranslation();
  const { launchDemo, isLaunchingDemo, demoError } = useDemoAccess();
  const demoOffered = useDemoOffered();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <section id="faq" className="py-16 lg:py-24 border-t border-subtle bg-canvas scroll-mt-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-semibold mb-4">
            <HelpCircle size={14} />
            <span>{t('landing:faq.sectionBadge')}</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-extrabold text-primary tracking-tight mb-4">
            {t('landing:faq.title')}
          </h2>
        </div>

        {/* Accordion Container */}
        <div className="space-y-3.5">
          {FAQ_KEYS.map((key, idx) => {
            const isOpen = openIndex === idx;
            const contentId = `faq-content-${key}`;
            const buttonId = `faq-btn-${key}`;

            return (
              <div
                key={key}
                className="bg-card border border-subtle rounded-2xl overflow-hidden transition-all shadow-sm"
              >
                <button
                  type="button"
                  id={buttonId}
                  aria-expanded={isOpen}
                  aria-controls={contentId}
                  onClick={() => toggle(idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 hover:bg-subtle/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <span className="text-sm sm:text-base font-bold text-primary">
                    {t(`landing:faq.items.${key}.question`)}
                  </span>
                  <ChevronDown
                    size={18}
                    className={`text-secondary shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-brand' : ''
                    }`}
                  />
                </button>

                {/* Hidden, not unmounted: closed answers stay in the prerendered HTML for crawlers */}
                <div
                  id={contentId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!isOpen}
                  className="px-5 pb-5 pt-1 text-xs sm:text-sm text-secondary leading-relaxed"
                >
                  {t(`landing:faq.items.${key}.answer`)}
                  {/* The answer to "how can I try it" is one click away */}
                  {key === 'q6' && demoOffered && (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => launchDemo('/')}
                        disabled={isLaunchingDemo}
                        className="group inline-flex items-center gap-2 px-4 py-2 rounded-full border border-brand/30 bg-brand/10 hover:bg-brand/15 text-brand text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 cursor-pointer"
                      >
                        <Sparkles size={15} className="shrink-0 transition-transform duration-300 group-hover:rotate-12" />
                        <span>{isLaunchingDemo ? t('landing:hero.demoCard.ctaLoading') : t('landing:hero.demoCard.cta')}</span>
                        <ArrowRight size={15} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                      </button>
                      {demoError && <p role="alert" className="text-xs text-negative mt-2">{demoError}</p>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
