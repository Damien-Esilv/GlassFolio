import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartPriceMode } from '../../types/domain';

interface ChartModeToggleProps {
    mode: ChartPriceMode;
    onChange: (mode: ChartPriceMode) => void;
    size?: 'sm' | 'md';
}

const MODES: { value: ChartPriceMode; labelKey: string; hintKey: string }[] = [
    { value: 'simulated', labelKey: 'dashboard:chartMode.simulated', hintKey: 'dashboard:chartMode.simulatedHint' },
    { value: 'historical', labelKey: 'dashboard:chartMode.historical', hintKey: 'dashboard:chartMode.historicalHint' }
];

/**
 * Switch the portfolio curve between real historical prices and the estimate.
 */
const ChartModeToggle: React.FC<ChartModeToggleProps> = ({ mode, onChange, size = 'sm' }) => {
    const { t } = useTranslation();
    const isMd = size === 'md';

    return (
        <div 
            role="group" 
            aria-label={t('dashboard:chartMode.label')} 
            className={`flex items-center gap-1 bg-subtle p-1 border border-subtle ${isMd ? 'rounded-xl' : 'rounded-lg'}`}
        >
            {MODES.map(m => (
                <button
                    key={m.value}
                    type="button"
                    aria-pressed={mode === m.value}
                    title={t(m.hintKey)}
                    onClick={() => onChange(m.value)}
                    className={`${
                        isMd ? 'px-3.5 py-1.5 text-xs rounded-lg font-semibold' : 'px-3 py-1 text-[10px] rounded-md font-bold'
                    } transition-all ${
                        mode === m.value 
                            ? 'bg-card text-primary shadow-sm border border-subtle font-bold' 
                            : 'text-secondary hover:text-primary'
                    }`}
                >
                    {t(m.labelKey)}
                </button>
            ))}
        </div>
    );
};

export default ChartModeToggle;
