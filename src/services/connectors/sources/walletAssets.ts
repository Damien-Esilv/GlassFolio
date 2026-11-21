/**
 * Chains and tokens tracked for watch-only wallets (TGLA-221).
 *
 * Only well-known tokens are read, on purpose: wallets receive unsolicited "airdrop" tokens that
 * are worthless or scams, and listing every token would put them in the portfolio. Contracts and
 * decimals were checked on-chain (symbol() / decimals(), getAccountInfo) on 2026-11-20.
 * RPC endpoints are PublicNode's free, keyless endpoints, which allow browser calls (CORS).
 */

export interface WalletAsset {
    symbol: string;
    name: string;
    coingeckoId: string;
    decimals: number;
}

export interface EvmToken extends WalletAsset {
    contract: string;
}

export interface EvmChain {
    chainId: number;
    /** Network recorded on the instruments. */
    network: string;
    rpcUrl: string;
    native: WalletAsset;
    tokens: EvmToken[];
}

const ETH: WalletAsset = { symbol: 'ETH', name: 'Ethereum', coingeckoId: 'ethereum', decimals: 18 };
const USDC = (contract: string): EvmToken => ({ symbol: 'USDC', name: 'USD Coin', coingeckoId: 'usd-coin', decimals: 6, contract });
const USDT = (contract: string): EvmToken => ({ symbol: 'USDT', name: 'Tether', coingeckoId: 'tether', decimals: 6, contract });

export const EVM_CHAINS: readonly EvmChain[] = [
    {
        chainId: 1,
        network: 'ethereum',
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
        native: ETH,
        tokens: [
            USDC('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
            USDT('0xdAC17F958D2ee523a2206206994597C13D831ec7'),
            { symbol: 'DAI', name: 'Dai', coingeckoId: 'dai', decimals: 18, contract: '0x6B175474E89094C44Da98b954EedeAC495271d0F' },
            { symbol: 'WETH', name: 'Wrapped Ether', coingeckoId: 'weth', decimals: 18, contract: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
            { symbol: 'WBTC', name: 'Wrapped Bitcoin', coingeckoId: 'wrapped-bitcoin', decimals: 8, contract: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' },
            { symbol: 'LINK', name: 'Chainlink', coingeckoId: 'chainlink', decimals: 18, contract: '0x514910771AF9Ca656af840dff83E8264EcF986CA' },
            { symbol: 'UNI', name: 'Uniswap', coingeckoId: 'uniswap', decimals: 18, contract: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' },
            { symbol: 'STETH', name: 'Lido Staked Ether', coingeckoId: 'staked-ether', decimals: 18, contract: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84' },
        ],
    },
    {
        chainId: 42161,
        network: 'arbitrum',
        rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
        native: ETH,
        tokens: [
            USDC('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'),
            USDT('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'),
            { symbol: 'ARB', name: 'Arbitrum', coingeckoId: 'arbitrum', decimals: 18, contract: '0x912CE59144191C1204E64559FE8253a0e49E6548' },
        ],
    },
    {
        chainId: 8453,
        network: 'base',
        rpcUrl: 'https://base-rpc.publicnode.com',
        native: ETH,
        tokens: [USDC('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')],
    },
    {
        chainId: 10,
        network: 'optimism',
        rpcUrl: 'https://optimism-rpc.publicnode.com',
        native: ETH,
        tokens: [
            USDC('0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85'),
            { symbol: 'OP', name: 'Optimism', coingeckoId: 'optimism', decimals: 18, contract: '0x4200000000000000000000000000000000000042' },
        ],
    },
    {
        chainId: 137,
        network: 'polygon',
        rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
        native: { symbol: 'POL', name: 'Polygon', coingeckoId: 'polygon-ecosystem-token', decimals: 18 },
        tokens: [
            USDC('0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'),
            USDT('0xc2132D05D31c914a87C6611C10748AEb04B58e8F'),
        ],
    },
];

export const SOLANA_RPC_URL = 'https://solana-rpc.publicnode.com';
export const SOL: WalletAsset = { symbol: 'SOL', name: 'Solana', coingeckoId: 'solana', decimals: 9 };

/** SPL tokens read on Solana wallets, by mint. */
export const SOLANA_TOKENS: Readonly<Record<string, WalletAsset>> = {
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', name: 'USD Coin', coingeckoId: 'usd-coin', decimals: 6 },
    Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: 'USDT', name: 'Tether', coingeckoId: 'tether', decimals: 6 },
    JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: 'JUP', name: 'Jupiter', coingeckoId: 'jupiter-exchange-solana', decimals: 6 },
    mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { symbol: 'MSOL', name: 'Marinade Staked SOL', coingeckoId: 'msol', decimals: 9 },
    J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: { symbol: 'JITOSOL', name: 'Jito Staked SOL', coingeckoId: 'jito-staked-sol', decimals: 9 },
    DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: { symbol: 'BONK', name: 'Bonk', coingeckoId: 'bonk', decimals: 5 },
};

/** Exact decimal string of an integer amount in base units (no floating-point rounding). */
export function formatUnits(amount: bigint, decimals: number): string {
    const negative = amount < 0n;
    const digits = (negative ? -amount : amount).toString().padStart(decimals + 1, '0');
    const whole = digits.slice(0, digits.length - decimals);
    const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '');
    return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/** Symbols a wallet source manages: a snapshot of that wallet only ever closes these. */
export const EVM_SYMBOLS: ReadonlySet<string> = new Set(
    EVM_CHAINS.flatMap(chain => [chain.native.symbol, ...chain.tokens.map(token => token.symbol)])
);
export const SOLANA_SYMBOLS: ReadonlySet<string> = new Set([SOL.symbol, ...Object.values(SOLANA_TOKENS).map(token => token.symbol)]);
