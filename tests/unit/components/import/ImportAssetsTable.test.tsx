import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../../../src/i18n';
import { ImportAssetsTable } from '../../../../src/components/import/ImportAssetsTable';
import { InstrumentValidationError } from '../../../../src/services/instrumentService';
import type { Instrument } from '../../../../src/types';
import type { ImportInstrumentSummary } from '../../../../src/services/import/importManager';

const instrument = (id: string, symbol: string, over: Partial<Instrument> = {}): Instrument => ({
  id, ownerId: 'u', name: symbol, type: 'stock', marketIdentifier: { symbol }, isMarketReady: false,
  denominationCurrency: 'EUR', createdAt: '', updatedAt: '', ...over,
});
const summaries: ImportInstrumentSummary[] = [
  { instrument: instrument('d1', 'NEAR'), isNew: true, rowCount: 2 },
  { instrument: instrument('i2', 'BTC', { type: 'crypto', isMarketReady: true, marketIdentifier: { symbol: 'BTC', exchange: 'Bitget' } }), isNew: false, rowCount: 1 },
];

describe('ImportAssetsTable', () => {
  it('lists the assets with their type, status and number of rows', () => {
    render(<ImportAssetsTable instruments={summaries} onUpdate={vi.fn()} preview={() => []} />);
    expect(screen.getByText('NEAR')).toBeDefined();
    expect(screen.getByText('New asset')).toBeDefined();
    expect(screen.getByText('Already in your portfolio')).toBeDefined();
    expect((screen.getByLabelText('Type NEAR') as HTMLSelectElement).value).toBe('stock');
    expect((screen.getByLabelText('Type BTC') as HTMLSelectElement).value).toBe('crypto');
  });

  it('renders nothing for an import without assets', () => {
    const { container } = render(<ImportAssetsTable instruments={[]} onUpdate={vi.fn()} preview={() => []} />);
    expect(container.firstChild).toBeNull();
  });

  it('changes the type of an asset in one click', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(<ImportAssetsTable instruments={summaries} onUpdate={onUpdate} preview={() => []} />);
    fireEvent.change(screen.getByLabelText('Type NEAR'), { target: { value: 'crypto' } });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('d1', { type: 'crypto' }));
  });

  it('edits every detail and applies the patch', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(<ImportAssetsTable instruments={summaries} onUpdate={onUpdate} preview={() => []} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit details NEAR' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'NEAR Protocol' } });
    fireEvent.change(screen.getByLabelText('Network (crypto)'), { target: { value: 'near' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('d1', expect.objectContaining({ name: 'NEAR Protocol', network: 'near', symbol: 'NEAR' }), undefined));
  });

  it('shows why an edit is refused and offers to merge a duplicate', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const preview = (_id: string, patch: { symbol?: string }) =>
      patch.symbol === 'BTC' ? [{ code: 'INSTRUMENT_DUPLICATE' as const, field: 'symbol' as const, severity: 'error' as const, params: { id: 'i2', name: 'BTC', symbol: 'BTC' } }] : [];
    render(<ImportAssetsTable instruments={summaries} onUpdate={onUpdate} preview={preview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit details NEAR' }));
    fireEvent.change(screen.getByLabelText('Symbol / ticker'), { target: { value: 'BTC' } });

    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Merge into BTC/ }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('d1', expect.objectContaining({ symbol: 'BTC' }), 'i2'));
  });

  it('keeps the editor open with the reasons when the service refuses', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new InstrumentValidationError([{ code: 'INSTRUMENT_ISIN_INVALID', field: 'isin', severity: 'error' }]));
    render(<ImportAssetsTable instruments={summaries} onUpdate={onUpdate} preview={() => []} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit details NEAR' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText(/The ISIN is not valid/)).toBeDefined();
  });
});
