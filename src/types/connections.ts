/**
 * Automatic sync sources (TGLA-221).
 *
 * GlassFolio pulls holdings and activities from a small set of aggregated sources instead of one
 * connector per institution: SnapTrade Personal (brokers and major exchanges), public wallets
 * (BTC, EVM, Solana) and French banks through the local Woob worker (TGLA-236). Every source returns the
 * same normalized shapes below, so the sync engine never knows which provider it talks to.
 */
import type { AccountType, InstrumentType, TransactionSubType, TransactionType, WrapperType } from './types.backend';
import type { BankHints } from './cashflow';

/** Source adapters known to the sync engine. */
export type SourceId = 'snaptrade' | 'wallet_btc' | 'wallet_evm' | 'wallet_sol' | 'woob';

/** How a source is reached from the browser. */
export type SourceTransport = 'direct' | 'relay' | 'local_companion';

/**
 * `history` commits the provider's activities (the tax engine needs real trades).
 * `holdings` reconciles the provider's current holdings as a snapshot (wallets, sources without history).
 */
export type ConnectionMode = 'history' | 'holdings';

export type ConnectionStatus =
    | 'never_synced'
    | 'ok'
    | 'error'
    | 'auth_failed'
    | 'rate_limited'
    | 'needs_mapping'
    /** The bank asks for a new two-factor validation: only the user can do it ("Reconnect"). */
    | 'reauth_required';

/**
 * Error codes surfaced to the UI (translated under `connections:errors.<code>`).
 * Never carries provider messages verbatim: they may echo request details.
 */
export type ConnectionErrorCode =
    | 'auth_failed'
    | 'rate_limited'
    | 'network'
    | 'invalid_response'
    | 'relay_unavailable'
    | 'account_missing'
    | 'busy'
    /** Bank (Woob): a new two-factor validation is needed. */
    | 'reauth_required'
    /** Bank (Woob): the bank's website asks the user to do something (accept terms, change a password…). */
    | 'action_needed'
    /** Bank (Woob): the local worker is missing (online app) or stopped. */
    | 'companion_unavailable'
    | 'unknown';

/** An account as the provider exposes it (one SnapTrade connection can hold several). */
export interface ExternalAccount {
    /** Provider-side identifier, stable across syncs. */
    externalId: string;
    /** Display name returned by the provider (e.g. "IBKR — PEA"). */
    name: string;
    /** Institution name when the provider knows it (e.g. "Interactive Brokers"). */
    institutionName?: string;
    /** Base currency of the account (ISO 4217), when known. */
    currency?: string;
    /** GlassFolio account type to create for it, when the provider knows (French banks). */
    accountType?: AccountType;
    /** Tax wrapper to create it with (PEA, CTO, ASSURANCE_VIE, LIVRET…), when known. */
    wrapperType?: WrapperType;
    /** Current balance, shown while choosing where the account goes. */
    balance?: string;
}

/** A current holding, as returned by a source. Decimal values are strings, like the journal. */
export interface NormalizedHolding {
    externalAccountId: string;
    isin?: string;
    symbol?: string;
    name?: string;
    instrumentType?: InstrumentType;
    /** Blockchain network for on-chain assets (bitcoin, ethereum, solana, …). */
    network?: string;
    contractAddress?: string;
    /** CoinGecko coin id, when the source knows it (prices then skip the symbol guess). */
    coingeckoId?: string;
    quantity: string;
    /** Average unit cost in `currency`, when the provider knows it. */
    avgCost?: string;
    currency: string;
}

/** One provider activity (trade, dividend, fee, transfer), already mapped to the journal vocabulary. */
export interface NormalizedActivity {
    externalAccountId: string;
    /** Provider-side identifier, used to skip activities already committed. */
    externalId: string;
    /** ISO 8601 date-time. */
    date: string;
    type: TransactionType;
    subType?: TransactionSubType;
    /** Provider label kept for the audit trail (e.g. "BUY", "DIVIDEND"). */
    rawType: string;
    label?: string;
    /** The provider's raw label, when it also gives a cleaned one (bank operations). */
    rawLabel?: string;
    isin?: string;
    symbol?: string;
    name?: string;
    instrumentType?: InstrumentType;
    network?: string;
    contractAddress?: string;
    coingeckoId?: string;
    quantity?: string;
    price?: string;
    /** Signed cash amount following the CSV convention (negative = money out). */
    amount: string;
    fee?: string;
    feeAsset?: string;
    tax?: string;
    currency: string;
    fxRate?: string;
    /** What the bank says about a checking or savings operation (its category, its operation type), for the cash flow (TGLA-254). */
    bankHints?: BankHints;
}

/** Public, non-secret parameters (wallet addresses, chains). Safe to show in the UI. */
export interface ConnectionPublicParams {
    /** Watch-only wallet addresses or extended public keys (xpub/ypub/zpub). */
    addresses?: string[];
    /** EVM chain ids to scan (Etherscan V2 `chainid`). */
    chainIds?: number[];
    /** Provider display name of each linked external account (shown in the settings). */
    accountNames?: Record<string, string>;
    /** Bank (Woob): the Woob module of the bank (`boursorama`, `fortuneo`…), from src/config/woobBanks.ts. */
    module?: string;
    /** Demo vault only: a fictitious source, shown as connected and never sent to a provider. */
    demo?: boolean;
}

/** Incremental sync state, per external account. */
export interface ConnectionCursor {
    /** ISO date of the most recent activity already committed. */
    lastActivityDate?: string;
    /**
     * Checking or savings account (TGLA-254): first day (YYYY-MM-DD) of the bank operations read so far. Absent until
     * the first full read; the later syncs only read the last 45 days again.
     */
    operationsFrom?: string;
}

export interface Connection {
    id: string;
    ownerId: string;
    sourceId: SourceId;
    label: string;
    /** Provider account id → GlassFolio account id. Unmapped accounts are skipped. */
    accountMap: Record<string, string>;
    /** Secret credentials (e.g. SnapTrade clientId + consumerKey). Encrypted with the vault, never exported. */
    credentials: Record<string, string>;
    publicParams: ConnectionPublicParams;
    mode: ConnectionMode;
    /** Minimum hours between two automatic syncs. */
    syncIntervalHours: number;
    /** Activities older than this ISO date are ignored (avoids duplicating earlier CSV imports). */
    historyStartDate?: string;
    /**
     * Bank (Woob): read the operations of the checking and savings accounts for the cash flow (TGLA-254). On for the
     * bank connections made since; absent (off) for the earlier ones until the user turns it on.
     */
    cashHistory?: boolean;
    cursor: Record<string, ConnectionCursor>;
    lastSyncAt?: string;
    lastStatus: ConnectionStatus;
    lastErrorCode?: ConnectionErrorCode;
    createdAt: string;
    updatedAt: string;
}

/** What the UI, the exports and the AI tools may see: credentials replaced by masked previews. */
export type SafeConnection = Omit<Connection, 'credentials'> & {
    credentialPreviews: Record<string, string>;
};

export interface NewConnectionInput {
    /**
     * Id chosen ahead (`newConnectionId()`): a bank session opened before the connection is saved
     * (French banks, TGLA-237) is kept under this id, so the first sync needs no second validation.
     */
    id?: string;
    sourceId: SourceId;
    label: string;
    credentials?: Record<string, string>;
    publicParams?: ConnectionPublicParams;
    accountMap?: Record<string, string>;
    mode?: ConnectionMode;
    syncIntervalHours?: number;
    historyStartDate?: string;
    /** Bank (Woob): read the operations of the checking and savings accounts (TGLA-254). */
    cashHistory?: boolean;
    /** Where each provider account starts (e.g. after the last row already imported from a file). */
    cursor?: Record<string, ConnectionCursor>;
}

/** Per-account outcome of one sync run. */
export interface SyncAccountReport {
    externalAccountId: string;
    accountId: string;
    imported: number;
    skippedDuplicates: number;
    batchId?: string;
    /** Assets whose provider quantity differs from the journal after the sync. */
    drift: Array<{ asset: string; providerQuantity: string; journalQuantity: string }>;
    /** Bank operations of the last 45 days that the bank changed (pending → booked, amount or date fixed). */
    updated?: number;
    /** Bank operations of the last 45 days that the bank no longer lists (cancelled). */
    removed?: number;
    /** Operations the bank announces as coming, kept apart from the journal. */
    upcoming?: number;
    /** Why the operations of a checking or savings account were not (all) read: history_unavailable, history_failed… */
    historyWarnings?: string[];
}

export interface SyncReport {
    connectionId: string;
    status: ConnectionStatus;
    errorCode?: ConnectionErrorCode;
    startedAt: string;
    finishedAt: string;
    accounts: SyncAccountReport[];
}
