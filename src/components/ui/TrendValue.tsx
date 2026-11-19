import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getTrendTokens } from '../../constants/themeTokens';
import { formatCurrency } from '../../utils/currency';
import { useCountUp } from '../../hooks/useCountUp';
import { ANIMATION_DURATION_MS } from '../../constants/animations';
import StableNumber from './StableNumber';

export interface TrendValueProps {
  value: number;
  format?: 'currency' | 'percent' | 'number';
  currency?: string;
  locale?: string;
  showIcon?: boolean;
  showPlusSign?: boolean;
  decimals?: number;
  className?: string;
  iconSize?: number;
  animated?: boolean;
  duration?: number;
}

export const TrendValue: React.FC<TrendValueProps> = ({
  value,
  format = 'currency',
  currency = 'EUR',
  locale = 'en-US',
  showIcon = false,
  showPlusSign = true,
  decimals = 2,
  className = '',
  iconSize = 16,
  animated = false,
  duration = ANIMATION_DURATION_MS,
}) => {
  const tokens = getTrendTokens(value);
  const animatedValue = useCountUp(value, animated ? duration : 0);
  const countValue = animated ? animatedValue : value;

  const formatText = (val: number): string => {
    if (format === 'currency') {
      const absFormatted = formatCurrency(Math.abs(val), currency, locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      if (value > 0) {
        return showPlusSign ? `+${absFormatted}` : absFormatted;
      } else if (value < 0) {
        return `-${absFormatted}`;
      }
      return absFormatted;
    }

    if (format === 'percent') {
      const fixed = Math.abs(val).toFixed(decimals);
      if (value > 0) {
        return showPlusSign ? `+${fixed}%` : `${fixed}%`;
      } else if (value < 0) {
        return `-${fixed}%`;
      }
      return `${fixed}%`;
    }

    const fixed = Math.abs(val).toFixed(decimals);
    if (value > 0) {
      return showPlusSign ? `+${fixed}` : fixed;
    } else if (value < 0) {
      return `-${fixed}`;
    }
    return fixed;
  };

  const formattedDisplay = formatText(countValue);
  const formattedFinal = formatText(value);

  const IconComponent = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;

  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold ${tokens.text} ${className}`}
      role={animated ? 'status' : undefined}
      aria-label={animated ? formattedFinal : undefined}
    >
      {showIcon && <IconComponent size={iconSize} className="shrink-0" />}
      <StableNumber display={formattedDisplay} final={formattedFinal} hidden={animated} />
    </span>
  );
};

export default TrendValue;
