/**
 * Browser side of the connector relay (TGLA-221).
 *
 * Same call in every deployment: `POST /api/connector-relay` on this very origin (`'self'` in the
 * CSP). The Docker / dev server checks the private local header; the hosted app checks the relay
 * header and the Supabase session token, sent only to this origin.
 */
import { getDeploymentMode } from '../../config/deployment';
import { authService } from '../security/authService';
import { ConnectorError, errorCodeForStatus } from './types';

export const CONNECTOR_RELAY_URL = '/api/connector-relay';
const RELAY_TIMEOUT_MS = 15_000;

export type RelayProvider = 'snaptrade' | 'openfigi' | 'solana' | 'yahoo';

export interface RelayRequest {
    provider: RelayProvider;
    method: 'GET' | 'POST';
    path: string;
    /** Raw query string, exactly as signed (no leading `?`). */
    query?: string;
    headers?: Record<string, string>;
    body?: unknown;
}

const sessionToken = async (): Promise<string | undefined> => {
    const provider = authService as { getActiveAccessToken?: () => Promise<string | undefined> };
    return provider.getActiveAccessToken ? provider.getActiveAccessToken() : undefined;
};

/** Sends an allowlisted request through the relay. Throws `ConnectorError` on any failure. */
export async function relayFetch(request: RelayRequest): Promise<Response> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-GlassFolio-Local': '1',
        'X-GlassFolio-Relay': '1',
    };
    if (getDeploymentMode() === 'cloud') {
        const token = await sessionToken();
        if (!token) throw new ConnectorError('relay_unavailable', 'No session for the hosted relay');
        headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
        response = await fetch(CONNECTOR_RELAY_URL, {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            body: JSON.stringify(request),
            signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
        });
    } catch {
        throw new ConnectorError('relay_unavailable');
    }
    if (!response.ok) throw new ConnectorError(errorCodeForStatus(response.status), `Relay answered ${response.status}`);
    return response;
}

/** Relay call whose answer is JSON. */
export async function relayJson(request: RelayRequest): Promise<unknown> {
    const response = await relayFetch(request);
    try {
        return await response.json();
    } catch {
        throw new ConnectorError('invalid_response');
    }
}
