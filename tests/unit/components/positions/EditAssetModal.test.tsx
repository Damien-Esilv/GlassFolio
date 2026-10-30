import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '../../../../src/i18n';

vi.mock('../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { EditAssetModal } from '../../../../src/components/positions/EditAssetModal';
import type { Instrument, Position } from '../../../../src/types';

const instrument = (id: string, symbol: string, over: Partial<Instrument> = {}): Instrument => ({
  id, ownerId: 'u', name: symbol, type: 'stock', marketIdentifier: { symbol }, isMarketReady: false,
  denominationCurrency: 'EUR', createdAt: '', updatedAt: '', ...over,
});
const position = (over: Partial<Position> = {}): Position => ({
  id: 'pos-1', instrumentId: 'i1', instrument: 'NEAR', symbol: 'NEAR', quantity: 100, avgCost: 5.11, lastPrice: 5.1,
  marketValue: 510, unrealizedPL: -1, unrealizedPLPercent: -0.1, currency: 'EUR', type: 'Equity', source: 'Bitget', ...over,
});

describe('EditAssetModal', () => {
  beforeEach(async () => {
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('modal@example.test', 'Modal-Test-Key-2026!#xx', 'Modal');
    db.saveInstruments([instrument('i1', 'NEAR'), instrument('i2', 'NEARX', { type: 'crypto', marketIdentifier: { symbol: 'NEARX', exchange: 'Bitget' } })]);
  });

  it('lets the user turn NEAR into a crypto and saves it', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<EditAssetModal position={position()} onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText('Asset type'), { target: { value: 'crypto' } });
    fireEvent.change(screen.getByLabelText('Exchange'), { target: { value: 'Bitget' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save asset' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(db.getInstrumentById('i1')).toMatchObject({ type: 'crypto', marketIdentifier: { symbol: 'NEAR', exchange: 'Bitget' } });
  });

  it('blocks a malformed ISIN and says why', () => {
    render(<EditAssetModal position={position()} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('ISIN'), { target: { value: 'nope' } });
    expect(screen.getByText(/The ISIN is not valid/)).toBeDefined();
    expect((screen.getByRole('button', { name: 'Save asset' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers to merge into an existing duplicate instead of saving a second copy', async () => {
    const onSaved = vi.fn();
    render(<EditAssetModal position={position()} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText('Symbol / ticker'), { target: { value: 'NEARX' } });

    expect((screen.getByRole('button', { name: 'Save asset' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Merge into NEARX/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(db.getInstruments().map(i => i.id)).toEqual(['i2']);
  });

  it('tells that an "Other" asset has no price tracker', () => {
    render(<EditAssetModal position={position()} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Asset type'), { target: { value: 'other' } });
    expect(screen.getAllByText(/No price tracker/).length).toBeGreaterThan(0);
  });

  it('only offers the price when the position is not linked to an asset record', () => {
    render(<EditAssetModal position={position({ instrumentId: undefined, symbol: 'GHOST', instrument: 'Ghost' })} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText('Asset type')).toBeNull();
    expect(screen.getByText(/not linked to an asset record/)).toBeDefined();
  });
});
