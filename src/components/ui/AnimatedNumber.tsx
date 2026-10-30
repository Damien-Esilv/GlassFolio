import React from 'react';
import { useCountUp } from '../../hooks/useCountUp';

interface AnimatedNumberProps {
    value: number;
    locale?: string;
    options?: Intl.NumberFormatOptions;
    /** Defaults to the common animation duration. */
    duration?: number;
    className?: string;
}

/**
 * A plain number (XP, counts, percentages) that counts up when it appears. Screen readers get the final
 * value at once instead of every step of the count.
 */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
    value,
    locale = 'en-US',
    options = { maximumFractionDigits: 0 },
    duration,
    className = '',
}) => {
    const shown = useCountUp(value, duration);
    const format = (n: number): string => new Intl.NumberFormat(locale, options).format(n);

    return (
        <span className={className} aria-label={format(value)}>
            <span aria-hidden="true">{format(shown)}</span>
        </span>
    );
};

export default AnimatedNumber;
