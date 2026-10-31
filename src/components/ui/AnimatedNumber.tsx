import React from 'react';
import { useCountUp } from '../../hooks/useCountUp';
import StableNumber from './StableNumber';

interface AnimatedNumberProps {
    value: number;
    locale?: string;
    options?: Intl.NumberFormatOptions;
    /** Defaults to the common animation duration. */
    duration?: number;
    className?: string;
    prefix?: string;
    suffix?: string;
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
    prefix = '',
    suffix = '',
}) => {
    const shown = useCountUp(value, duration);
    const format = (n: number): string => `${prefix}${new Intl.NumberFormat(locale, options).format(n)}${suffix}`;

    return (
        <span className={className} aria-label={format(value)}>
            <StableNumber display={format(shown)} final={format(value)} hidden />
        </span>
    );
};

export default AnimatedNumber;
