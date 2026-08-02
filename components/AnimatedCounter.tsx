import React, { useState, useEffect, useRef } from 'react';
import { formatCurrency } from '../utils/currency';
import { ANIMATION_DURATION_MS, ANIMATION_EASING } from '../src/constants/animations';

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
  const [displayValue, setDisplayValue] = useState(0);
  const prevValueRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const startValue = prevValueRef.current;
    const targetValue = value;
    const startTime = performance.now();

    if (startValue === targetValue) {
      setDisplayValue(targetValue);
      return;
    }

    const easeOutCubic = (t: number): number => {
      return 1 - Math.pow(1 - t, 3);
    };

    const updateCounter = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      const currentValue = startValue + (targetValue - startValue) * easedProgress;

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(updateCounter);
      } else {
        setDisplayValue(targetValue);
        prevValueRef.current = targetValue;
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateCounter);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, duration]);

  return (
    <span className={className}>
      {formatCurrency(displayValue, currency, locale, options)}
    </span>
  );
};

export default AnimatedCounter;
