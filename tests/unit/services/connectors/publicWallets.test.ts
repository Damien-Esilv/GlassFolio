/**
 * Watch-only wallets (TGLA-221), on well-known public addresses and official test vectors:
 * - BIP84 / BIP32 test vectors for the extended keys (addresses derived locally);
 * - vitalik.eth and the EIP-55 example address for Ethereum;
 * - the "vines" example wallet of the Solana documentation;
 * - the Electrum documentation address for Bitcoin.
 * Network answers are mocked (no real call in unit tests); live probes run nightly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { connectionService, syncEngine, WALLET_ACCOUNT_ID } from '../../../../src/services/connectors';
import {
  addressFromPublicKey, bitcoinWalletSource, deriveAddress, isBitcoinWalletEntry, isExtendedPublicKey, GAP_LIMIT,
} from '../../../../src/services/connectors/sources/bitcoinWallet';
import { evmWalletSource, isEvmAddress } from '../../../../src/services/connectors/sources/evmWallet';
import { isSolanaAddress, solanaWalletSource } from '../../../../src/services/connectors/sources/solanaWallet';
import { formatUnits } from '../../../../src/services/connectors/sources/walletAssets';

/** BIP84 test vector: account 0 of the "abandon … about" mnemonic. */
const BIP84_ZPUB = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
/** BIP32 test vector 1, master public key. */
const BIP32_TV1_XPUB = 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8';
const ELECTRUM_DOCS_ADDRESS = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const VITALIK_ETH = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const EIP55_EXAMPLE = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const SOLANA_DOCS_WALLET = 'vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg';
const USDC_SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const ctx = (addresses: string[]) => ({ connectionId: 'c', credentials: {}, publicParams: { addresses } });
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const hex = (value: bigint) => `0x${value.toString(16)}`;

/** Esplora mock: balances per address; every other address is unused. */
const esplora = (balances: Record<string, number>) =>
  vi.fn(async (url: string) => {
    const address = decodeURIComponent(url.split('/api/address/')[1]);
    const sats = balances[address] ?? 0;
    return json({ chain_stats: { funded_txo_sum: sats, spent_txo_sum: 0, tx_count: sats > 0 ? 1 : 0 } });
  });

/** EVM RPC mock: native and token balances (base units) on Ethereum; zero elsewhere. */
const evmRpc = (ethereum: { native: bigint; usdc: bigint }) =>
  vi.fn(async (url: string, init?: RequestInit) => {
    const calls = JSON.parse(init?.body as string) as Array<{ id: number; method: string; params: Array<{ to?: string }> }>;
    const onMainnet = url.startsWith('https://ethereum-rpc');
    return json(calls.map(call => {
      if (!onMainnet) return { jsonrpc: '2.0', id: call.id, result: '0x0' };
      if (call.method === 'eth_getBalance') return { jsonrpc: '2.0', id: call.id, result: hex(ethereum.native) };
      const isUsdc = call.params[0].to?.toLowerCase() === '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      return { jsonrpc: '2.0', id: call.id, result: hex(isUsdc ? ethereum.usdc : 0n) };
    }));
  });

describe('bitcoin extended public keys', () => {
  it('derives the BIP84 test vector addresses (receiving and change)', async () => {
    expect(await deriveAddress(BIP84_ZPUB, 0, 0)).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(await deriveAddress(BIP84_ZPUB, 0, 1)).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
    expect(await deriveAddress(BIP84_ZPUB, 1, 0)).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el');
  });

  it('encodes legacy addresses like the BIP32 test vector 1', async () => {
    const { HDKey } = await import('@scure/bip32');
    expect(await addressFromPublicKey(HDKey.fromExtendedKey(BIP32_TV1_XPUB).publicKey as Uint8Array, 'p2pkh')).toBe('15mKKb2eos1hWa6tisdPwwDC1a5J1y9nma');
  });

  it('encodes nested SegWit (ypub) as P2SH addresses', async () => {
    const { HDKey } = await import('@scure/bip32');
    expect(await addressFromPublicKey(HDKey.fromExtendedKey(BIP32_TV1_XPUB).publicKey as Uint8Array, 'p2sh-p2wpkh')).toMatch(/^3[1-9A-HJ-NP-Za-km-z]{25,34}$/);
  });

  it('accepts addresses and extended keys, nothing else', () => {
    expect(isBitcoinWalletEntry(ELECTRUM_DOCS_ADDRESS)).toBe(true);
    expect(isExtendedPublicKey(BIP84_ZPUB)).toBe(true);
    expect(isBitcoinWalletEntry('xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LETbS')).toBe(false);
    expect(isBitcoinWalletEntry('hello')).toBe(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('finds the used addresses of an extended key and stops after the gap limit', async () => {
    const fetchMock = esplora({
      [await deriveAddress(BIP84_ZPUB, 0, 0)]: 10_000_000,
      [await deriveAddress(BIP84_ZPUB, 0, 3)]: 5_000_000,
      [await deriveAddress(BIP84_ZPUB, 1, 0)]: 2_500_000,
    });
    vi.stubGlobal('fetch', fetchMock);
    const [holding] = await bitcoinWalletSource.fetchHoldings(ctx([BIP84_ZPUB]), WALLET_ACCOUNT_ID);
    expect(holding.quantity).toBe('0.175');
    // Receiving: used up to index 3 then GAP_LIMIT unused; change: index 0 then GAP_LIMIT unused (in batches of 4)
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2 * (GAP_LIMIT + 8));
  });

  it('sums a plain address and an extended key', async () => {
    vi.stubGlobal('fetch', esplora({ [ELECTRUM_DOCS_ADDRESS]: 18_233_271, [await deriveAddress(BIP84_ZPUB, 0, 0)]: 1 }));
    const [holding] = await bitcoinWalletSource.fetchHoldings(ctx([ELECTRUM_DOCS_ADDRESS, BIP84_ZPUB]), WALLET_ACCOUNT_ID);
    expect(holding).toMatchObject({ symbol: 'BTC', quantity: '0.18233272', coingeckoId: 'bitcoin' });
  });
});

describe('ethereum & EVM wallets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates addresses', () => {
    expect(isEvmAddress(VITALIK_ETH)).toBe(true);
    expect(isEvmAddress(EIP55_EXAMPLE)).toBe(true);
    expect(isEvmAddress('vitalik.eth')).toBe(false);
    expect(isEvmAddress('0x1234')).toBe(false);
  });

  it('reads ETH and known tokens of vitalik.eth, exact to the wei', async () => {
    vi.stubGlobal('fetch', evmRpc({ native: 5_799_563_395_714_211_740n, usdc: 39_192_124n }));
    const holdings = await evmWalletSource.fetchHoldings(ctx([VITALIK_ETH]), WALLET_ACCOUNT_ID);
    expect(holdings.find(h => h.network === 'ethereum' && h.symbol === 'ETH')?.quantity).toBe('5.79956339571421174');
    expect(holdings.find(h => h.symbol === 'USDC')).toMatchObject({ quantity: '39.192124', coingeckoId: 'usd-coin' });
    // Native coins of the other chains are reported at zero (an emptied wallet closes its position); zero tokens are not
    expect(holdings.filter(h => h.symbol === 'USDT')).toHaveLength(0);
    expect(holdings.find(h => h.network === 'polygon')?.symbol).toBe('POL');
  });

  it('asks every chain in one request and sums several addresses', async () => {
    const fetchMock = evmRpc({ native: 10n ** 18n, usdc: 0n });
    vi.stubGlobal('fetch', fetchMock);
    const holdings = await evmWalletSource.fetchHoldings(ctx([VITALIK_ETH, EIP55_EXAMPLE]), WALLET_ACCOUNT_ID);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(holdings.find(h => h.network === 'ethereum' && h.symbol === 'ETH')?.quantity).toBe('2');
  });

  it('fails the whole read when one chain answers with an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json([{ jsonrpc: '2.0', id: 0, error: { code: 429, message: 'slow down' } }])));
    await expect(evmWalletSource.fetchHoldings(ctx([VITALIK_ETH]), WALLET_ACCOUNT_ID)).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('formats base units exactly', () => {
    expect(formatUnits(1n, 18)).toBe('0.000000000000000001');
    expect(formatUnits(123_450_000n, 6)).toBe('123.45');
    expect(formatUnits(0n, 6)).toBe('0');
  });
});

describe('solana wallets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads SOL and known SPL tokens, ignoring unknown ones', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/connector-relay') {
        return json({ jsonrpc: '2.0', id: 1, result: { value: [
          { account: { data: { parsed: { info: { mint: USDC_SOLANA, tokenAmount: { amount: '1234567' } } } } } },
          { account: { data: { parsed: { info: { mint: 'SpamMint1111111111111111111111111111111111', tokenAmount: { amount: '999999999' } } } } } },
        ] } });
      }
      return json([{ jsonrpc: '2.0', id: 0, result: { context: { slot: 1 }, value: 39_869_364 } }]);
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(isSolanaAddress(SOLANA_DOCS_WALLET)).toBe(true);

    const holdings = await solanaWalletSource.fetchHoldings(ctx([SOLANA_DOCS_WALLET]), WALLET_ACCOUNT_ID);
    expect(holdings).toEqual([
      expect.objectContaining({ symbol: 'SOL', quantity: '0.039869364', coingeckoId: 'solana' }),
      expect.objectContaining({ symbol: 'USDC', quantity: '1.234567', contractAddress: USDC_SOLANA }),
    ]);
    const relayed = JSON.parse((fetchMock.mock.calls.find(([url]) => url === '/api/connector-relay') as unknown as [string, RequestInit])[1].body as string);
    expect(relayed).toMatchObject({ provider: 'solana', body: { method: 'getTokenAccountsByOwner' } });
  });
});

describe('several wallets on one account', () => {
  beforeEach(async () => {
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('wallets@example.test', 'Wallets-Test-Key-2026!#xx', 'Wallets');
    db.saveInstitutes([{ id: 'inst-l', ownerId: 'u', name: 'Ledger', type: 'wallet' } as never]);
    db.saveAccounts([{ id: 'acc-l', ownerId: 'u', instituteId: 'inst-l', name: 'Ledger', type: 'crypto_spot', defaultCurrency: 'EUR', isActive: true } as never]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a Bitcoin and an Ethereum wallet share a Ledger account without closing each other', async () => {
    const btc = await connectionService.createConnection({
      sourceId: 'wallet_btc', label: 'Ledger BTC', publicParams: { addresses: [ELECTRUM_DOCS_ADDRESS] }, accountMap: { [WALLET_ACCOUNT_ID]: 'acc-l' },
    });
    const eth = await connectionService.createConnection({
      sourceId: 'wallet_evm', label: 'Ledger ETH', publicParams: { addresses: [VITALIK_ETH] }, accountMap: { [WALLET_ACCOUNT_ID]: 'acc-l' },
    });

    vi.stubGlobal('fetch', esplora({ [ELECTRUM_DOCS_ADDRESS]: 18_233_271 }));
    expect((await syncEngine.runSync(btc.id)).status).toBe('ok');
    vi.stubGlobal('fetch', evmRpc({ native: 5n * 10n ** 18n, usdc: 0n }));
    expect((await syncEngine.runSync(eth.id)).status).toBe('ok');

    const held = db.getPositions().filter(p => p.accountId === 'acc-l' && p.quantity > 0).map(p => [p.symbol, p.quantity]);
    expect(held).toEqual(expect.arrayContaining([['BTC', 0.18233271], ['ETH', 5]]));
  });
});
