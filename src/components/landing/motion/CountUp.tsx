import React, { useEffect, useMemo, useRef } from 'react';
import { animate, m, useInView, useMotionValue, useReducedMotion, useTransform } from 'motion/react';

interface CountUpProps {
  value: number;
  locale: string;
  className?: string;
  durationS?: number;
}

/**
 * Renders the final figure immediately (no layout shift, readable without timers or under
 * reduced motion), then counts up from zero the first time it scrolls into view.
 */
export const CountUp: React.FC<CountUpProps> = ({ value, locale, className, durationS = 1.4 }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.6 });
  const prefersReducedMotion = useReducedMotion();
  const formatter = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale]);
  const count = useMotionValue(value);
  const display = useTransform(count, (latest) => formatter.format(Math.round(latest)));

  useEffect(() => {
    if (!isInView || prefersReducedMotion) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, { from: 0, duration: durationS, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [isInView, prefersReducedMotion, value, durationS, count]);

  return (
    <m.span ref={ref} className={className}>
      {display}
    </m.span>
  );
};
