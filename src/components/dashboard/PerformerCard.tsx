import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Position } from '../../types';
import { currencyService } from '../../services/currencyService';
import { generateHighPrecisionHistory, HistoricalPricePoint } from '../../services/priceService';
import { formatCurrency } from '../../utils/currency';
import { ANIMATION_DURATION_MS, ANIMATION_EASING } from '../../constants/animations';

export interface PerformerCardProps {
  title: string;
  position: Position | null;
  isWorst?: boolean;
  /** null while the history is being read; the card then shows a placeholder, not a draft chart. */
  realHistory: HistoricalPricePoint[] | null;
  timeRange: string;
  currency: string;
  locale: string;
}

const cardStyle = 'rounded-xl bg-card p-6 shadow-lg border border-border';

/**
 * Best / worst performer card with its sparkline. It lives at module level on purpose: declared inside
 * the Dashboard it was a new component type on every render, so React threw it away and rebuilt the
 * chart each time the page re-rendered, and the animation played again.
 */
const PerformerCardBase: React.FC<PerformerCardProps> = ({
  title,
  position,
  isWorst = false,
  realHistory,
  timeRange,
  currency,
  locale,
}) => {
  const { t } = useTranslation();

  // Primitives, not the position object: a refresh that hands back an equal position must not
  // rebuild the series, because a new array makes the chart animate again.
  const symbol = position?.symbol;
  const lastPrice = position?.lastPrice ?? 0;
  const avgCost = position?.avgCost ?? 0;
  const plPercent = position?.unrealizedPLPercent || 0;

  // Synthetic fallback only once the fetch finished with nothing, never while it is still running.
  const sparklineData = useMemo(() => {
    if (!symbol || realHistory === null) return [];
    if (realHistory.length >= 2) {
      return realHistory.map((pt) => ({ val: pt.price }));
    }
    const plRatio = plPercent / 100;
    const estimatedStart = plRatio !== -1
      ? lastPrice / (1 + plRatio)
      : (avgCost > 0 ? avgCost : lastPrice * 0.9);
    const count = timeRange === '1D' ? 24 : timeRange === '1W' ? 42 : timeRange === '1M' ? 30 : timeRange === '3M' ? 90 : timeRange === 'ALL' ? 300 : 252;
    return generateHighPrecisionHistory(symbol, estimatedStart, lastPrice, count).map((pt) => ({ val: pt.price }));
  }, [realHistory, symbol, lastPrice, avgCost, plPercent, timeRange]);

  if (!position) {
    return (
      <div className={`${cardStyle} flex flex-col justify-between h-full`}>
        <h3 className="text-secondary text-sm font-medium">{title}</h3>
        <p className="text-tertiary text-xs my-auto text-center">{t('dashboard:noPositionsYet')}</p>
      </div>
    );
  }

  const isPositive = position.unrealizedPLPercent >= 0;

  // Best performer: green if positive, red if negative. Worst performer: red if negative, orange if positive.
  let badgeBg = 'bg-positive-subtle text-positive';
  let strokeColor = 'var(--color-positive)';
  const gradientId = `sparkGradient-${position.id}-${isWorst ? 'worst' : 'best'}`;

  if (isWorst) {
    if (isPositive) {
      badgeBg = 'bg-warning-subtle text-warning';
      strokeColor = 'var(--color-warning)';
    } else {
      badgeBg = 'bg-negative-subtle text-negative';
      strokeColor = 'var(--color-negative)';
    }
  } else if (!isPositive) {
    badgeBg = 'bg-negative-subtle text-negative';
    strokeColor = 'var(--color-negative)';
  }

  const TrendIcon = isPositive ? TrendingUp : TrendingDown;
  const convertedMarketValue = currencyService.convertAmount(position.marketValue, position.currency || 'EUR', currency);
  const convertedUnrealizedPL = currencyService.convertAmount(position.unrealizedPL, position.currency || 'EUR', currency);

  return (
    <div className={`${cardStyle} flex flex-col justify-between h-full relative overflow-hidden`}>
      <div className="flex justify-between items-start z-10">
        <div>
          <span className="text-tertiary text-[10px] font-bold uppercase tracking-wider">{title}</span>
          <h4 className="text-lg font-bold text-primary mt-0.5">{position.symbol}</h4>
          <p className="text-tertiary text-xs truncate max-w-[140px]">{position.instrument}</p>
        </div>
        <div className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md ${badgeBg}`}>
          <TrendIcon size={14} />
          <span>{isPositive ? '+' : ''}{position.unrealizedPLPercent.toFixed(2)}%</span>
        </div>
      </div>

      <div className="mt-3 z-10 flex justify-between items-baseline">
        <span className="text-xl font-bold text-primary">{formatCurrency(convertedMarketValue, currency, locale)}</span>
        <span className={`text-xs font-semibold ${isPositive ? (isWorst ? 'text-warning' : 'text-positive') : 'text-negative'}`}>
          {isPositive ? '+' : ''}{formatCurrency(convertedUnrealizedPL, currency, locale)}
        </span>
      </div>

      {/* Mini sparkline, stretched edge to edge below the card padding */}
      <div className="h-20 -mx-6 -mb-6 mt-4 overflow-hidden rounded-b-xl z-0">
        {sparklineData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart key={`${position.symbol}-${timeRange}`} data={sparklineData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="val"
                stroke={strokeColor}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#${gradientId})`}
                isAnimationActive={true}
                animationDuration={ANIMATION_DURATION_MS}
                animationEasing={ANIMATION_EASING}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full bg-subtle/10 animate-pulse" />
        )}
      </div>
    </div>
  );
};

export const PerformerCard = React.memo(PerformerCardBase);
export default PerformerCard;
