/**
 * Snapshot import: same asset review and classification as a history import.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { transactionManager } from '../../../../src/services/core/transactionManager';
import { matchSnapshotColumns } from '../../../../src/services/import/columnMatcher';
import { parseCSVText } from '../../../../src/services/import/importManager';
import {
  parseSnapshotFile, stageSnapshotInstruments, describeSnapshotInstruments, clearSnapshotInstruments, commitSnapshotImport,
  type SnapshotFieldMappings,
} from '../../../../src/services/import/snapshotService';
import { updateStagedInstrument } from '../../../../src/services/import/instrumentDrafts';

const CSV = fs.readFileSync(path.join(process.cwd(), 'test-data', 'bitget_snapshot.csv'), 'utf8');

/** An account typed "securities" but held at a crypto exchange: the case that used to misclassify. */
const seed = async (instituteType = 'exchange', accountType = 'investment'): Promise<void> => {
  localStorage.clear();
  await vaultService.resetVault();
  await new LocalAuthProvider().signUp('snap@example.test', 'Snap-Test-Key-2026!#xx', 'Snap');
  db.saveInstitutes([{ id: 'inst-1', ownerId: 'u', name: 'Bitget', type: instituteType } as never]);
  db.saveAccounts([{ id: 'acc-1', ownerId: 'u', instituteId: 'inst-1', name: 'Account B', type: accountType, defaultCurrency: 'EUR', isActive: true } as never]);
};

const parsed = async () => {
  const mappings = matchSnapshotColumns(parseCSVText(CSV).headers) as SnapshotFieldMappings;
  const res = await parseSnapshotFile(CSV, mappings);
  return res.positions.filter(p => p.status === 'valid').map(p => p.position);
};

const commit = (positions: Awaited<ReturnType<typeof parsed>>) =>
  commitSnapshotImport({ mode: 'replace', positions, accountId: 'acc-1', userId: 'u', closeMissing: false, rawContent: CSV, fileName: 'snap.csv', totalRows: positions.length });

describe('snapshot asset review', () => {
  beforeEach(async () => {
    clearSnapshotInstruments();
    await seed();
  });

  it('lists the assets of the file as drafts, classified by where they are held, and creates nothing yet', async () => {
    const positions = await parsed();
    const summaries = await stageSnapshotInstruments(positions, 'acc-1');

    expect(summaries).toHaveLength(10);
    expect(summaries.every(s => s.isNew && s.instrument.type === 'crypto' && s.instrument.marketIdentifier.exchange === 'Bitget')).toBe(true);
    expect(db.getInstruments()).toHaveLength(0);
  });

  it('confirming persists the drafts with their edits; the positions are crypto, valued from the snapshot', async () => {
    const positions = await parsed();
    const summaries = await stageSnapshotInstruments(positions, 'acc-1');
    const near = summaries.find(s => s.instrument.marketIdentifier.symbol === 'NEAR')!.instrument;
    updateStagedInstrument(near.id, { name: 'NEAR Protocol' });

    const res = await commit(positions);

    expect(res.success).toBe(true);
    expect(db.getInstruments()).toHaveLength(10);
    expect(db.getInstruments().find(i => i.marketIdentifier.symbol === 'NEAR')?.name).toBe('NEAR Protocol');
    const nearPosition = db.getPositions().find(p => p.symbol === 'NEAR');
    expect(nearPosition).toMatchObject({ type: 'Crypto', quantity: 100, avgCost: 5.1 });
  });

  it('an asset reclassified in the review is filed under that class (here "Other", priced by hand)', async () => {
    const positions = await parsed();
    const summaries = await stageSnapshotInstruments(positions, 'acc-1');
    updateStagedInstrument(summaries.find(s => s.instrument.marketIdentifier.symbol === 'XRP')!.instrument.id, { type: 'other' });

    await commit(positions);

    expect(db.getPositions().find(p => p.symbol === 'XRP')?.type).toBe('Other');
    expect(db.getPositions().find(p => p.symbol === 'BTC')?.type).toBe('Crypto');
  });

  it('cancelling leaves no instrument behind, and a failed commit takes back what it added', async () => {
    const positions = await parsed();
    await stageSnapshotInstruments(positions, 'acc-1');
    clearSnapshotInstruments();
    expect(db.getInstruments()).toHaveLength(0);

    await stageSnapshotInstruments(positions, 'acc-1');
    vi.spyOn(transactionManager, 'commit').mockReturnValueOnce({ success: false, transactionCount: 0, batchId: null, error: 'boom' });
    expect((await commit(positions)).success).toBe(false);
    transactionManager.rollback();
    vi.restoreAllMocks();

    expect(db.getInstruments()).toHaveLength(0);
  });

  it('an import that was not reviewed (AI tool) still creates its assets, with the same classification', async () => {
    const positions = await parsed();

    expect((await commit(positions)).success).toBe(true);

    expect(db.getInstruments().every(i => i.type === 'crypto')).toBe(true);
    expect(describeSnapshotInstruments(positions)).toEqual([]);
  });

  it('a securities account at a broker keeps the offline rules (no lookup in tests): only known coins are crypto', async () => {
    await seed('broker', 'investment');
    const positions = await parsed();
    const summaries = await stageSnapshotInstruments(positions, 'acc-1');
    const typeOf = (symbol: string) => summaries.find(s => s.instrument.marketIdentifier.symbol === symbol)?.instrument.type;

    expect(typeOf('BTC')).toBe('crypto');
    expect(typeOf('NEAR')).toBe('stock');
  });
});
