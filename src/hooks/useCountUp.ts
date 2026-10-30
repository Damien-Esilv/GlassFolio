import { useEffect, useRef, useState } from 'react';
import { ANIMATION_DURATION_MS } from '../constants/animations';

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

const prefersReducedMotion = (): boolean =>
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A number that counts up (or down) to `target` over the common animation duration, starting from 0 on
 * the first render and from what is shown when the target changes. With reduced motion it is simply the target.
 */
export function useCountUp(target: number, duration: number = ANIMATION_DURATION_MS): number {
    const [value, setValue] = useState<number>(() => (prefersReducedMotion() ? target : 0));
    const shownRef = useRef(value);
    const frameRef = useRef<number | null>(null);

    useEffect(() => {
        if (prefersReducedMotion() || duration <= 0) {
            shownRef.current = target;
            setValue(target);
            return;
        }
        const from = shownRef.current;
        if (from === target) return;

        const start = performance.now();
        const step = (now: number): void => {
            const progress = Math.min((now - start) / duration, 1);
            const next = progress >= 1 ? target : from + (target - from) * easeOutCubic(progress);
            shownRef.current = next;
            setValue(next);
            if (progress < 1) frameRef.current = requestAnimationFrame(step);
        };
        frameRef.current = requestAnimationFrame(step);

        return () => {
            if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        };
    }, [target, duration]);

    return value;
}
