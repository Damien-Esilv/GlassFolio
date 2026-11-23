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

/** `path` like `/v8/finance/chart/CW8.PA` (ticker already URI-encoded), `query` without the leading `?`. */
export async function fetchYahoo(path: string, query: string, timeoutMs: number): Promise<Response | null> {
    const direct = (): Promise<Response | null> =>
        fetch(`${yahooFinanceUrl(path)}?${query}`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(timeoutMs),
        }).catch(() => null);

    if (usesYahooProxy()) return direct();
    try {
        return await relayFetch({ provider: 'yahoo', method: 'GET', path, query });
    } catch (error) {
        // Yahoo's own refusal (unknown ticker…) is final; only a missing session or relay falls back
        return error instanceof ConnectorError && error.code === 'relay_unavailable' ? direct() : null;
    }
}
