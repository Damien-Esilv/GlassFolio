/**
 * Key figures of the cash flow pages, counting up when they appear or change (the common animation duration,
 * nothing with reduced motion). Money in the user's currency and language, never "-0 €".
 */
import React from 'react';
import AnimatedCounter from '../AnimatedCounter';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import type { CashflowLabels } from './useCashflowLabels';

export const CountUpMoney: React.FC<{ value: number; labels: CashflowLabels; decimals?: number; className?: string }> = ({ value, labels, decimals = 0, className = '' }) => {
    const shown = Math.abs(value) < 0.5 * 10 ** -decimals ? 0 : value;
    return (
        <AnimatedCounter
            value={shown}
            currency={labels.currency}
            locale={labels.locale}
            options={{ minimumFractionDigits: decimals, maximumFractionDigits: decimals }}
            className={className}
        />
    );
};

export const CountUpNumber: React.FC<{ value: number; labels: CashflowLabels; className?: string }> = ({ value, labels, className = '' }) => (
    <AnimatedNumber value={value} locale={labels.locale} className={className} />
);

/** A ratio (0.354) shown as a percentage (35.4 %). */
export const CountUpPercent: React.FC<{ ratio: number; labels: CashflowLabels; decimals?: number; className?: string }> = ({ ratio, labels, decimals = 0, className = '' }) => (
    <AnimatedNumber
        value={ratio}
        locale={labels.locale}
        options={{ style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals }}
        className={className}
    />
);
