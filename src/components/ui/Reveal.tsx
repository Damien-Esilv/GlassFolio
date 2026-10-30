import React from 'react';
import {
    ANIMATION_DURATION_MS,
    ANIMATION_EASING,
    ENTRANCE_START_SCALE,
    MAX_STAGGER_STEPS,
    STAGGER_DELAY_MS,
} from '../../constants/animations';

interface RevealProps {
    /** True once the card may appear (see useEntranceAnimation). */
    active: boolean;
    /** Rank among its siblings: cards appear one after the other, STAGGER_DELAY_MS apart. */
    index?: number;
    className?: string;
    children: React.ReactNode;
}

/** A card that fades and grows in, with the common duration, easing and stagger of the app. */
export const Reveal: React.FC<RevealProps> = ({ active, index = 0, className = '', children }) => (
    <div
        className={`transition-all ${className}`}
        style={{
            opacity: active ? 1 : 0,
            transform: active ? 'scale(1)' : `scale(${ENTRANCE_START_SCALE})`,
            transitionDuration: `${ANIMATION_DURATION_MS}ms`,
            transitionTimingFunction: ANIMATION_EASING,
            transitionDelay: `${Math.min(index, MAX_STAGGER_STEPS) * STAGGER_DELAY_MS}ms`,
        }}
    >
        {children}
    </div>
);

export default Reveal;
