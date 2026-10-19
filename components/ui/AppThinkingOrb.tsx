import React, { useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { Loader2 } from 'lucide-react';

export type ThinkingOrbState =
  | 'working'
  | 'searching'
  | 'solving'
  | 'listening'
  | 'connecting'
  | 'weaving'
  | 'composing'
  | 'breathing'
  | 'shaping';

export interface AppThinkingOrbProps {
  state?: ThinkingOrbState;
  size?: 20 | 64;
  theme?: 'auto' | 'dark' | 'light';
  speed?: number;
  paused?: boolean;
  className?: string;
  label?: string;
  'aria-label'?: string;
}

/**
 * Robust wrapper around thinking-orbs for GlassFolio.
 * Handles auto theme alignment, accessibility labels and graceful degradation
 * in test or headless environments.
 */
export const AppThinkingOrb: React.FC<AppThinkingOrbProps> = ({
  state = 'working',
  size = 20,
  theme = 'auto',
  speed = 1,
  paused = false,
  className = '',
  label,
  'aria-label': ariaLabelProp,
}) => {
  const [hasError, setHasError] = useState(false);
  const effectiveAriaLabel = ariaLabelProp || label || `Agent state: ${state}`;

  if (hasError) {
    return (
      <span
        role="img"
        aria-label={effectiveAriaLabel}
        className={`inline-flex items-center justify-center shrink-0 ${className}`}
      >
        <Loader2
          size={size === 64 ? 32 : 16}
          className="animate-spin text-primary shrink-0"
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}
      data-testid="app-thinking-orb"
      data-state={state}
      data-size={size}
    >
      <ThinkingOrb
        state={state as any}
        size={size as any}
        theme={theme as any}
        speed={speed}
        paused={paused}
        aria-label={effectiveAriaLabel}
        onError={() => setHasError(true)}
      />
    </span>
  );
};

export default AppThinkingOrb;
