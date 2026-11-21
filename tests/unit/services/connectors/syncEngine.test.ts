/**
 * Sync engine (TGLA-221): a re-sync never duplicates, a sync batch rolls back like an import,
 * holdings only commit when they change, and credentials never leave the store unmasked.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { rollbackBatch } from '../../../../src/services/import/importManager';
import { connectionService } from '../../../../src/services/connectors/connectionService';
import { sourceRegistry } from '../../../../src/services/connectors/sourceRegistry';
import { syncEngine } from '../../../../src/services/connectors/syncEngine';
import { ConnectorError, type SourceAdapter } from '../../../../src/services/connectors/types';
import { guardrailsService } from '../../../../src/services/ai/guardrailsService';
import type { NormalizedActivity, NormalizedHolding } from '../../../../src/types/connections';

const activities: NormalizedActivity[] = [
  {
    externalAccountId: 'ext-1', externalId: 'act-1', date: '2026-03-02T10:00:00.000Z', type: 'BUY', rawType: 'BUY',
    isin: 'IE00B4L5Y983', symbol: 'IWDA.AS', name: 'iShares Core MSCI World', instrumentType: 'etf',
    quantity: '10', price: '90', amount: '-900', fee: '1', currency: 'EUR',
  },
  {
    externalAccountId: 'ext-1', externalId: 'act-2', date: '2026-04-02T10:00:00.000Z', type: 'BUY', rawType: 'BUY',
    isin: 'IE00B4L5Y983', symbol: 'IWDA.AS', name: 'iShares Core MSCI World', instrumentType: 'etf',
    quantity: '5', price: '92', amount: '-460', fee: '1', currency: 'EUR',
  },
];

let holdings: NormalizedHolding[] = [];
let failure: ConnectorError | null = null;

const fakeBroker: SourceAdapter = {
  id: 'snaptrade',
  transport: 'relay',
  capabilities: { holdings: true, history: true },
  credentialFields: ['clientId', 'consumerKey'],
  listExternalAccounts: async () => [{ externalId: 'ext-1', name: 'Broker account' }],
  fetchHoldings: async () => {
    if (failure) throw failure;
    return holdings;
  },
  fetchActivities: async (_ctx, _account, since) => {
    if (failure) throw failure;
    return activities.filter(a => !since || a.date >= since);
  },
};

const fakeWallet: SourceAdapter = {
  id: 'wallet_btc',
  transport: 'direct',
  capabilities: { holdings: true, history: false },
  credentialFields: [],
  listExternalAccounts: async () => [{ externalId: 'bc1-demo', name: 'Cold wallet' }],
  fetchHoldings: async () => holdings,
};

const seed = async (): Promise<void> => {
  localStorage.clear();
  await vaultService.resetVault();
  await new LocalAuthProvider().signUp('sync@example.test', 'Sync-Test-Key-2026!#xx', 'Sync');
  db.saveInstitutes([
    { id: 'inst-1', ownerId: 'u', name: 'Interactive Brokers', type: 'broker' } as never,
    { id: 'inst-2', ownerId: 'u', name: 'Ledger', type: 'wallet' } as never,
  ]);
  db.saveAccounts([
    { id: 'acc-1', ownerId: 'u', instituteId: 'inst-1', name: 'PEA', type: 'investment', defaultCurrency: 'EUR', isActive: true } as never,
    { id: 'acc-2', ownerId: 'u', instituteId: 'inst-2', name: 'Cold', type: 'crypto_spot', defaultCurrency: 'EUR', isActive: true } as never,
  ]);
};

const brokerConnection = () =>
  connectionService.createConnection({
    sourceId: 'snaptrade',
    label: 'SnapTrade',
    credentials: { clientId: 'CLIENT-ID-1234', consumerKey: 'consumer-secret-abcdef123456' },
    accountMap: { 'ext-1': 'acc-1' },
  });

describe('sync engine — history mode', () => {
  beforeEach(async () => {
    sourceRegistry.clear();
    sourceRegistry.register(fakeBroker);
    sourceRegistry.register(fakeWallet);
    holdings = [];
    failure = null;
    await seed();
  });

  it('commits the activities as API rows in one batch tagged with the connection', async () => {
    const connection = await brokerConnection();
    const report = await syncEngine.runSync(connection.id);

    expect(report.status).toBe('ok');
    expect(report.accounts[0].imported).toBe(2);
    const rows = db.getUnifiedTransactionsByAccount('acc-1');
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.sourceOrigin === 'API' && row.externalId?.startsWith('act-'))).toBe(true);
    const batch = db.getImportBatches().find(b => b.id === report.accounts[0].batchId);
    expect(batch?.metadata?.sourceId).toBe('snaptrade');
    expect(batch?.metadata?.connectionId).toBe(connection.id);
  });

  it('a second sync of the same activities adds nothing', async () => {
    const connection = await brokerConnection();
    await syncEngine.runSync(connection.id);
    const batchesAfterFirst = db.getImportBatches().length;

    const second = await syncEngine.runSync(connection.id);

    expect(second.status).toBe('ok');
    expect(second.accounts[0].imported).toBe(0);
    expect(second.accounts[0].skippedDuplicates).toBeGreaterThan(0);
    expect(db.getUnifiedTransactionsByAccount('acc-1')).toHaveLength(2);
    expect(db.getImportBatches()).toHaveLength(batchesAfterFirst);
  });

  it('keeps the incremental cursor on the latest activity', async () => {
    const connection = await brokerConnection();
    await syncEngine.runSync(connection.id);
    const stored = await connectionService.getConnection(connection.id);
    expect(stored?.cursor['ext-1']?.lastActivityDate).toBe('2026-04-02T10:00:00.000Z');
    expect(stored?.lastStatus).toBe('ok');
  });

  it('ignores activities before the history start date', async () => {
    const connection = await connectionService.createConnection({
      sourceId: 'snaptrade', label: 'From April', accountMap: { 'ext-1': 'acc-1' },
      credentials: { clientId: 'CLIENT-ID-1234', consumerKey: 'consumer-secret-abcdef123456' },
      historyStartDate: '2026-04-01T00:00:00.000Z',
    });
    const report = await syncEngine.runSync(connection.id);
    expect(report.accounts[0].imported).toBe(1);
  });

  it('a sync batch rolls back from the import history like a file import', async () => {
    const connection = await brokerConnection();
    const report = await syncEngine.runSync(connection.id);
    const result = await rollbackBatch(report.accounts[0].batchId as string);
    expect(result.success).toBe(true);
    expect(db.getUnifiedTransactionsByAccount('acc-1')).toHaveLength(0);
  });

  it('reports the provider holdings that the journal does not match', async () => {
    holdings = [{ externalAccountId: 'ext-1', isin: 'IE00B4L5Y983', symbol: 'IWDA.AS', quantity: '16', currency: 'EUR' }];
    const connection = await brokerConnection();
    const report = await syncEngine.runSync(connection.id);
    expect(report.accounts[0].drift).toEqual([
      { asset: 'IE00B4L5Y983', providerQuantity: '16', journalQuantity: '15' },
    ]);
  });

  it('an authentication failure is recorded and stops automatic retries', async () => {
    failure = new ConnectorError('auth_failed');
    const connection = await brokerConnection();
    const report = await syncEngine.runSync(connection.id);
    expect(report.status).toBe('auth_failed');
    const stored = await connectionService.getConnection(connection.id);
    expect(stored?.lastErrorCode).toBe('auth_failed');
    expect(syncEngine.isDue(stored!)).toBe(false);
    expect(db.getUnifiedTransactionsByAccount('acc-1')).toHaveLength(0);
  });

  it('a mapping to a deleted account asks for a new mapping', async () => {
    const connection = await connectionService.createConnection({
      sourceId: 'snaptrade', label: 'Stale', accountMap: { 'ext-1': 'acc-gone' },
    });
    const report = await syncEngine.runSync(connection.id);
    expect(report.status).toBe('needs_mapping');
  });
});

describe('sync engine — holdings mode', () => {
  beforeEach(async () => {
    sourceRegistry.clear();
    sourceRegistry.register(fakeWallet);
    failure = null;
    holdings = [{ externalAccountId: 'bc1-demo', symbol: 'BTC', name: 'Bitcoin', instrumentType: 'crypto', network: 'bitcoin', quantity: '0.5', avgCost: '40000', currency: 'EUR' }];
    await seed();
  });

  const walletConnection = () =>
    connectionService.createConnection({
      sourceId: 'wallet_btc', label: 'Ledger', publicParams: { addresses: ['bc1-demo'] }, accountMap: { 'bc1-demo': 'acc-2' },
    });

  it('reconciles the wallet balance as a snapshot, then commits nothing while it does not change', async () => {
    const connection = await walletConnection();
    expect(connection.mode).toBe('holdings');

    const first = await syncEngine.runSync(connection.id);
    expect(first.status).toBe('ok');
    expect(first.accounts[0].imported).toBeGreaterThan(0);
    const batches = db.getImportBatches().length;

    const second = await syncEngine.runSync(connection.id);
    expect(second.accounts[0].imported).toBe(0);
    expect(db.getImportBatches()).toHaveLength(batches);
  });

  it('never closes positions on an empty answer', async () => {
    const connection = await walletConnection();
    await syncEngine.runSync(connection.id);
    const rows = db.getUnifiedTransactionsByAccount('acc-2').length;

    holdings = [];
    const report = await syncEngine.runSync(connection.id);
    expect(report.accounts[0].imported).toBe(0);
    expect(db.getUnifiedTransactionsByAccount('acc-2')).toHaveLength(rows);
  });
});

describe('connection store', () => {
  beforeEach(async () => {
    await seed();
  });

  it('masks credentials everywhere but the engine accessor', async () => {
    const connection = await brokerConnection();
    expect(JSON.stringify(connection)).not.toContain('consumer-secret-abcdef123456');
    expect(connection.credentialPreviews.consumerKey).toBe('••••••••3456');
    expect((await connectionService.getCredentials(connection.id)).consumerKey).toBe('consumer-secret-abcdef123456');
    expect(JSON.stringify(connectionService.exportMetadata())).not.toContain('consumer-secret');
  });

  it('the AI guardrails redact stored credentials from outgoing text', async () => {
    await brokerConnection();
    const out = guardrailsService.redactSensitiveExfiltrations('my key is consumer-secret-abcdef123456 ok');
    expect(out).not.toContain('consumer-secret-abcdef123456');
  });

  it('deleting an account detaches it from the connections', async () => {
    const connection = await brokerConnection();
    await connectionService.detachAccount('acc-1');
    expect((await connectionService.getConnection(connection.id))?.accountMap).toEqual({});
  });

  it('a due connection is one never synced or past its interval', () => {
    const now = Date.parse('2026-05-02T12:00:00.000Z');
    expect(syncEngine.isDue({ lastStatus: 'never_synced', syncIntervalHours: 24 }, now)).toBe(true);
    expect(syncEngine.isDue({ lastStatus: 'ok', syncIntervalHours: 24, lastSyncAt: '2026-05-02T00:00:00.000Z' }, now)).toBe(false);
    expect(syncEngine.isDue({ lastStatus: 'ok', syncIntervalHours: 24, lastSyncAt: '2026-05-01T11:00:00.000Z' }, now)).toBe(true);
  });
});
