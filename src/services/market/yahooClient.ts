/**
 * Yahoo Finance requests from the browser (TGLA-235).
 *
 * Yahoo sends no CORS header, so a direct call from the hosted app always fails. Local builds use
 * the same-origin `/yf` proxy; the hosted app goes through the connector relay, which allowlists the
 * chart and search paths and requires the user's session. Without a session (or if the relay is
 * down) the hosted app still tries the direct call, as before.
 */
import { usesYahooProxy, yahooFinanceUrl } from '../../config/marketData';
import { relayFetch } from '../connectors/relayClient';
import { ConnectorError } from '../connectors/types';

/**
 * After a 429 ("Too Many Requests"), Yahoo is left alone for a while (TGLA-242): every refresh used to ask
 * for every ticker again, which kept the limit going. Prices, exchange rates and asset lookups share it.
 */
export const YAHOO_RATE_LIMIT_PAUSE_MS = 10 * 60 * 1000;
let pausedUntil = 0;

/** End of the current pause (epoch ms), or 0 when Yahoo may be asked. */
export const yahooPausedUntil = (): number => (pausedUntil > Date.now() ? pausedUntil : 0);

/** Lifts the pause (the user asked for a refresh). */
export const resetYahooPause = (): void => {
    pausedUntil = 0;
};

const notePause = (): void => {
    pausedUntil = Date.now() + YAHOO_RATE_LIMIT_PAUSE_MS;
};

/** `path` like `/v8/finance/chart/CW8.PA` (ticker already URI-encoded), `query` without the leading `?`. */
export async function fetchYahoo(path: string, query: string, timeoutMs: number): Promise<Response | null> {
    if (yahooPausedUntil()) return null;
    const direct = async (): Promise<Response | null> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(`${yahooFinanceUrl(path)}?${query}`, {
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            }).catch(() => null);
            if (response?.status === 429) notePause();
            return response;
        } finally {
            clearTimeout(timer);
        }
    };

    if (usesYahooProxy()) return direct();
    try {
        return await relayFetch({ provider: 'yahoo', method: 'GET', path, query });
    } catch (error) {
        if (error instanceof ConnectorError && error.code === 'rate_limited') notePause();
        // Yahoo's own refusal (unknown ticker…) is final; only a missing session or relay falls back
        return error instanceof ConnectorError && error.code === 'relay_unavailable' ? direct() : null;
    }
}
