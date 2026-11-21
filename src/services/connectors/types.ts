/**
 * Contract shared by every sync source adapter (TGLA-221).
 * An adapter only fetches and normalizes; the sync engine owns dedup, instruments and commits.
 */
import type {
    ConnectionErrorCode,
    ConnectionPublicParams,
    ExternalAccount,
    NormalizedActivity,
    NormalizedHolding,
    SourceId,
    SourceTransport,
} from '../../types/connections';

export interface AdapterContext {
    connectionId: string;
    /** Decrypted credentials of the connection, held in memory for the duration of the call. */
    credentials: Record<string, string>;
    publicParams: ConnectionPublicParams;
}

export interface SourceAdapter {
    id: SourceId;
    transport: SourceTransport;
    capabilities: {
        holdings: boolean;
        history: boolean;
    };
    /** Names of the credential fields the adapter needs (translated under `settings:connections.fields.<name>`). */
    credentialFields: string[];
    /**
     * Assets this source manages. A holdings snapshot only closes these, so several sources (a BTC and an
     * ETH wallet on one Ledger account) or CSV imports can share an account. Absent: every asset.
     */
    ownsAsset?(symbol?: string, isin?: string): boolean;
    /** Validates credentials or addresses and returns the accounts the user can map. */
    listExternalAccounts(ctx: AdapterContext): Promise<ExternalAccount[]>;
    fetchHoldings(ctx: AdapterContext, externalAccountId: string): Promise<NormalizedHolding[]>;
    /** Activities on or after `since` (ISO date) when given, oldest first. */
    fetchActivities?(ctx: AdapterContext, externalAccountId: string, since?: string): Promise<NormalizedActivity[]>;
}

/** Failure an adapter can explain. Its message is for logs only; the UI shows `code`. */
export class ConnectorError extends Error {
    readonly code: ConnectionErrorCode;

    constructor(code: ConnectionErrorCode, message?: string) {
        super(message ?? code);
        this.name = 'ConnectorError';
        this.code = code;
    }
}

/** Maps an HTTP status from a provider (or the relay) to the error the UI explains. */
export function errorCodeForStatus(status: number): ConnectionErrorCode {
    if (status === 401 || status === 403) return 'auth_failed';
    if (status === 429) return 'rate_limited';
    if (status === 502 || status === 503 || status === 504) return 'relay_unavailable';
    return 'invalid_response';
}
