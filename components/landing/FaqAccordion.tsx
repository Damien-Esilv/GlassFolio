import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, ChevronDown } from 'lucide-react';

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;

export const FaqAccordion: React.FC = () => {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <section id="faq" className="py-16 lg:py-24 border-t border-subtle bg-canvas">
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

                {isOpen && (
                  <div
                    id={contentId}
                    role="region"
                    aria-labelledby={buttonId}
                    className="px-5 pb-5 pt-1 text-xs sm:text-sm text-secondary leading-relaxed border-t border-subtle/50"
                  >
                    {t(`landing:faq.items.${key}.answer`)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
