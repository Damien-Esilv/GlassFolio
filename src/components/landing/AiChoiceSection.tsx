import React from 'react';
import { useTranslation } from 'react-i18next';
import { m } from 'motion/react';
import { Cpu, Cloud, PlugZap, ShieldCheck, EyeOff, CheckCircle2, Wrench } from 'lucide-react';
import { BrowserFrame, SCREENSHOT_HEIGHT, SCREENSHOT_WIDTH } from './BrowserFrame';
import { TiltCard } from './motion/TiltCard';
import { AI_TOOL_COUNT } from '../../constants/productFacts';

const RUNTIMES = [
  { key: 'local', icon: Cpu },
  { key: 'api', icon: Cloud },
  { key: 'mcp', icon: PlugZap },
] as const;

const GUARDRAILS = [
  { key: 'redaction', icon: EyeOff },
  { key: 'approval', icon: CheckCircle2 },
  { key: 'tools', icon: Wrench },
] as const;

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Three equal ways to run the assistant, then the guardrails that apply to all of them. */
export const AiChoiceSection: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section id="ai" className="relative py-16 lg:py-24 border-t border-subtle bg-canvas overflow-hidden scroll-mt-16">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[minmax(0,4.5fr)_minmax(0,7.5fr)] gap-10 lg:gap-14 items-center mb-14">
          <div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-primary tracking-tight leading-tight mb-4">
              {t('landing:aiChoice.title')}
            </h2>
            <p className="text-base text-secondary leading-relaxed max-w-prose">{t('landing:aiChoice.subtitle')}</p>
          </div>
          <m.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
            className="w-full"
          >
            <BrowserFrame address={t('landing:story.addressBar')} className="w-full shadow-2xl">
              <div style={{ aspectRatio: `${SCREENSHOT_WIDTH} / ${SCREENSHOT_HEIGHT}` }}>
                <img
                  src="/screenshots/ai-assistant.webp"
                  alt={t('landing:aiChoice.screenshotAlt')}
                  width={SCREENSHOT_WIDTH}
                  height={SCREENSHOT_HEIGHT}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover object-top"
                />
              </div>
            </BrowserFrame>
          </m.div>
        </div>

        <ul className="grid md:grid-cols-3 gap-6 mb-10 items-stretch">
          {RUNTIMES.map(({ key, icon: Icon }, index) => (
            <m.li
              key={key}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ delay: index * 0.12, duration: 0.5, ease: EASE_OUT }}
              className="h-full flex"
            >
              <TiltCard maxTilt={4} className="h-full w-full rounded-2xl border border-subtle bg-card p-6 hover:border-brand/40 transition-colors flex flex-col justify-between">
                <div>
                  <div className="w-11 h-11 rounded-xl bg-brand/10 text-brand flex items-center justify-center mb-4">
                    <Icon size={21} />
                  </div>
                  <p className="text-base font-bold text-primary mb-2">{t(`landing:aiChoice.runtimes.${key}.title`)}</p>
                  <p className="text-sm text-secondary leading-relaxed mb-4">{t(`landing:aiChoice.runtimes.${key}.body`)}</p>
                </div>
                <div className="pt-3 border-t border-subtle/60 mt-auto">
                  <p className="text-xs font-semibold text-tertiary">{t(`landing:aiChoice.runtimes.${key}.examples`)}</p>
                </div>
              </TiltCard>
            </m.li>
          ))}
        </ul>

        <div className="rounded-2xl border border-subtle bg-card p-5 sm:p-6 flex flex-col md:flex-row md:items-center gap-5 md:gap-8">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-primary shrink-0">
            <ShieldCheck size={18} className="text-positive" />
            {t('landing:aiChoice.guardrailsTitle')}
          </p>
          <ul className="grid sm:grid-cols-3 gap-4 flex-1">
            {GUARDRAILS.map(({ key, icon: Icon }) => (
              <li key={key} className="flex items-start gap-2 text-sm text-secondary">
                <Icon size={16} className="text-brand mt-0.5 shrink-0" />
                <span>{t(`landing:aiChoice.guardrails.${key}`, { count: AI_TOOL_COUNT })}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Legal & Trademark Disclaimer */}
        <p className="text-[11px] text-tertiary text-center mt-6 leading-relaxed max-w-4xl mx-auto">
          {t('landing:aiChoice.trademarkNotice')}
        </p>
      </div>
    </section>
  );
};
