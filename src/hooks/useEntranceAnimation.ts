import { useEffect, useState } from 'react';
import { ENTRANCE_DELAY_MS } from '../constants/animations';

/**
 * True shortly after a screen shows, so its cards and bars can animate in (see `Reveal`).
 * It starts again whenever `resetKey` changes (another tab, another filter): the first render with a new key
 * is already "not entered", so content that mounts with the key never flashes in before animating.
 */
export function useEntranceAnimation(resetKey: unknown = 'entrance', delayMs: number = ENTRANCE_DELAY_MS): boolean {
    const [entered, setEntered] = useState<unknown>(null);

    useEffect(() => {
        const timer = setTimeout(() => setEntered(resetKey), delayMs);
        return () => clearTimeout(timer);
    }, [resetKey, delayMs]);

    return Object.is(entered, resetKey);
}
