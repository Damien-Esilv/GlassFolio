/**
 * Watch-only Bitcoin wallet (TGLA-221): balances summed over the addresses, exact decimals, a
 * confirmed zero closes the position, and invalid input never reaches the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { connectionService, syncEngine, isBitcoinAddress, WALLET_ACCOUNT_ID } from '../../../../src/services/connectors';
import { bitcoinWalletSource, satsToBtc } from '../../../../src/services/connectors/sources/bitcoinWallet';
import { mergeHoldings } from '../../../../src/services/connectors/syncEngine';

const ADDRESS_A = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const ADDRESS_B = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

const esplora = (balances: Record<string, number>) =>
  vi.fn(async (url: string) => {
    const address = decodeURIComponent(url.split('/api/address/')[1]);
    return new Response(JSON.stringify({ chain_stats: { funded_txo_sum: balances[address] ?? 0, spent_txo_sum: 0 } }), { status: 200 });
  });

const ctx = (addresses: string[]) => ({ connectionId: 'c', credentials: {}, publicParams: { addresses } });

describe('bitcoin wallet source', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recognises mainnet addresses only', () => {
    expect(isBitcoinAddress(ADDRESS_A)).toBe(true);
    expect(isBitcoinAddress(ADDRESS_B)).toBe(true);
    expect(isBitcoinAddress('tb1qtestnetaddress0000000000000000000000')).toBe(false);
    expect(isBitcoinAddress('not an address')).toBe(false);
  });

  it('converts satoshis without rounding', () => {
    expect(satsToBtc(150_000_000)).toBe('1.5');
    expect(satsToBtc(1)).toBe('0.00000001');
    expect(satsToBtc(0)).toBe('0');
  });

  it('sums the addresses into one holding priced by its CoinGecko id', async () => {
    vi.stubGlobal('fetch', esplora({ [ADDRESS_A]: 50_000_000, [ADDRESS_B]: 25_000_000 }));
    const holdings = await bitcoinWalletSource.fetchHoldings(ctx([ADDRESS_A, ADDRESS_B]), WALLET_ACCOUNT_ID);
    expect(holdings).toEqual([expect.objectContaining({ symbol: 'BTC', quantity: '0.75', network: 'bitcoin', coingeckoId: 'bitcoin' })]);
  });

  it('refuses an invalid address before any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(bitcoinWalletSource.listExternalAccounts(ctx(['nope']))).rejects.toMatchObject({ code: 'invalid_response' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a rate limit from Esplora', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    await expect(bitcoinWalletSource.fetchHoldings(ctx([ADDRESS_A]), WALLET_ACCOUNT_ID)).rejects.toMatchObject({ code: 'rate_limited' });
  });
});

describe('bitcoin wallet sync', () => {
  beforeEach(async () => {
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('btc@example.test', 'Btc-Test-Key-2026!#xx', 'Btc');
    db.saveInstitutes([{ id: 'inst-l', ownerId: 'u', name: 'Ledger', type: 'wallet' } as never]);
    db.saveAccounts([{ id: 'acc-l', ownerId: 'u', instituteId: 'inst-l', name: 'Cold', type: 'crypto_spot', defaultCurrency: 'EUR', isActive: true } as never]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tracks the balance, then closes the position when the wallet is emptied', async () => {
    const connection = await connectionService.createConnection({
      sourceId: 'wallet_btc', label: 'Ledger', publicParams: { addresses: [ADDRESS_A] }, accountMap: { [WALLET_ACCOUNT_ID]: 'acc-l' },
    });
    vi.stubGlobal('fetch', esplora({ [ADDRESS_A]: 20_000_000 }));
    expect((await syncEngine.runSync(connection.id)).status).toBe('ok');
    const position = db.getPositions().find(p => p.accountId === 'acc-l');
    expect(position?.quantity).toBeCloseTo(0.2);
    // Priced by its CoinGecko id, never by a guess on the ticker
    expect(db.getInstrumentById(position?.instrumentId as string)?.marketIdentifier).toMatchObject({ network: 'bitcoin', coingeckoId: 'bitcoin' });

    vi.stubGlobal('fetch', esplora({ [ADDRESS_A]: 0 }));
    const report = await syncEngine.runSync(connection.id);
    expect(report.accounts[0].imported).toBeGreaterThan(0);
    expect(db.getPositions().filter(p => p.accountId === 'acc-l' && p.quantity > 0)).toHaveLength(0);
  });

  it('an empty wallet that never held bitcoin commits nothing', async () => {
    const connection = await connectionService.createConnection({
      sourceId: 'wallet_btc', label: 'Empty', publicParams: { addresses: [ADDRESS_A] }, accountMap: { [WALLET_ACCOUNT_ID]: 'acc-l' },
    });
    vi.stubGlobal('fetch', esplora({}));
    const report = await syncEngine.runSync(connection.id);
    expect(report.accounts[0].imported).toBe(0);
    expect(db.getImportBatches()).toHaveLength(0);
  });

  it('sums holdings of several provider accounts mapped to one account', () => {
    const merged = mergeHoldings([
      { externalAccountId: 'a', symbol: 'BTC', quantity: '0.5', avgCost: '20000', currency: 'EUR' },
      { externalAccountId: 'b', symbol: 'btc', quantity: '0.5', avgCost: '40000', currency: 'EUR' },
      { externalAccountId: 'b', symbol: 'ETH', quantity: '2', currency: 'EUR' },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ quantity: '1', avgCost: '30000' });
  });
});
