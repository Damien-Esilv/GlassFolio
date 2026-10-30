import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getTrendTokens } from '../../constants/themeTokens';
import { useCountUp } from '../../hooks/useCountUp';
import { ANIMATION_DURATION_MS } from '../../constants/animations';

export interface TrendBadgeProps {
  value: number;
  isPercent?: boolean;
  showIcon?: boolean;
  showPlusSign?: boolean;
  decimals?: number;
  className?: string;
  size?: 'sm' | 'md';
  animated?: boolean;
  duration?: number;
}

export const TrendBadge: React.FC<TrendBadgeProps> = ({
  value,
  isPercent = true,
  showIcon = false,
  showPlusSign = true,
  decimals = 2,
  className = '',
  size = 'sm',
  animated = false,
  duration = ANIMATION_DURATION_MS,
}) => {
  const tokens = getTrendTokens(value);
  const animatedValue = useCountUp(value, animated ? duration : 0);
  const countValue = animated ? animatedValue : value;

  const formatText = (val: number): string => {
    const fixed = Math.abs(val).toFixed(decimals);
    let label = '';
    if (value > 0) {
      label = showPlusSign ? `+${fixed}` : fixed;
    } else if (value < 0) {
      label = `-${fixed}`;
    } else {
      label = fixed;
    }
    return isPercent ? `${label}%` : label;
  };

  const labelDisplay = formatText(countValue);
  const labelFinal = formatText(value);

  const IconComponent = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';
  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-md ${tokens.bgSubtle} ${tokens.text} ${paddingClass} ${className}`}
      aria-label={animated ? labelFinal : undefined}
    >
      {showIcon && <IconComponent size={iconSize} className="shrink-0" />}
      <span aria-hidden={animated ? 'true' : undefined}>{labelDisplay}</span>
    </span>
  );
};

export default TrendBadge;
