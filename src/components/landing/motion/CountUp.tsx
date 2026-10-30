import React, { useEffect, useMemo, useRef } from 'react';
import { animate, m, useInView, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { ANIMATION_DURATION_S } from '../../../constants/animations';

interface CountUpProps {
  value: number;
  locale: string;
  className?: string;
  durationS?: number;
  inView?: boolean;
}

/**
 * Renders the final figure immediately (no layout shift, readable without timers or under
 * reduced motion), then counts up from zero the first time it scrolls into view.
 */
export const CountUp: React.FC<CountUpProps> = ({
  value,
  locale,
  className,
  durationS = ANIMATION_DURATION_S,
  inView,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const localInView = useInView(ref, { once: true, amount: 0.6 });
  const activeInView = inView !== undefined ? inView : localInView;

  const prefersReducedMotion = useReducedMotion();
  const formatter = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale]);
  const count = useMotionValue(value);
  const display = useTransform(count, (latest) => formatter.format(Math.round(latest)));

  useEffect(() => {
    if (!activeInView || prefersReducedMotion) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, {
      from: 0,
      duration: durationS,
      ease: [0.25, 0.1, 0.25, 1.0],
    });
    return () => controls.stop();
  }, [activeInView, prefersReducedMotion, value, durationS, count]);

  return (
    <m.span ref={ref} className={className}>
      {display}
    </m.span>
  );
};
