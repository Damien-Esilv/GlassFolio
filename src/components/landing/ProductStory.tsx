import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, m } from 'motion/react';
import { LayoutDashboard, Layers, LineChart, Landmark, FileUp, Trophy, Check } from 'lucide-react';
import { BrowserFrame, SCREENSHOT_HEIGHT, SCREENSHOT_WIDTH } from './BrowserFrame';

/** Story steps, in scroll order; `shot` is the file name in public/screenshots. */
export const STORY_STEPS = [
  { key: 'dashboard', shot: 'dashboard', icon: LayoutDashboard },
  { key: 'positions', shot: 'positions', icon: Layers },
  { key: 'performance', shot: 'fees', icon: LineChart },
  { key: 'tax', shot: 'tax', icon: Landmark },
  { key: 'import', shot: 'import', icon: FileUp },
  { key: 'progress', shot: 'progress', icon: Trophy },
] as const;

const POINT_KEYS = ['p1', 'p2', 'p3'] as const;

const Screenshot: React.FC<{ shot: string; alt: string; eager?: boolean }> = ({ shot, alt, eager }) => (
  <img
    src={`/screenshots/${shot}.webp`}
    alt={alt}
    width={SCREENSHOT_WIDTH}
    height={SCREENSHOT_HEIGHT}
    loading={eager ? 'eager' : 'lazy'}
    decoding="async"
    className="w-full h-full object-cover object-top"
  />
);

/**
 * Sticky scrollytelling: on large screens the app frame stays pinned while the explanations
 * scroll past, and the screenshot follows the step in the middle of the viewport. On small
 * screens every step carries its own screenshot (no sticky layout).
 */
export const ProductStory: React.FC = () => {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = stepRefs.current.indexOf(entry.target as HTMLElement);
          if (index >= 0) setActive(index);
        }
      },
      // A step becomes active when it crosses the horizontal middle band of the viewport.
      { rootMargin: '-45% 0px -45% 0px' }
    );
    for (const node of stepRefs.current) if (node) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const goTo = (index: number): void => {
    setActive(index);
    stepRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const current = STORY_STEPS[active];
  const label = (key: string): string => t(`landing:story.steps.${key}.title`);

  return (
    <section id="features" className="relative py-16 lg:py-24 border-t border-subtle bg-canvas scroll-mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-10 lg:mb-4">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-primary tracking-tight leading-tight mb-4">
            {t('landing:story.title')}
          </h2>
          <p className="text-base text-secondary leading-relaxed">{t('landing:story.subtitle')}</p>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          {/* Explanations: one viewport band per step on desktop */}
          <ol className="space-y-14 lg:space-y-0">
            {STORY_STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === active;
              return (
                <li
                  key={step.key}
                  ref={(node) => {
                    stepRefs.current[index] = node;
                  }}
                  data-step={step.key}
                  aria-current={isActive ? 'step' : undefined}
                  className={`lg:min-h-[72vh] lg:flex lg:flex-col lg:justify-center transition-opacity duration-500 ${
                    isActive ? 'lg:opacity-100' : 'lg:opacity-40'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center mb-4">
                    <Icon size={20} />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-primary tracking-tight mb-3">{label(step.key)}</h3>
                  <p className="text-[15px] text-secondary leading-relaxed mb-4 max-w-prose">
                    {t(`landing:story.steps.${step.key}.body`)}
                  </p>
                  <ul className="space-y-2 mb-6 lg:mb-0">
                    {POINT_KEYS.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-sm text-primary">
                        <Check size={16} className="text-positive mt-0.5 shrink-0" />
                        <span>{t(`landing:story.steps.${step.key}.points.${point}`)}</span>
                      </li>
                    ))}
                  </ul>
                  {/* Small screens: the screenshot sits with its explanation */}
                  <div className="lg:hidden">
                    <BrowserFrame address={t('landing:story.addressBar')}>
                      <div style={{ aspectRatio: `${SCREENSHOT_WIDTH} / ${SCREENSHOT_HEIGHT}` }}>
                        <Screenshot shot={step.shot} alt={t(`landing:story.steps.${step.key}.alt`)} />
                      </div>
                    </BrowserFrame>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Pinned app frame (desktop) */}
          <div className="hidden lg:block">
            <div className="sticky top-24 flex gap-5 items-center">
              <BrowserFrame address={t('landing:story.addressBar')} className="flex-1">
                <div className="relative bg-canvas" style={{ aspectRatio: `${SCREENSHOT_WIDTH} / ${SCREENSHOT_HEIGHT}` }}>
                  <AnimatePresence initial={false} mode="popLayout">
                    <m.div
                      key={current.shot}
                      className="absolute inset-0"
                      initial={{ opacity: 0, y: 16, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -16 }}
                      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <Screenshot shot={current.shot} alt={t(`landing:story.steps.${current.key}.alt`)} eager={active === 0} />
                    </m.div>
                  </AnimatePresence>
                </div>
              </BrowserFrame>

              {/* Step dots + progress rail */}
              <nav aria-label={t('landing:story.stepNavLabel')} className="relative flex flex-col gap-3">
                <span className="absolute left-1/2 -translate-x-1/2 top-1 bottom-1 w-px bg-subtle" aria-hidden="true" />
                <m.span
                  aria-hidden="true"
                  className="absolute left-1/2 -translate-x-1/2 top-1 w-px bg-brand origin-top"
                  animate={{ height: `${(active / (STORY_STEPS.length - 1)) * 100}%` }}
                  transition={{ duration: 0.4 }}
                />
                {STORY_STEPS.map((step, index) => (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => goTo(index)}
                    aria-label={label(step.key)}
                    aria-current={index === active ? 'step' : undefined}
                    className={`relative w-3 h-3 rounded-full border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      index <= active ? 'bg-brand border-brand' : 'bg-card border-strong'
                    }`}
                  />
                ))}
              </nav>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
