import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getTrendTokens } from '../../constants/themeTokens';
import { formatCurrency } from '../../utils/currency';

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
}) => {
  const tokens = getTrendTokens(value);

  let formattedValue = '';
  if (format === 'currency') {
    const absFormatted = formatCurrency(Math.abs(value), currency, locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    if (value > 0) {
      formattedValue = showPlusSign ? `+${absFormatted}` : absFormatted;
    } else if (value < 0) {
      formattedValue = `-${absFormatted}`;
    } else {
      formattedValue = absFormatted;
    }
  } else if (format === 'percent') {
    const fixed = Math.abs(value).toFixed(decimals);
    if (value > 0) {
      formattedValue = showPlusSign ? `+${fixed}%` : `${fixed}%`;
    } else if (value < 0) {
      formattedValue = `-${fixed}%`;
    } else {
      formattedValue = `${fixed}%`;
    }
  } else {
    const fixed = Math.abs(value).toFixed(decimals);
    if (value > 0) {
      formattedValue = showPlusSign ? `+${fixed}` : fixed;
    } else if (value < 0) {
      formattedValue = `-${fixed}`;
    } else {
      formattedValue = fixed;
    }
  }

  const IconComponent = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;

  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${tokens.text} ${className}`}>
      {showIcon && <IconComponent size={iconSize} className="shrink-0" />}
      <span>{formattedValue}</span>
    </span>
  );
};

export default TrendValue;
