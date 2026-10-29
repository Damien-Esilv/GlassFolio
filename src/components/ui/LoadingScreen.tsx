import React from 'react';
import { Hexagon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppThinkingOrb } from './AppThinkingOrb';

interface LoadingScreenProps {
  label?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ label }) => {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen w-full flex flex-col items-center justify-center bg-canvas text-primary p-6 transition-colors"
    >
      {/* Brand Icon with Subtle Pulse */}
      <div className="relative flex items-center justify-center mb-5">
        <div className="w-12 h-12 bg-brand-static rounded-xl flex items-center justify-center transform rotate-45 shadow-lg shadow-brand/20 animate-pulse">
          <div className="transform -rotate-45 text-white font-bold text-xl">
            <Hexagon size={24} fill="currentColor" />
          </div>
        </div>
      </div>

      {/* Thinking Orb Grand Format */}
      <div className="flex flex-col items-center gap-4 mb-2">
        <AppThinkingOrb state="searching" size={72} label={label || t('common:labels.loading')} />
        <span className="text-xs sm:text-sm font-semibold text-secondary tracking-wide">
          {label || t('common:labels.loading')}
        </span>
      </div>
    </div>
  );
};


export default LoadingScreen;
