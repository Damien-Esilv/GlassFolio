import { useRef } from 'react';

/**
 * Returns the previous reference while the new value is equal to it (compared as JSON). A chart fed
 * with data that was recomputed to the same content therefore keeps its array and is not redrawn:
 * Recharts jumps an animation to its end when the data array changes mid-way.
 */
export function useStableValue<T>(value: T): T {
    const ref = useRef<{ value: T; json: string | undefined }>({ value, json: undefined });
    let json: string | undefined;
    try {
        json = JSON.stringify(value);
    } catch {
        json = undefined;
    }
    if (json === undefined || json !== ref.current.json) {
        ref.current = { value, json };
    }
    return ref.current.value;
}
