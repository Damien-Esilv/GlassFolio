/**
 * SnapTrade Personal source (TGLA-221): brokers and exchanges the user linked on SnapTrade's own
 * portal (Interactive Brokers, Trading 212, DEGIRO, eToro, Robinhood, Binance, Kraken, Coinbase…).
 *
 * Personal API keys: every request carries `clientId` and `timestamp` in its query and a `Signature`
 * header, the base64 HMAC-SHA256 (keyed with the consumer key) of the canonical JSON
 * `{content, path, query}`. The signature is computed here, in the browser: the consumer key never
 * leaves it, only the one-time signature travels through the relay (SnapTrade refuses browser calls).
 * Personal keys omit `userId` / `userSecret` (docs.snaptrade.com/docs/personal-api-key).
 */
import { z } from 'zod';
import type { InstrumentType, TransactionSubType, TransactionType } from '../../../types/types.backend';
import type { ExternalAccount, NormalizedActivity, NormalizedHolding } from '../../../types/connections';
import { canonicalJson, hmacSha256Base64 } from '../../security/requestSigning';
import { relayJson } from '../relayClient';
import { ConnectorError, type AdapterContext, type SourceAdapter } from '../types';
import { EVM_CHAINS, SOL, SOLANA_TOKENS } from './walletAssets';

const ACTIVITY_PAGE_SIZE = 1000;
/** SnapTrade account kinds with no investments to sync. */
const CASH_ACCOUNT_KINDS = new Set(['deposit', 'checking', 'savings', 'credit', 'credit_card', 'loan']);
const MAX_ACTIVITY_PAGES = 20;

/** Market Identifier Code → Yahoo Finance suffix, to price a listing (CW8 on XPAR → CW8.PA). */
const MIC_SUFFIX: Record<string, string> = {
    XPAR: '.PA', XAMS: '.AS', XBRU: '.BR', XLIS: '.LS', XETR: '.DE', XFRA: '.F', XMIL: '.MI', XMAD: '.MC',
    XLON: '.L', XSWX: '.SW', XWBO: '.VI', XSTO: '.ST', XHEL: '.HE', XCSE: '.CO', XOSL: '.OL', XTSE: '.TO', XTSX: '.V',
    XNAS: '', XNYS: '', ARCX: '', BATS: '', XASE: '', NASDAQ: '', NYSE: '', ARCA: '',
};

/** CoinGecko ids of the coins GlassFolio already knows, so crypto held at a broker is priced exactly. */
const COINGECKO_BY_SYMBOL: Record<string, string> = Object.fromEntries([
    ['BTC', 'bitcoin'],
    [SOL.symbol, SOL.coingeckoId],
    ...EVM_CHAINS.flatMap(chain => [chain.native, ...chain.tokens]).map(asset => [asset.symbol, asset.coingeckoId]),
    ...Object.values(SOLANA_TOKENS).map(asset => [asset.symbol, asset.coingeckoId]),
]);

/** Yahoo-style symbol of a listing: kept as is when it already has a suffix (VAB.TO). */
export function marketSymbol(symbol: string, exchange?: string | null): string {
    const clean = symbol.trim().toUpperCase();
    if (clean.includes('.')) return clean;
    const suffix = exchange ? MIC_SUFFIX[exchange.trim().toUpperCase()] : undefined;
    return suffix ? `${clean}${suffix}` : clean;
}

const INSTRUMENT_KIND: Record<string, InstrumentType> = {
    stock: 'stock', adr: 'stock', preferred_stock: 'stock', etf: 'etf', mutualfund: 'fund', cef: 'fund',
    crypto: 'crypto', bond: 'bond', other: 'other',
};

const SECURITY_TYPE: Record<string, InstrumentType> = {
    cs: 'stock', ad: 'stock', ps: 'stock', et: 'etf', etf: 'etf', oef: 'fund', cef: 'fund', mf: 'fund',
    crypto: 'crypto', cr: 'crypto', bnd: 'bond',
};

// ---------------------------------------------------------------------------------------------
// Response contracts (only the fields used; anything else is ignored)
// ---------------------------------------------------------------------------------------------

const decimal = z.union([z.string(), z.number()]).nullable().optional()
    .transform(value => (value === null || value === undefined || value === '' ? undefined : String(value)))
    .refine(value => value === undefined || Number.isFinite(Number(value)), 'not a number');

const AccountsSchema = z.object({
    results: z.array(z.object({
        kind: z.string().optional(),
        id: z.string().min(1),
        display_name: z.string().nullable().optional(),
        masked_account_number: z.string().nullable().optional(),
        net_value: z.object({ currency: z.string().nullable().optional() }).passthrough().nullable().optional(),
    }).passthrough()),
});

const PositionsSchema = z.object({
    results: z.array(z.object({
        instrument: z.object({
            kind: z.string(),
            symbol: z.string().nullable().optional(),
            raw_symbol: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            currency: z.string().nullable().optional(),
            exchange: z.string().nullable().optional(),
        }).passthrough(),
        units: decimal,
        cost_basis: decimal,
        currency: z.string().nullable().optional(),
    }).passthrough()),
});

const ActivitySymbolSchema = z.object({
    symbol: z.string().nullable().optional(),
    raw_symbol: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    exchange: z.object({ code: z.string().nullable().optional(), mic_code: z.string().nullable().optional() }).passthrough().nullable().optional(),
    type: z.object({ code: z.string().nullable().optional() }).passthrough().nullable().optional(),
}).passthrough().nullable().optional();

const ActivitiesSchema = z.object({
    data: z.array(z.object({
        id: z.string().min(1),
        type: z.string().nullable().optional(),
        symbol: ActivitySymbolSchema,
        units: decimal,
        price: decimal,
        amount: decimal,
        fee: decimal,
        fx_rate: decimal,
        currency: z.object({ code: z.string().nullable().optional() }).passthrough().nullable().optional(),
        description: z.string().nullable().optional(),
        trade_date: z.string().nullable().optional(),
        settlement_date: z.string().nullable().optional(),
    }).passthrough()),
    pagination: z.object({ offset: z.number().optional(), limit: z.number().optional(), total: z.number().optional() }).passthrough().optional(),
});

type ActivityRow = z.infer<typeof ActivitiesSchema>['data'][number];

// ---------------------------------------------------------------------------------------------
// Signed requests
// ---------------------------------------------------------------------------------------------

/** Signature of one request, as SnapTrade computes it (exported for tests). */
export async function signRequest(consumerKey: string, path: string, query: string, content: unknown = null): Promise<string> {
    return hmacSha256Base64(consumerKey, canonicalJson({ content, path, query }));
}

const credentialsOf = (ctx: AdapterContext): { clientId: string; consumerKey: string } => {
    const clientId = ctx.credentials.clientId?.trim();
    const consumerKey = ctx.credentials.consumerKey?.trim();
    if (!clientId || !consumerKey) throw new ConnectorError('auth_failed', 'Missing SnapTrade keys');
    return { clientId, consumerKey };
};

async function snaptradeGet(ctx: AdapterContext, path: string, params: Record<string, string> = {}): Promise<unknown> {
    const { clientId, consumerKey } = credentialsOf(ctx);
    const query = new URLSearchParams({ clientId, timestamp: String(Math.floor(Date.now() / 1000)), ...params }).toString();
    const signature = await signRequest(consumerKey, path, query);
    return relayJson({ provider: 'snaptrade', method: 'GET', path, query, headers: { Signature: signature } });
}

const parse = <T>(schema: z.ZodType<T>, raw: unknown): T => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new ConnectorError('invalid_response');
    return parsed.data;
};

// ---------------------------------------------------------------------------------------------
// Activity mapping (SnapTrade sign convention = the journal's: a negative amount is cash going out)
// ---------------------------------------------------------------------------------------------

interface MappedType { type: TransactionType; subType?: TransactionSubType }

function mapActivityType(raw: string, units: number): MappedType | null {
    switch (raw) {
        case 'BUY':
        case 'REI':
            return { type: 'BUY' };
        case 'SELL':
            return { type: 'SELL' };
        case 'DIVIDEND':
        case 'SUBSTITUTE_DIVIDEND':
        case 'CAPITAL_GAINS_LONG':
        case 'CAPITAL_GAINS_SHORT':
            return { type: 'INCOME', subType: 'DIVIDEND' };
        case 'INTEREST':
            return { type: 'INCOME', subType: 'INTEREST' };
        case 'CONTRIBUTION':
            return { type: 'DEPOSIT', subType: 'FIAT_DEPOSIT' };
        case 'WITHDRAWAL':
            return { type: 'WITHDRAW', subType: 'FIAT_WITHDRAWAL' };
        case 'FEE':
        case 'TAX':
            return { type: 'EXPENSE' };
        case 'STOCK_DIVIDEND':
            return { type: 'DEPOSIT', subType: 'TRANSFER_IN' };
        case 'TRANSFER':
            return units < 0 ? { type: 'WITHDRAW', subType: 'TRANSFER_OUT' } : { type: 'DEPOSIT', subType: 'TRANSFER_IN' };
        default:
            // Splits, option events and broker-specific types are not replayed: the holdings check reports their effect
            return null;
    }
}

export function mapActivity(row: ActivityRow, externalAccountId: string): NormalizedActivity | null {
    const rawType = (row.type ?? '').toUpperCase();
    const unitsNumber = Number(row.units ?? 0);
    const mapped = mapActivityType(rawType, unitsNumber);
    const date = row.trade_date ?? row.settlement_date;
    if (!mapped || !date) return null;

    const currency = (row.currency?.code ?? '').toUpperCase() || 'USD';
    const price = row.price && Number(row.price) !== 0 ? String(Math.abs(Number(row.price))) : undefined;
    const quantity = unitsNumber !== 0 ? String(Math.abs(unitsNumber)) : undefined;
    let amount = row.amount === undefined || row.amount === null ? undefined : String(row.amount);
    if (amount === undefined && quantity && price) {
        const gross = Number(quantity) * Number(price);
        amount = String(mapped.type === 'BUY' ? -gross : gross);
    }

    const symbol = row.symbol?.raw_symbol || row.symbol?.symbol;
    const isCashOnly = mapped.type === 'DEPOSIT' && mapped.subType === 'FIAT_DEPOSIT'
        || mapped.type === 'WITHDRAW' && mapped.subType === 'FIAT_WITHDRAWAL'
        || !symbol;
    const exchange = row.symbol?.exchange?.mic_code || row.symbol?.exchange?.code;
    const typeCode = row.symbol?.type?.code?.toLowerCase();
    const instrumentType = typeCode ? SECURITY_TYPE[typeCode] : undefined;
    const fee = row.fee && Number(row.fee) !== 0 ? String(Math.abs(Number(row.fee))) : undefined;

    return {
        externalAccountId,
        externalId: `snaptrade:${row.id}`,
        date: new Date(date).toISOString(),
        type: mapped.type,
        subType: mapped.subType,
        rawType,
        label: row.description ?? undefined,
        symbol: isCashOnly ? undefined : marketSymbol(symbol as string, row.symbol?.symbol?.includes('.') ? undefined : exchange),
        name: isCashOnly ? undefined : row.symbol?.description ?? undefined,
        instrumentType: isCashOnly ? undefined : instrumentType,
        coingeckoId: !isCashOnly && instrumentType === 'crypto' && symbol ? COINGECKO_BY_SYMBOL[symbol.toUpperCase()] : undefined,
        quantity: isCashOnly ? undefined : quantity,
        price: isCashOnly ? undefined : price,
        amount: amount ?? '0',
        fee,
        currency,
        fxRate: row.fx_rate === undefined || row.fx_rate === null ? undefined : String(row.fx_rate),
    };
}

// ---------------------------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------------------------

export const snaptradeSource: SourceAdapter = {
    id: 'snaptrade',
    transport: 'relay',
    capabilities: { holdings: true, history: true },
    credentialFields: ['clientId', 'consumerKey'],

    async listExternalAccounts(ctx: AdapterContext): Promise<ExternalAccount[]> {
        const accounts = parse(AccountsSchema, await snaptradeGet(ctx, '/accounts/all'));
        return accounts.results
            // Bank-side accounts (checking, credit card…) carry no positions; every other kind is kept,
            // crypto exchanges included, whatever name SnapTrade gives them
            .filter(account => !CASH_ACCOUNT_KINDS.has((account.kind ?? '').toLowerCase()))
            .map(account => ({
                externalId: account.id,
                name: [account.display_name, account.masked_account_number].filter(Boolean).join(' ') || account.id,
                currency: account.net_value?.currency?.toUpperCase() || undefined,
            }));
    },

    async fetchHoldings(ctx: AdapterContext, externalAccountId: string): Promise<NormalizedHolding[]> {
        const positions = parse(PositionsSchema, await snaptradeGet(ctx, `/accounts/${encodeURIComponent(externalAccountId)}/positions/all`));
        return positions.results.flatMap(position => {
            const instrumentType = INSTRUMENT_KIND[position.instrument.kind];
            const symbol = position.instrument.raw_symbol || position.instrument.symbol;
            if (!instrumentType || !symbol || position.units === undefined) return [];
            return [{
                externalAccountId,
                symbol: instrumentType === 'crypto' ? symbol.toUpperCase() : marketSymbol(symbol, position.instrument.exchange),
                name: position.instrument.description ?? undefined,
                instrumentType,
                coingeckoId: instrumentType === 'crypto' ? COINGECKO_BY_SYMBOL[symbol.toUpperCase()] : undefined,
                quantity: position.units,
                avgCost: position.cost_basis,
                currency: (position.currency || position.instrument.currency || 'USD').toUpperCase(),
            }];
        });
    },

    async fetchActivities(ctx: AdapterContext, externalAccountId: string, since?: string): Promise<NormalizedActivity[]> {
        const rows: ActivityRow[] = [];
        for (let page = 0; page < MAX_ACTIVITY_PAGES; page++) {
            const params: Record<string, string> = { offset: String(page * ACTIVITY_PAGE_SIZE), limit: String(ACTIVITY_PAGE_SIZE) };
            if (since) params.startDate = since.slice(0, 10);
            const batch = parse(ActivitiesSchema, await snaptradeGet(ctx, `/accounts/${encodeURIComponent(externalAccountId)}/activities`, params));
            rows.push(...batch.data);
            const total = batch.pagination?.total;
            if (batch.data.length < ACTIVITY_PAGE_SIZE || (total !== undefined && rows.length >= total)) break;
        }
        return rows
            .map(row => mapActivity(row, externalAccountId))
            .filter((activity): activity is NormalizedActivity => activity !== null)
            .sort((a, b) => a.date.localeCompare(b.date));
    },
};
