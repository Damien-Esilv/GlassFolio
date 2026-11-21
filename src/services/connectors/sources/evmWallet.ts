/**
 * Watch-only Ethereum and EVM wallet source (TGLA-221): native balances and well-known tokens on
 * Ethereum, Arbitrum, Base, Optimism and Polygon, read from PublicNode's free RPC endpoints (no key,
 * no account, browser calls allowed). Balances of every chain are summed per asset (USDC on Ethereum
 * and on Arbitrum is one USDC position).
 */
import type { ExternalAccount, NormalizedHolding } from '../../../types/connections';
import { ConnectorError, type AdapterContext, type SourceAdapter } from '../types';
import { WALLET_ACCOUNT_ID } from './bitcoinWallet';
import { hexToBigInt, rpcBatch, type RpcCall } from './jsonRpc';
import { EVM_CHAINS, EVM_SYMBOLS, formatUnits, type EvmChain } from './walletAssets';

const MAX_ADDRESSES = 20;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
/** ERC-20 `balanceOf(address)` selector. */
const BALANCE_OF = '0x70a08231';

export const isEvmAddress = (value: string): boolean => ADDRESS_PATTERN.test(value.trim());

const addressesOf = (ctx: AdapterContext): string[] => {
    const addresses = [...new Set((ctx.publicParams.addresses ?? []).map(address => address.trim().toLowerCase()).filter(Boolean))];
    if (addresses.length === 0 || addresses.length > MAX_ADDRESSES || !addresses.every(isEvmAddress)) {
        throw new ConnectorError('invalid_response', 'Invalid EVM address list');
    }
    return addresses;
};

const chainsOf = (ctx: AdapterContext): readonly EvmChain[] => {
    const wanted = ctx.publicParams.chainIds;
    return wanted && wanted.length > 0 ? EVM_CHAINS.filter(chain => wanted.includes(chain.chainId)) : EVM_CHAINS;
};

const balanceOfCall = (contract: string, owner: string): RpcCall => ({
    method: 'eth_call',
    params: [{ to: contract, data: `${BALANCE_OF}${owner.slice(2).padStart(64, '0')}` }, 'latest'],
});

/** Base-unit balances per asset symbol on one chain, summed over the addresses. */
async function chainBalances(chain: EvmChain, addresses: string[]): Promise<Map<string, bigint>> {
    const calls: Array<{ symbol: string; call: RpcCall }> = [];
    for (const address of addresses) {
        calls.push({ symbol: chain.native.symbol, call: { method: 'eth_getBalance', params: [address, 'latest'] } });
        for (const token of chain.tokens) calls.push({ symbol: token.symbol, call: balanceOfCall(token.contract, address) });
    }
    const results = await rpcBatch(chain.rpcUrl, calls.map(entry => entry.call));
    const totals = new Map<string, bigint>();
    results.forEach((result, index) => {
        const symbol = calls[index].symbol;
        totals.set(symbol, (totals.get(symbol) ?? 0n) + hexToBigInt(result));
    });
    return totals;
}

export const evmWalletSource: SourceAdapter = {
    id: 'wallet_evm',
    transport: 'direct',
    capabilities: { holdings: true, history: false },
    credentialFields: [],
    ownsAsset: (symbol?: string) => Boolean(symbol && EVM_SYMBOLS.has(symbol.toUpperCase())),

    async listExternalAccounts(ctx: AdapterContext): Promise<ExternalAccount[]> {
        const addresses = addressesOf(ctx);
        await rpcBatch(EVM_CHAINS[0].rpcUrl, [{ method: 'eth_getBalance', params: [addresses[0], 'latest'] }]);
        return [{ externalId: WALLET_ACCOUNT_ID, name: 'Ethereum & EVM', currency: 'ETH' }];
    },

    async fetchHoldings(ctx: AdapterContext, externalAccountId: string): Promise<NormalizedHolding[]> {
        const addresses = addressesOf(ctx);
        const holdings: NormalizedHolding[] = [];
        for (const chain of chainsOf(ctx)) {
            const totals = await chainBalances(chain, addresses);
            for (const asset of [chain.native, ...chain.tokens]) {
                const amount = totals.get(asset.symbol) ?? 0n;
                // The native coin is always reported, even at zero: an emptied wallet must close its position
                if (amount === 0n && asset !== chain.native) continue;
                holdings.push({
                    externalAccountId,
                    symbol: asset.symbol,
                    name: asset.name,
                    instrumentType: 'crypto',
                    network: chain.network,
                    contractAddress: 'contract' in asset ? (asset as { contract: string }).contract : undefined,
                    coingeckoId: asset.coingeckoId,
                    quantity: formatUnits(amount, asset.decimals),
                    currency: 'USD',
                });
            }
        }
        return holdings;
    },
};
