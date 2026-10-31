import { useEffect, useRef, useState } from 'react';

/**
 * Follows `value` freely until `active` turns on (the chart shows up), then keeps what it showed for
 * `holdMs` and applies the latest value afterwards. Data that is refreshed while a chart is still
 * drawing itself (prices, a context reload) would make Recharts jump the animation to its end; held
 * back until the animation is over, the chart draws once, then settles on the newest figures.
 */
export function useSettledValue<T>(value: T, active: boolean, holdMs: number): T {
    const [shown, setShown] = useState<T>(value);
    const activeAt = useRef<number | null>(null);

    useEffect(() => {
        if (!active) {
            activeAt.current = null;
            setShown(value);
            return;
        }
        if (activeAt.current === null) activeAt.current = Date.now();
        const remaining = activeAt.current + holdMs - Date.now();
        if (remaining <= 0) {
            setShown(value);
            return;
        }
        const timer = setTimeout(() => setShown(value), remaining);
        return () => clearTimeout(timer);
    }, [value, active, holdMs]);

    return shown;
}
