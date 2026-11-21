/**
 * Watch-only Solana wallet source (TGLA-221): the SOL balance from PublicNode (browser call, no key)
 * and well-known SPL tokens from the official Solana RPC. Public RPCs refuse token listings from a
 * browser, so that call goes through the connector relay (public data, no secret involved).
 */
import { z } from 'zod';
import type { ExternalAccount, NormalizedHolding } from '../../../types/connections';
import { relayJson } from '../relayClient';
import { ConnectorError, type AdapterContext, type SourceAdapter } from '../types';
import { WALLET_ACCOUNT_ID } from './bitcoinWallet';
import { rpcBatch } from './jsonRpc';
import { formatUnits, SOL, SOLANA_RPC_URL, SOLANA_SYMBOLS, SOLANA_TOKENS } from './walletAssets';

const MAX_ADDRESSES = 20;
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

export const isSolanaAddress = (value: string): boolean => ADDRESS_PATTERN.test(value.trim());

const BalanceSchema = z.object({ value: z.number().int().nonnegative() });

const TokenAccountsSchema = z.object({
    result: z.object({
        value: z.array(z.object({
            account: z.object({
                data: z.object({
                    parsed: z.object({
                        info: z.object({
                            mint: z.string(),
                            tokenAmount: z.object({ amount: z.string().regex(/^\d+$/) }),
                        }),
                    }),
                }),
            }),
        })),
    }),
});

const addressesOf = (ctx: AdapterContext): string[] => {
    const addresses = [...new Set((ctx.publicParams.addresses ?? []).map(address => address.trim()).filter(Boolean))];
    if (addresses.length === 0 || addresses.length > MAX_ADDRESSES || !addresses.every(isSolanaAddress)) {
        throw new ConnectorError('invalid_response', 'Invalid Solana address list');
    }
    return addresses;
};

async function lamports(addresses: string[]): Promise<bigint> {
    const results = await rpcBatch(SOLANA_RPC_URL, addresses.map(address => ({ method: 'getBalance', params: [address] })));
    return results.reduce<bigint>((total, result) => {
        const parsed = BalanceSchema.safeParse(result);
        if (!parsed.success) throw new ConnectorError('invalid_response');
        return total + BigInt(parsed.data.value);
    }, 0n);
}

/** Base-unit token balances by mint (known tokens only), summed over the addresses. */
async function tokenBalances(addresses: string[]): Promise<Map<string, bigint>> {
    const totals = new Map<string, bigint>();
    for (const address of addresses) {
        const raw = await relayJson({
            provider: 'solana',
            method: 'POST',
            path: '/',
            body: { jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner', params: [address, { programId: TOKEN_PROGRAM }, { encoding: 'jsonParsed' }] },
        });
        const parsed = TokenAccountsSchema.safeParse(raw);
        if (!parsed.success) throw new ConnectorError('invalid_response');
        for (const entry of parsed.data.result.value) {
            const { mint, tokenAmount } = entry.account.data.parsed.info;
            if (!SOLANA_TOKENS[mint]) continue;
            totals.set(mint, (totals.get(mint) ?? 0n) + BigInt(tokenAmount.amount));
        }
    }
    return totals;
}

export const solanaWalletSource: SourceAdapter = {
    id: 'wallet_sol',
    transport: 'direct',
    capabilities: { holdings: true, history: false },
    credentialFields: [],
    ownsAsset: (symbol?: string) => Boolean(symbol && SOLANA_SYMBOLS.has(symbol.toUpperCase())),

    async listExternalAccounts(ctx: AdapterContext): Promise<ExternalAccount[]> {
        await lamports(addressesOf(ctx).slice(0, 1));
        return [{ externalId: WALLET_ACCOUNT_ID, name: 'Solana', currency: 'SOL' }];
    },

    async fetchHoldings(ctx: AdapterContext, externalAccountId: string): Promise<NormalizedHolding[]> {
        const addresses = addressesOf(ctx);
        const [native, tokens] = await Promise.all([lamports(addresses), tokenBalances(addresses)]);
        const holding = (asset: typeof SOL, amount: bigint, contractAddress?: string): NormalizedHolding => ({
            externalAccountId,
            symbol: asset.symbol,
            name: asset.name,
            instrumentType: 'crypto',
            network: 'solana',
            contractAddress,
            coingeckoId: asset.coingeckoId,
            quantity: formatUnits(amount, asset.decimals),
            currency: 'USD',
        });
        // SOL is always reported, even at zero: an emptied wallet must close its position
        return [
            holding(SOL, native),
            ...[...tokens.entries()]
                .filter(([, amount]) => amount > 0n)
                .map(([mint, amount]) => holding(SOLANA_TOKENS[mint], amount, mint)),
        ];
    },
};
