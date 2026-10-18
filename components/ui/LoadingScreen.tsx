import React from 'react';
import { Hexagon, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

      {/* Spinner & Label */}
      <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-secondary">
        <Loader2 size={16} className="animate-spin text-primary shrink-0" />
        <span>{label || t('common:labels.loading')}</span>
      </div>
    </div>
  );
};

export default LoadingScreen;
