/**
 * SnapTrade Personal source (TGLA-221): requests signed in the browser exactly as the docs describe,
 * listings priced by their Yahoo symbol, activities mapped to the journal, and a full sync that never
 * duplicates. Every network answer is mocked (the relay is the only URL called).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { connectionService, syncEngine } from '../../../../src/services/connectors';
import { mapActivity, marketSymbol, signRequest, snaptradeSource } from '../../../../src/services/connectors/sources/snaptrade';
import { canonicalJson } from '../../../../src/services/security/requestSigning';

const CLIENT_ID = 'GLASSFOLIO-TEST';
const CONSUMER_KEY = 'test-consumer-key-0123456789';
const ctx = { connectionId: 'c', credentials: { clientId: CLIENT_ID, consumerKey: CONSUMER_KEY }, publicParams: {} };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

interface RelayCall { provider: string; method: string; path: string; query: string; headers: { Signature: string } }

const activity = (id: string, type: string, date: string, extra: Record<string, unknown> = {}) => ({
  id, type, trade_date: date, units: 0, price: 0, amount: 0, fee: 0, currency: { code: 'EUR' }, description: type, ...extra,
});

const CW8 = { symbol: 'CW8', raw_symbol: 'CW8', description: 'Amundi MSCI World', exchange: { code: 'XPAR', mic_code: 'XPAR' }, type: { code: 'et' } };

const ACTIVITIES = [
  activity('a1', 'CONTRIBUTION', '2026-01-05T09:00:00.000Z', { amount: 1000 }),
  activity('a2', 'BUY', '2026-01-06T10:00:00.000Z', { symbol: CW8, units: 2, price: 450, amount: -900, fee: 1.5 }),
  activity('a3', 'DIVIDEND', '2026-03-01T00:00:00.000Z', { symbol: CW8, amount: 3.2 }),
  activity('a4', 'SELL', '2026-04-01T10:00:00.000Z', { symbol: CW8, units: -1, price: 470, amount: 468.5, fee: 1.5 }),
  activity('a5', 'SPLIT', '2026-05-01T00:00:00.000Z', { symbol: CW8, units: 1 }),
];

/** Relay mock serving SnapTrade answers, recording each signed call. */
const relay = (calls: RelayCall[], overrides: { status?: number } = {}) =>
  vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toBe('/api/connector-relay');
    const call = JSON.parse(init?.body as string) as RelayCall;
    calls.push(call);
    if (overrides.status) return json({ detail: 'nope' }, overrides.status);
    if (call.path === '/accounts/all') {
      return json({ results: [
        { kind: 'investment', id: 'ibkr-pea', display_name: 'IBKR PEA', masked_account_number: '****1234', net_value: { currency: 'EUR' } },
        { kind: 'deposit', id: 'cash-1', display_name: 'Checking' },
        { kind: 'crypto', id: 'binance-1', display_name: 'Binance' },
      ] });
    }
    if (call.path.endsWith('/positions/all')) {
      return json({ data_freshness: { as_of: '2026-05-02T00:00:00.000Z' }, results: [
        { instrument: { kind: 'etf', symbol: 'CW8', raw_symbol: 'CW8', description: 'Amundi MSCI World', currency: 'EUR', exchange: 'XPAR' }, units: '1', price: '480', cost_basis: '450', currency: 'EUR' },
        { instrument: { kind: 'crypto', symbol: 'BTC', raw_symbol: 'BTC', currency: 'USD' }, units: '0.01', cost_basis: '60000', currency: 'USD' },
        { instrument: { kind: 'option', symbol: 'AAPL 250117C00150000' }, units: '1' },
      ] });
    }
    if (call.path.endsWith('/activities')) {
      const params = new URLSearchParams(call.query);
      const start = params.get('startDate');
      const rows = ACTIVITIES.filter(row => !start || row.trade_date >= start);
      return json({ data: rows, pagination: { offset: 0, limit: 1000, total: rows.length } });
    }
    return json({}, 404);
  });

describe('SnapTrade request signing', () => {
  it('signs the canonical {content, path, query} with HMAC-SHA256, like the docs', async () => {
    const query = `clientId=${CLIENT_ID}&timestamp=1715123456`;
    expect(canonicalJson({ path: '/symbols', query, content: { substring: 'AAPL' } }))
      .toBe(`{"content":{"substring":"AAPL"},"path":"/symbols","query":"${query}"}`);
    const expected = createHmac('sha256', CONSUMER_KEY)
      .update(`{"content":null,"path":"/accounts/all","query":"${query}"}`)
      .digest('base64');
    expect(await signRequest(CONSUMER_KEY, '/accounts/all', query)).toBe(expected);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends clientId and timestamp in the query, the signature in a header, never the consumer key', async () => {
    const calls: RelayCall[] = [];
    vi.stubGlobal('fetch', relay(calls));
    const accounts = await snaptradeSource.listExternalAccounts(ctx);

    // Bank-side accounts are left out; any other kind (a crypto exchange here) is offered
    expect(accounts).toEqual([
      { externalId: 'ibkr-pea', name: 'IBKR PEA ****1234', currency: 'EUR' },
      { externalId: 'binance-1', name: 'Binance', currency: undefined },
    ]);
    const [call] = calls;
    expect(call).toMatchObject({ provider: 'snaptrade', method: 'GET', path: '/accounts/all' });
    expect(call.query).toMatch(new RegExp(`^clientId=${CLIENT_ID}&timestamp=\\d{10}$`));
    expect(call.headers.Signature).toBe(createHmac('sha256', CONSUMER_KEY)
      .update(canonicalJson({ content: null, path: call.path, query: call.query })).digest('base64'));
    expect(JSON.stringify(call)).not.toContain(CONSUMER_KEY);
  });

  it('refuses to call without keys, and reports refused keys', async () => {
    await expect(snaptradeSource.listExternalAccounts({ ...ctx, credentials: {} })).rejects.toMatchObject({ code: 'auth_failed' });
    vi.stubGlobal('fetch', relay([], { status: 401 }));
    await expect(snaptradeSource.listExternalAccounts(ctx)).rejects.toMatchObject({ code: 'auth_failed' });
  });
});

describe('SnapTrade mapping', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('turns a listing into its Yahoo symbol', () => {
    expect(marketSymbol('CW8', 'XPAR')).toBe('CW8.PA');
    expect(marketSymbol('IWDA', 'XAMS')).toBe('IWDA.AS');
    expect(marketSymbol('AAPL', 'XNAS')).toBe('AAPL');
    expect(marketSymbol('VAB.TO', 'XTSE')).toBe('VAB.TO');
    expect(marketSymbol('XYZ', 'UNKNOWN')).toBe('XYZ');
  });

  it('reads positions with their cost, prices crypto by CoinGecko id, skips derivatives', async () => {
    vi.stubGlobal('fetch', relay([]));
    const holdings = await snaptradeSource.fetchHoldings(ctx, 'ibkr-pea');
    expect(holdings).toEqual([
      expect.objectContaining({ symbol: 'CW8.PA', instrumentType: 'etf', quantity: '1', avgCost: '450', currency: 'EUR' }),
      expect.objectContaining({ symbol: 'BTC', instrumentType: 'crypto', coingeckoId: 'bitcoin', quantity: '0.01' }),
    ]);
  });

  it('maps activities to the journal vocabulary', () => {
    const [deposit, buy, dividend, sell, split] = ACTIVITIES.map(row => mapActivity(row as never, 'ibkr-pea'));
    expect(deposit).toMatchObject({ type: 'DEPOSIT', subType: 'FIAT_DEPOSIT', amount: '1000', currency: 'EUR', symbol: undefined });
    expect(buy).toMatchObject({ type: 'BUY', symbol: 'CW8.PA', instrumentType: 'etf', quantity: '2', price: '450', amount: '-900', fee: '1.5', externalId: 'snaptrade:a2' });
    expect(dividend).toMatchObject({ type: 'INCOME', subType: 'DIVIDEND', amount: '3.2' });
    expect(sell).toMatchObject({ type: 'SELL', quantity: '1', amount: '468.5' });
    expect(split).toBeNull();
  });
});

describe('SnapTrade sync', () => {
  beforeEach(async () => {
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('snaptrade@example.test', 'Snap-Trade-Key-2026!#xx', 'Snap');
    db.saveInstitutes([{ id: 'inst-ibkr', ownerId: 'u', name: 'Interactive Brokers', type: 'broker' } as never]);
    db.saveAccounts([{ id: 'acc-pea', ownerId: 'u', instituteId: 'inst-ibkr', name: 'PEA', type: 'investment', defaultCurrency: 'EUR', isActive: true, wrapperType: 'PEA' } as never]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('imports the history once, as API rows, and a second sync adds nothing', async () => {
    const calls: RelayCall[] = [];
    vi.stubGlobal('fetch', relay(calls));
    const connection = await connectionService.createConnection({
      sourceId: 'snaptrade', label: 'SnapTrade', credentials: { clientId: CLIENT_ID, consumerKey: CONSUMER_KEY },
      accountMap: { 'ibkr-pea': 'acc-pea' }, mode: 'history',
    });

    const first = await syncEngine.runSync(connection.id);
    expect(first.status).toBe('ok');
    expect(first.accounts[0].imported).toBe(4);
    const rows = db.getUnifiedTransactionsByAccount('acc-pea');
    expect(rows.every(row => row.sourceOrigin === 'API')).toBe(true);
    // Journal after BUY 2, SELL 1 = 1 CW8.PA, like the broker: no difference reported
    expect(first.accounts[0].drift.filter(item => item.asset === 'CW8.PA')).toEqual([]);

    const second = await syncEngine.runSync(connection.id);
    expect(second.accounts[0].imported).toBe(0);
    expect(db.getUnifiedTransactionsByAccount('acc-pea')).toHaveLength(4);
  });

  it('starts at the chosen date for an account that already holds imported rows', async () => {
    vi.stubGlobal('fetch', relay([]));
    const connection = await connectionService.createConnection({
      sourceId: 'snaptrade', label: 'SnapTrade', credentials: { clientId: CLIENT_ID, consumerKey: CONSUMER_KEY },
      accountMap: { 'ibkr-pea': 'acc-pea' }, mode: 'history',
      cursor: { 'ibkr-pea': { lastActivityDate: '2026-03-01T00:00:00.000Z' } },
    });
    const report = await syncEngine.runSync(connection.id);
    expect(report.accounts[0].imported).toBe(2);
  });

  it('records refused keys and stops syncing on its own', async () => {
    vi.stubGlobal('fetch', relay([], { status: 403 }));
    const connection = await connectionService.createConnection({
      sourceId: 'snaptrade', label: 'SnapTrade', credentials: { clientId: CLIENT_ID, consumerKey: CONSUMER_KEY },
      accountMap: { 'ibkr-pea': 'acc-pea' }, mode: 'history',
    });
    const report = await syncEngine.runSync(connection.id);
    expect(report.status).toBe('auth_failed');
    expect(syncEngine.isDue((await connectionService.getConnection(connection.id))!)).toBe(false);
  });

  it('suggests starting the day after the last imported row', () => {
    db.saveUnifiedTransactions([{ id: 't1', accountId: 'acc-pea', transactionDate: '2026-02-10T12:00:00.000Z' } as never]);
    expect(connectionService.suggestStartDate('acc-pea')).toBe('2026-02-11');
    expect(connectionService.suggestStartDate('acc-empty')).toBe('');
  });

  it('lists the accounts again with the stored keys, to change where each one goes', async () => {
    const calls: RelayCall[] = [];
    vi.stubGlobal('fetch', relay(calls));
    const connection = await connectionService.createConnection({
      sourceId: 'snaptrade', label: 'SnapTrade', credentials: { clientId: CLIENT_ID, consumerKey: CONSUMER_KEY },
      accountMap: { 'ibkr-pea': 'acc-pea' }, mode: 'history',
    });
    const accounts = await syncEngine.listExternalAccounts(connection.id);
    expect(accounts.map(account => account.externalId)).toEqual(['ibkr-pea', 'binance-1']);
    expect(calls[0].query).toContain(`clientId=${CLIENT_ID}`);
  });

  it('a newly linked account gets its own start date, the others keep their cursor', async () => {
    const connection = await connectionService.createConnection({
      sourceId: 'snaptrade', label: 'SnapTrade', credentials: { clientId: CLIENT_ID, consumerKey: CONSUMER_KEY },
      accountMap: { 'ibkr-pea': 'acc-pea' }, mode: 'history',
      cursor: { 'ibkr-pea': { lastActivityDate: '2026-04-01T10:00:00.000Z' } },
    });
    const updated = await connectionService.updateConnection(connection.id, {
      accountMap: { 'ibkr-pea': 'acc-pea', 'binance-1': 'acc-pea' },
      cursor: { 'binance-1': { lastActivityDate: '2026-05-01T00:00:00.000Z' } },
      publicParams: { accountNames: { 'ibkr-pea': 'IBKR PEA', 'binance-1': 'Binance' } },
    });
    expect(updated.cursor).toEqual({
      'ibkr-pea': { lastActivityDate: '2026-04-01T10:00:00.000Z' },
      'binance-1': { lastActivityDate: '2026-05-01T00:00:00.000Z' },
    });
    expect(updated.publicParams.accountNames?.['binance-1']).toBe('Binance');
  });
});
