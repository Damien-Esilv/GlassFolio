import { useEffect, useRef, useState } from 'react';
import type { Position } from '../types';
import { fetchRealPriceHistory, getCachedRealPriceHistory, HistoricalPricePoint } from '../services/priceService';

interface HistoryState {
    key: string;
    data: HistoricalPricePoint[] | null;
}

const sameSeries = (a: HistoricalPricePoint[], b: HistoricalPricePoint[]): boolean =>
    a.length === b.length && a.every((point, i) => point.timestamp === b[i].timestamp && point.price === b[i].price);

/**
 * Price history of one position for a time range: `null` while it is being read, `[]` when there is none.
 * It is keyed on the position id, symbol and range, not on the position object, so a refresh that hands
 * back an equal position does not fetch again, and a fetch that returns the series already shown keeps
 * the same array: a chart fed with it is not redrawn, so it plays its animation once.
 */
export function usePerformerHistory(position: Position | null, timeRange: string): HistoricalPricePoint[] | null {
    const key = position ? `${position.id}|${position.symbol}|${timeRange}` : '';
    const positionRef = useRef(position);
    positionRef.current = position;

    const [state, setState] = useState<HistoryState>(() => ({
        key,
        data: position ? getCachedRealPriceHistory(position, timeRange) : [],
    }));

    useEffect(() => {
        const current = positionRef.current;
        if (!current) {
            setState((prev) => (prev.key === key && prev.data ? prev : { key, data: [] }));
            return;
        }
        let subscribed = true;
        const keep = (prev: HistoryState, data: HistoricalPricePoint[]): HistoryState =>
            prev.key === key && prev.data && sameSeries(prev.data, data) ? prev : { key, data };

        const cached = getCachedRealPriceHistory(current, timeRange);
        setState((prev) => (cached ? keep(prev, cached) : prev.key === key ? prev : { key, data: null }));
        fetchRealPriceHistory(current, timeRange)
            .then((data) => { if (subscribed) setState((prev) => keep(prev, data)); })
            .catch(() => { if (subscribed) setState((prev) => keep(prev, [])); });
        return () => { subscribed = false; };
    }, [key, timeRange]);

    return state.key === key ? state.data : null;
}
