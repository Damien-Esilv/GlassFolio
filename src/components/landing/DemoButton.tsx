import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useDemoAccess } from '../../hooks/useDemoAccess';
import { useDemoOffered } from '../../hooks/useDemoOffered';

/**
 * The one-click demo as a framed button: a bold line and, under it, what the demo is.
 * Renders nothing where the demo is not offered (a local install not started for a demo).
 */
export const DemoButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { t } = useTranslation();
  const { launchDemo, isLaunchingDemo, demoError } = useDemoAccess();
  const demoOffered = useDemoOffered();
  if (!demoOffered) return null;

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => launchDemo('/')}
        disabled={isLaunchingDemo}
        className="group relative w-full max-w-md flex items-center gap-4 rounded-2xl border border-brand/50 bg-brand/15 hover:bg-brand/20 px-5 py-4 text-left shadow-lg shadow-brand/10 hover:shadow-brand/25 hover:-translate-y-0.5 transition-all duration-200 motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 cursor-pointer"
      >
        <span className="w-11 h-11 rounded-xl bg-brand/20 text-brand flex items-center justify-center shrink-0">
          <Sparkles size={21} className="motion-safe:animate-pulse transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-base font-bold text-primary">
            {isLaunchingDemo ? t('landing:hero.demoCard.ctaLoading') : t('landing:hero.demoCard.cta')}
          </span>
          <span className="block text-sm text-secondary">{t('landing:hero.demoCard.hint')}</span>
        </span>
        <ArrowRight size={20} className="shrink-0 text-brand transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" />
      </button>
      {/* e.g. this device already holds a real vault: say why nothing happened */}
      {demoError && <p role="alert" className="text-xs text-negative">{demoError}</p>}
    </div>
  );
};
