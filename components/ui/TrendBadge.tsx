import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getTrendTokens } from '../../src/constants/themeTokens';

export interface TrendBadgeProps {
  value: number;
  isPercent?: boolean;
  showIcon?: boolean;
  showPlusSign?: boolean;
  decimals?: number;
  className?: string;
  size?: 'sm' | 'md';
}

export const TrendBadge: React.FC<TrendBadgeProps> = ({
  value,
  isPercent = true,
  showIcon = false,
  showPlusSign = true,
  decimals = 2,
  className = '',
  size = 'sm',
}) => {
  const tokens = getTrendTokens(value);
  const fixed = Math.abs(value).toFixed(decimals);

  let label = '';
  if (value > 0) {
    label = showPlusSign ? `+${fixed}` : fixed;
  } else if (value < 0) {
    label = `-${fixed}`;
  } else {
    label = fixed;
  }

  if (isPercent) {
    label = `${label}%`;
  }

  const IconComponent = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';
  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-md ${tokens.bgSubtle} ${tokens.text} ${paddingClass} ${className}`}
    >
      {showIcon && <IconComponent size={iconSize} className="shrink-0" />}
      <span>{label}</span>
    </span>
  );
};

export default TrendBadge;
