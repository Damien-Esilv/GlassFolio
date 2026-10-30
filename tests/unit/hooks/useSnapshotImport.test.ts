/**
 * useSnapshotImport: the review of the assets of a snapshot (same corrections as a history import).
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../src/services/db';
import { vaultService } from '../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../src/services/security/authService';
import { useSnapshotImport } from '../../../src/hooks/useSnapshotImport';
import { parseCSVText } from '../../../src/services/import/importManager';
import { clearSnapshotInstruments } from '../../../src/services/import/snapshotService';
import { InstrumentValidationError } from '../../../src/services/instrumentService';

const CSV = fs.readFileSync(path.join(process.cwd(), 'test-data', 'bitget_snapshot.csv'), 'utf8');
const { headers, rows } = parseCSVText(CSV);

describe('useSnapshotImport asset review', () => {
  beforeEach(async () => {
    clearSnapshotInstruments();
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('snaphook@example.test', 'SnapHook-Test-Key-2026!#xx', 'Hook');
    db.saveInstitutes([{ id: 'inst-1', ownerId: 'u', name: 'Bitget', type: 'exchange' } as never]);
    db.saveAccounts([{ id: 'acc-1', ownerId: 'u', instituteId: 'inst-1', name: 'Account B', type: 'investment', defaultCurrency: 'EUR', isActive: true } as never]);
  });

  const setup = async () => {
    const hook = renderHook(() => useSnapshotImport('acc-1', CSV, headers, rows.slice(0, 5), 'u', 'snap.csv'));
    await act(async () => { await hook.result.current.analyzeAndPreview(); });
    return hook.result;
  };

  it('shows the assets of the file in the preview, as drafts', async () => {
    const result = await setup();

    expect(result.current.step).toBe('preview');
    expect(result.current.instruments).toHaveLength(10);
    expect(result.current.instruments.every(i => i.isNew && i.instrument.type === 'crypto')).toBe(true);
    expect(db.getInstruments()).toHaveLength(0);
  });

  it('edits a draft, refuses an invalid edit, and persists the assets only when the import is confirmed', async () => {
    const result = await setup();
    const near = result.current.instruments.find(i => i.instrument.marketIdentifier.symbol === 'NEAR')!.instrument;

    expect(result.current.previewInstrumentIssues(near.id, { isin: 'bad' }).some(i => i.code === 'INSTRUMENT_ISIN_INVALID')).toBe(true);
    await expect(act(async () => { await result.current.updateInstrument(near.id, { isin: 'bad' }); })).rejects.toBeInstanceOf(InstrumentValidationError);

    await act(async () => { await result.current.updateInstrument(near.id, { type: 'other', name: 'NEAR (by hand)' }); });
    expect(result.current.instruments.find(i => i.instrument.id === near.id)?.instrument).toMatchObject({ type: 'other', name: 'NEAR (by hand)' });
    expect(db.getInstruments()).toHaveLength(0);

    await act(async () => { await result.current.commitImport(); });

    expect(result.current.step).toBe('complete');
    expect(db.getInstruments().find(i => i.marketIdentifier.symbol === 'NEAR')).toMatchObject({ type: 'other', name: 'NEAR (by hand)' });
    expect(db.getPositions().find(p => p.symbol === 'NEAR')?.type).toBe('Other');
  });

  it('reset forgets the drafts', async () => {
    const result = await setup();
    act(() => { result.current.reset(); });
    await act(async () => { await result.current.analyzeAndPreview(); });
    expect(db.getInstruments()).toHaveLength(0);
  });
});
