import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, TriangleAlert } from 'lucide-react';
import type { AIExecutionMode } from '../../services/ai/types';

interface ExecutionModeSelectorProps {
  mode: AIExecutionMode;
  onChange: (mode: AIExecutionMode) => void;
}

const WARNING_POINTS = ['a', 'b', 'c', 'd', 'e'] as const;

/**
 * The three execution modes of the AI: supervised, read-only and autonomous. Choosing autonomous (no
 * confirmation of any change, for the in-app assistant, a local model and MCP clients alike) first shows what it
 * implies, and applies only after the user confirms.
 */
export const ExecutionModeSelector: React.FC<ExecutionModeSelectorProps> = ({ mode, onChange }) => {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  const select = (next: AIExecutionMode): void => {
    if (next === 'autonomous' && mode !== 'autonomous') {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onChange(next);
  };

  const cards: Array<{ id: AIExecutionMode; label: string; description: string }> = [
    { id: 'supervised', label: t('ai:settings.security.supervised'), description: t('ai:settings.security.supervisedDesc') },
    { id: 'read_only', label: t('ai:settings.security.readOnly'), description: t('ai:settings.security.readOnlyDesc') },
    { id: 'autonomous', label: t('ai:settings.security.autonomous'), description: t('ai:settings.security.autonomousDesc') },
  ];

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label={t('ai:settings.security.modeLabel')} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((card) => {
          const selected = mode === card.id;
          const risky = card.id === 'autonomous';
          return (
            <button
              key={card.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => select(card.id)}
              className={`p-4 rounded-xl border transition-all text-left space-y-1.5 ${
                selected
                  ? risky ? 'bg-warning/10 border-warning' : 'bg-primary/10 border-primary'
                  : risky ? 'bg-subtle/50 hover:bg-subtle border-warning/40' : 'bg-subtle/50 hover:bg-subtle border-subtle'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-primary">{card.label}</span>
                {selected && <Check size={14} className={risky ? 'text-warning' : 'text-primary'} />}
                {!selected && risky && <TriangleAlert size={14} className="text-warning" aria-hidden="true" />}
              </div>
              <p className="text-[11px] text-tertiary leading-relaxed">{card.description}</p>
            </button>
          );
        })}
      </div>

      {confirming && (
        <div role="alertdialog" aria-labelledby="autonomous-warning-title" className="p-4 rounded-xl border border-warning bg-warning/10 space-y-3">
          <div className="flex items-center gap-2">
            <TriangleAlert size={16} className="text-warning shrink-0" aria-hidden="true" />
            <h4 id="autonomous-warning-title" className="text-sm font-bold text-primary">{t('ai:settings.security.warning.title')}</h4>
          </div>
          <p className="text-xs text-secondary">{t('ai:settings.security.warning.intro')}</p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs text-secondary leading-relaxed">
            {WARNING_POINTS.map((point) => (
              <li key={point}>{t(`ai:settings.security.warning.${point}`)}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                onChange('autonomous');
              }}
              className="px-4 py-2 rounded-xl bg-warning text-black text-xs font-bold transition-opacity hover:opacity-90"
            >
              {t('ai:settings.security.warning.confirm')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-4 py-2 rounded-xl bg-card hover:bg-card-hover text-secondary hover:text-primary border border-subtle text-xs font-bold transition-all"
            >
              {t('ai:settings.security.warning.cancel')}
            </button>
          </div>
        </div>
      )}

      {mode === 'autonomous' && !confirming && (
        <p role="status" className="flex items-start gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded-xl p-3">
          <TriangleAlert size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>{t('ai:settings.security.active')}</span>
        </p>
      )}
    </div>
  );
};
