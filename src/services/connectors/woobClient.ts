/**
 * Browser side of the French bank sync (TGLA-236): `/api/woob/*` on this very origin, served by the
 * local server (desktop app, Docker, `npm run dev`) which hands the request to the Woob worker.
 *
 * Bank credentials are read from the vault by the caller and travel to the local server only, in the
 * body of a same-origin request. The online app has no worker: `status()` says so without any call.
 */
import { getDeploymentMode } from '../../config/deployment';
import { ConnectorError } from './types';
import type { ConnectionErrorCode } from '../../types/connections';

const WOOB_BASE = '/api/woob';
/**
 * An app validation waits for the user's phone (the server allows the bank 3 minutes), and a first read of a year
 * of bank operations goes through many pages of the bank's website (5 minutes): a little more than the server.
 */
const REQUEST_TIMEOUT_MS = 320_000;

/** One field of a bank's credential form, described by the bank's Woob module (TGLA-240). */
export interface WoobBankField {
    id: string;
    /** The module's own label (usually French); a few common fields get a translated one. */
    label: string;
    kind: 'text' | 'password' | 'select' | 'date' | 'bool' | 'number';
    required: boolean;
    default: string | null;
    choices: Array<{ value: string; label: string }> | null;
    regexp: string | null;
}

/** A bank the local worker can read: every bank module of the Woob version shipped that loads here. */
export interface WoobBankInfo {
    module: string;
    name: string;
    /** Whether Woob reads its positions (PEA, securities, life insurance) or only balances. */
    positions: boolean;
    /** Whether its module reads the operations of checking and savings accounts (TGLA-254). Absent: an older worker. */
    history?: boolean;
    /** Whether its module reads the coming operations (card payments not booked yet, scheduled transfers). */
    upcoming?: boolean;
    fields: WoobBankField[];
}

/** Where the bank modules come from (TGLA-241): the verified ones (default) or Woob's latest, chosen by the user. */
export interface WoobModuleSource {
    channel: 'verified' | 'latest';
    /** What is loaded now: "latest" only once the latest modules were downloaded and checked. */
    active: 'verified' | 'latest';
    commit?: string | null;
    commitDate?: string | null;
    updatedAt?: string | null;
    /** Bank modules that kept their verified version because the latest one does not load. */
    keptVerified?: string[];
    lastError?: string | null;
    restarting?: boolean;
}

export interface WoobStatus {
    available: boolean;
    worker?: string;
    woob?: string;
    /** Woob commit of the verified modules shipped with GlassFolio, and its date. */
    commit?: string | null;
    commitDate?: string | null;
    banks?: WoobBankInfo[];
    modules?: WoobModuleSource;
}

/** A bank account, as the worker lists it. */
export interface WoobAccount {
    id: string;
    label: string;
    /** GlassFolio account type to create: checking, savings, investment or other. */
    type: 'checking' | 'savings' | 'investment' | 'other';
    /** Tax wrapper of an investment or savings account (PEA, CTO, ASSURANCE_VIE, PER, LIVRET…). */
    wrapper: string | null;
    kind: 'investment' | 'cash';
    currency: string;
    balance: string | null;
}

export type WoobHolding =
    | { kind: 'security'; isin: string | null; code: string | null; symbol: string | null; name: string; quantity: string; avgCost: string | null; unitValue: string | null; currency: string; marketValue: string | null }
    | { kind: 'cash'; name: string; currency: string; quantity: string; marketValue: string }
    | { kind: 'euro_fund'; code: string | null; name: string; currency: string; quantity: string; marketValue: string };

/** One bank operation of a checking or savings account, as the worker reads it (TGLA-254). */
export interface WoobOperation {
    /** The bank's id, else a fingerprint of the day, the amount and the raw label: stable from one read to the next. */
    id: string;
    /** YYYY-MM-DD: the day the operation was made (card payment day), else the booking day. */
    date: string;
    bookingDate: string | null;
    valueDate: string | null;
    /** Signed decimal: negative for money out. */
    amount: string;
    label: string;
    raw: string;
    /** Woob's operation type in lower case: card, transfer, order, check, withdrawal, deferred_card, bank, loan_payment… */
    type: string;
    /** The bank's own category, when it gives one (BoursoBank does). */
    category: string | null;
}

export interface WoobAccountHoldings extends WoobAccount {
    holdings: WoobHolding[];
    warnings: string[];
    /** Checking and savings accounts read with a history: the operations since the day asked for, or null (refused). */
    transactions?: WoobOperation[] | null;
    /** Payments of the account's deferred-debit cards (the account itself only shows their monthly total) */
    cardTransactions?: WoobOperation[];
    coming?: WoobOperation[];
    historyWarnings?: string[];
}

export type WoobLoginResult =
    | { state: 'connected'; accounts: WoobAccount[] }
    | {
        state: 'challenge';
        challengeId: string;
        /** `code`: a code to type (SMS, e-mail); `app`: a validation in the bank's mobile app. */
        kind: 'code' | 'app';
        medium: string | null;
        mediumLabel: string | null;
        message: string;
        /** The image the bank shows for the code (Crédit Mutuel and CIC's Digipass): a PNG, JPEG or GIF data URL. */
        image?: string | null;
    };

/** What the worker needs to open a bank session. Credentials come from the vault. */
export interface WoobSessionRequest {
    /** The connection id: names the saved bank session. */
    key: string;
    module: string;
    credentials: Record<string, string>;
}

/** Worker error code → the code the connection keeps (translated under `settings:connections.errors`). */
const CONNECTION_CODES: Record<string, ConnectionErrorCode> = {
    reauth_required: 'reauth_required',
    auth_failed: 'auth_failed',
    invalid_format: 'auth_failed',
    account_locked: 'auth_failed',
    action_needed: 'action_needed',
    validation_refused: 'action_needed',
    bank_unavailable: 'network',
    bank_timeout: 'network',
    rate_limited: 'rate_limited',
    busy: 'busy',
    companion_unavailable: 'companion_unavailable',
    update_failed: 'network',
};

/** Failure of a bank call: `code` for the connection, `workerCode` for the precise message of the login flow. */
export class WoobError extends ConnectorError {
    readonly workerCode: string;
    readonly detail: string;

    constructor(workerCode: string, detail = '') {
        super(CONNECTION_CODES[workerCode] ?? 'unknown', workerCode);
        this.name = 'WoobError';
        this.workerCode = workerCode;
        this.detail = detail;
    }
}

interface WorkerAnswer<T> {
    ok: boolean;
    result?: T;
    error?: { code?: string; message?: string };
}

const headers = { 'Content-Type': 'application/json', 'X-GlassFolio-Local': '1' };

async function call<T>(route: string, body: unknown): Promise<T> {
    if (getDeploymentMode() !== 'local') throw new WoobError('companion_unavailable');
    let response: Response;
    try {
        response = await fetch(`${WOOB_BASE}/${route}`, {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch {
        throw new WoobError('companion_unavailable');
    }
    let answer: WorkerAnswer<T>;
    try {
        answer = (await response.json()) as WorkerAnswer<T>;
    } catch {
        throw new WoobError(response.ok ? 'unknown' : 'companion_unavailable');
    }
    if (!answer.ok || answer.result === undefined) {
        throw new WoobError(answer.error?.code ?? 'unknown', answer.error?.message ?? '');
    }
    return answer.result;
}

export const woobClient = {
    /** Whether this GlassFolio can reach banks: false online, or when the local worker is missing. */
    async status(): Promise<WoobStatus> {
        if (getDeploymentMode() !== 'local') return { available: false };
        try {
            const response = await fetch(`${WOOB_BASE}/status`, { headers, credentials: 'same-origin', signal: AbortSignal.timeout(20_000) });
            if (!response.ok) return { available: false };
            return (await response.json()) as WoobStatus;
        } catch {
            return { available: false };
        }
    },

    /** Opens a bank session; may come back with a two-factor challenge. Only a click of the user calls it. */
    login(request: WoobSessionRequest): Promise<WoobLoginResult> {
        return call<WoobLoginResult>('login', request);
    },

    /** Answers a challenge: the typed code, or nothing once the user validated in the bank's app. */
    answer(challengeId: string, value?: string): Promise<WoobLoginResult> {
        return call<WoobLoginResult>('login/answer', value === undefined ? { challengeId } : { challengeId, value });
    },

    async accounts(request: WoobSessionRequest): Promise<WoobAccount[]> {
        return (await call<{ accounts: WoobAccount[] }>('accounts', request)).accounts;
    },

    /**
     * Balances and positions of every account; with `history`, also the operations of the checking and savings
     * accounts since `history.since` (YYYY-MM-DD) and their coming ones, in the same bank session (TGLA-254).
     */
    async holdings(request: WoobSessionRequest, history?: { since: string }): Promise<WoobAccountHoldings[]> {
        return (await call<{ accounts: WoobAccountHoldings[] }>('holdings', history ? { ...request, history } : request)).accounts;
    },

    /** Verified modules, or Woob's latest ones (downloads and checks them first). Never offered to the AI. */
    setModules(channel: 'verified' | 'latest'): Promise<WoobModuleSource> {
        return call<WoobModuleSource>('modules/set', { channel });
    },

    /** Downloads Woob's latest bank modules again (only once the user chose them). */
    updateModules(): Promise<WoobModuleSource> {
        return call<WoobModuleSource>('modules/update', {});
    },

    /** Deletes the bank session the worker keeps for a connection. */
    async forget(key: string): Promise<void> {
        await call<{ forgotten: boolean }>('forget', { key }).catch(() => undefined);
    },
};
