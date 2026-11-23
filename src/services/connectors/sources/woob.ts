/**
 * French banks through the local Woob worker (TGLA-237): PEA, CTO, life insurance and PER positions
 * (ISIN, quantity, unit cost), cash lines, euro funds, and the balance of checking and savings accounts.
 *
 * Holdings mode: each sync reconciles the bank's current picture as a snapshot. The bank is the source
 * of truth of the accounts it is mapped to (`ownsAsset` is always true). The sync never asks for a
 * two-factor code: when the bank wants one, it ends in `reauth_required` and the user reconnects.
 */
import type { ExternalAccount, NormalizedHolding } from '../../../types/connections';
import type { AccountType, WrapperType } from '../../../types/types.backend';
import { getManualPriceHistory, recordProviderQuotes, saveManualPrice } from '../../priceService';
import { ConnectorError, type AdapterContext, type SourceAdapter } from '../types';
import { woobClient, type WoobAccount, type WoobAccountHoldings, type WoobHolding, type WoobSessionRequest } from '../woobClient';

/** One worker call per sync for all the accounts of a bank, shared by the per-account reads of the run. */
const RUN_CACHE_MS = 60_000;
const runCache = new Map<string, { at: number; accounts: Promise<WoobAccountHoldings[]> }>();

export const clearWoobRunCache = (): void => runCache.clear();

export function sessionRequest(ctx: AdapterContext): WoobSessionRequest {
    const module = ctx.publicParams.module;
    if (!module) throw new ConnectorError('unknown', 'Bank module missing');
    return { key: ctx.connectionId, module, credentials: ctx.credentials };
}

function bankAccounts(ctx: AdapterContext): Promise<WoobAccountHoldings[]> {
    const cached = runCache.get(ctx.connectionId);
    if (cached && Date.now() - cached.at < RUN_CACHE_MS) return cached.accounts;
    const accounts = woobClient.holdings(sessionRequest(ctx));
    runCache.set(ctx.connectionId, { at: Date.now(), accounts });
    accounts.catch(() => runCache.delete(ctx.connectionId));
    return accounts;
}

/** Ticker-like name of a euro fund (it has no market price: valued at 1 per unit, its quantity is its value). */
export function euroFundSymbol(code: string | null, name: string): string {
    const clean = (code ?? '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
    if (clean.length >= 3) return clean.slice(0, 24);
    const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `FDE-${slug}`.slice(0, 24);
}

/** A euro fund is priced by hand at 1: recorded once, not at every sync. */
function ensureUnitPrice(symbol: string): void {
    const history = getManualPriceHistory(symbol);
    if (history[history.length - 1]?.price !== 1) saveManualPrice(symbol, 1);
}

/**
 * Words a bank puts in the name of an exchange-traded fund ("ISHARES MSCI WORLD SWAP PEA UCITS ETF"). Woob gives
 * no asset class: without this, an ETF waits for a market lookup and becomes a stock when it fails (TGLA-242).
 */
const ETF_NAME = /\b(ETF|UCITS|ETN|ETC|TRACKER)\b/i;

export const isEtfName = (name: string): boolean => ETF_NAME.test(name);

/** The bank's last quote of each line, kept as the price fallback when the market source refuses (TGLA-242). */
export function recordBankQuotes(holdings: WoobHolding[]): void {
    recordProviderQuotes(holdings.flatMap(holding => {
        if (holding.kind !== 'security' || !holding.unitValue) return [];
        const key = holding.isin ?? holding.symbol ?? holding.code;
        return key ? [{ key, price: Number(holding.unitValue), currency: holding.currency }] : [];
    }));
}

export function toNormalizedHolding(holding: WoobHolding, externalAccountId: string): NormalizedHolding | null {
    switch (holding.kind) {
        case 'cash':
            return {
                externalAccountId, symbol: holding.currency, name: holding.name, instrumentType: 'cash',
                quantity: holding.quantity, avgCost: '1', currency: holding.currency,
            };
        case 'euro_fund': {
            const symbol = euroFundSymbol(holding.code, holding.name);
            ensureUnitPrice(symbol);
            return {
                externalAccountId, symbol, name: holding.name, instrumentType: 'other',
                quantity: holding.quantity, avgCost: '1', currency: holding.currency,
            };
        }
        case 'security':
            if (!holding.isin && !holding.symbol && !holding.code) return null;
            return {
                externalAccountId,
                isin: holding.isin ?? undefined,
                // Without an ISIN, the bank's own code identifies the line (prices then come from the ISIN resolver or by hand)
                symbol: holding.isin ? holding.symbol ?? undefined : holding.symbol ?? holding.code ?? undefined,
                name: holding.name,
                instrumentType: isEtfName(holding.name) ? 'etf' : undefined,
                quantity: holding.quantity,
                avgCost: holding.avgCost ?? undefined,
                currency: holding.currency,
            };
        default:
            return null;
    }
}

const WRAPPERS: readonly WrapperType[] = ['CTO', 'PEA', 'PEA_PME', 'ASSURANCE_VIE', 'PER', 'LIVRET', 'OTHER'];
const ACCOUNT_TYPES: readonly AccountType[] = ['checking', 'savings', 'investment', 'other'];

/** A bank account as the account-mapping step shows it, with the type and wrapper to create it with. */
export function toExternalAccount(account: WoobAccount): ExternalAccount {
    return {
        externalId: account.id,
        name: account.label,
        currency: account.currency,
        accountType: ACCOUNT_TYPES.includes(account.type as AccountType) ? account.type as AccountType : 'other',
        wrapperType: WRAPPERS.includes(account.wrapper as WrapperType) ? account.wrapper as WrapperType : undefined,
        balance: account.balance ?? undefined,
    };
}

export const woobSource: SourceAdapter = {
    id: 'woob',
    transport: 'local_companion',
    capabilities: { holdings: true, history: false },
    credentialFields: ['login', 'password', 'birthdate'],

    // The bank is the source of truth of the account it is mapped to
    ownsAsset: () => true,

    async listExternalAccounts(ctx: AdapterContext): Promise<ExternalAccount[]> {
        return (await woobClient.accounts(sessionRequest(ctx))).map(toExternalAccount);
    },

    async fetchHoldings(ctx: AdapterContext, externalAccountId: string): Promise<NormalizedHolding[]> {
        const account = (await bankAccounts(ctx)).find(item => item.id === externalAccountId);
        if (!account) throw new ConnectorError('account_missing');
        recordBankQuotes(account.holdings);
        return account.holdings
            .map(holding => toNormalizedHolding(holding, externalAccountId))
            .filter((holding): holding is NormalizedHolding => holding !== null);
    },
};
