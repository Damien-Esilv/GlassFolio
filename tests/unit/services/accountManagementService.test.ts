/**
 * Institutions & accounts management: listing with what feeds each account, renaming, and deleting with every
 * operation recorded in it. An account fed by a sync is never deleted here (its connection would point nowhere).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../src/services/db';
import { vaultService } from '../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../src/services/security/authService';
import { connectionService } from '../../../src/services/connectors/connectionService';
import { accountManagementService } from '../../../src/services/accountManagementService';

const row = (id: string, accountId: string, batchId: string) => ({
  id, ownerId: 'u', accountId, instrumentId: '', batchId, rowHash: `h-${id}`,
  sourceOrigin: 'FILE', isSynthetic: false, isFiscal: true, sourceMode: 'history',
  transactionDate: '2024-01-08T00:00:00.000Z', type: 'BUY', rawType: 'BUY', rawLabel: '',
  amountPrimary: '100', assetSymbol: 'AAPL', quantity: '1', priceUnit: '100',
  createdAt: '2024-01-08T00:00:00.000Z', updatedAt: '2024-01-08T00:00:00.000Z', version: 1,
}) as never;

beforeEach(async () => {
  localStorage.clear();
  await vaultService.resetVault();
  await new LocalAuthProvider().signUp('accounts@example.test', 'Accounts-Test-Key-2026!#xx', 'Accounts');
  db.saveInstitutes([
    { id: 'inst-bourso', ownerId: 'u', name: 'BoursoBank', type: 'bank' } as never,
    { id: 'inst-old', ownerId: 'u', name: 'Old broker', type: 'broker' } as never,
  ]);
  db.saveAccounts([
    { id: 'acc-pea', ownerId: 'u', instituteId: 'inst-bourso', name: 'PEA', type: 'investment', wrapperType: 'PEA', defaultCurrency: 'EUR', isActive: true } as never,
    { id: 'acc-cto', ownerId: 'u', instituteId: 'inst-old', name: 'CTO', type: 'investment', wrapperType: 'CTO', defaultCurrency: 'EUR', isActive: true } as never,
  ]);
  db.saveUnifiedTransactions([row('t1', 'acc-cto', 'batch-cto'), row('t2', 'acc-cto', 'manual'), row('t3', 'acc-pea', 'batch-pea')]);
  await connectionService.createConnection({ sourceId: 'woob', label: 'BoursoBank', publicParams: { module: 'boursorama' }, accountMap: { 'ext-pea': 'acc-pea' } });
});

describe('accountManagementService', () => {
  it('lists institutions with their accounts, operations and the sync that feeds them', async () => {
    const list = await accountManagementService.listInstitutions();
    expect(list.map(item => item.name)).toEqual(['BoursoBank', 'Old broker']);
    expect(list[0].accounts[0]).toMatchObject({ name: 'PEA', operations: 1, syncedBy: { label: 'BoursoBank', sourceId: 'woob' } });
    expect(list[1].accounts[0]).toMatchObject({ name: 'CTO', operations: 2, syncedBy: null });
  });

  it('renames an institution and an account, never to an empty name', async () => {
    expect(await accountManagementService.renameInstitution('inst-old', '  Degiro ')).toEqual({ success: true });
    expect(await accountManagementService.renameAccount('acc-cto', 'CTO Degiro')).toEqual({ success: true });
    expect(await accountManagementService.renameAccount('acc-cto', '   ')).toEqual({ success: false, error: 'empty_name' });
    expect(db.getInstitutes().find(item => item.id === 'inst-old')?.name).toBe('Degiro');
    expect(db.getAccounts().find(item => item.id === 'acc-cto')?.name).toBe('CTO Degiro');
    // Every screen reads the positions: they carry the new names at once
    const position = db.getPositions().find(item => item.accountId === 'acc-cto');
    expect(position).toMatchObject({ bankName: 'Degiro', accountName: 'CTO Degiro' });
  });

  it('deletes an account with every operation recorded in it, batched or not', async () => {
    const result = await accountManagementService.deleteAccount('acc-cto');
    expect(result).toEqual({ success: true, operations: 2 });
    expect(db.getAccounts().map(item => item.id)).toEqual(['acc-pea']);
    expect(db.getUnifiedTransactions().map(item => item.id)).toEqual(['t3']);
  });

  it('refuses to delete an account a sync feeds, or its institution', async () => {
    expect(await accountManagementService.deleteAccount('acc-pea')).toEqual({ success: false, error: 'synced' });
    expect(await accountManagementService.deleteInstitution('inst-bourso')).toEqual({ success: false, error: 'synced' });
    expect(db.getUnifiedTransactions()).toHaveLength(3);
  });

  it('deletes an institution with its accounts and their operations', async () => {
    expect(await accountManagementService.deleteInstitution('inst-old')).toEqual({ success: true, operations: 2 });
    expect(db.getInstitutes().map(item => item.id)).toEqual(['inst-bourso']);
    expect(db.getAccounts().map(item => item.id)).toEqual(['acc-pea']);
  });
});
