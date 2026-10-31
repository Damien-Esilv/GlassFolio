import React from 'react';
import { formatCurrency } from '../utils/currency';
import { ANIMATION_DURATION_MS } from '../constants/animations';
import { useCountUp } from '../hooks/useCountUp';
import StableNumber from './ui/StableNumber';

interface AnimatedCounterProps {
  value: number;
  currency?: string;
  locale?: string;
  options?: Intl.NumberFormatOptions;
  duration?: number;
  className?: string;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  currency = 'USD',
  locale = 'en-US',
  options = {},
  duration = ANIMATION_DURATION_MS,
  className = ''
}) => {
  const displayValue = useCountUp(value, duration);

  return (
    <span className={className}>
      <StableNumber
        display={formatCurrency(displayValue, currency, locale, options)}
        final={formatCurrency(value, currency, locale, options)}
      />
    </span>
  );
};

export default AnimatedCounter;
