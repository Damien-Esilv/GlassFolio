import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartPriceMode } from '../../types/domain';

interface ChartModeToggleProps {
    mode: ChartPriceMode;
    onChange: (mode: ChartPriceMode) => void;
}

const MODES: { value: ChartPriceMode; labelKey: string; hintKey: string }[] = [
    { value: 'simulated', labelKey: 'dashboard:chartMode.simulated', hintKey: 'dashboard:chartMode.simulatedHint' },
    { value: 'historical', labelKey: 'dashboard:chartMode.historical', hintKey: 'dashboard:chartMode.historicalHint' }
];

/**
 * Switch the portfolio curve between real historical prices and the estimate.
 */
const ChartModeToggle: React.FC<ChartModeToggleProps> = ({ mode, onChange }) => {
    const { t } = useTranslation();

    return (
        <div role="group" aria-label={t('dashboard:chartMode.label')} className="flex gap-1 p-1 bg-subtle rounded-lg">
            {MODES.map(m => (
                <button
                    key={m.value}
                    type="button"
                    aria-pressed={mode === m.value}
                    title={t(m.hintKey)}
                    onClick={() => onChange(m.value)}
                    className={`px-3 py-1 text-[10px] rounded-md font-bold transition-all ${mode === m.value ? 'bg-card text-primary shadow-sm' : 'text-tertiary hover:text-primary'}`}
                >
                    {t(m.labelKey)}
                </button>
            ))}
        </div>
    );
};

export default ChartModeToggle;
