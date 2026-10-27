/**
 * Column mapping table + mapped preview (TGLA-151)
 * A non-expert must see what is matched, what needs a look, what the cells contain, and how
 * the first rows will be stored.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
}));
vi.mock('../../../../src/i18n', () => ({ default: { t: (key: string) => key } }));

import ColumnMappingTable from '../../../../src/components/import/ColumnMappingTable';
import MappedPreview from '../../../../src/components/import/MappedPreview';
import type { MappingColumn, MappingSummary } from '../../../../src/hooks/importHooks';

const column = (overrides: Partial<MappingColumn> & { header: string; index: number }): MappingColumn => ({
  samples: ['a', 'b', 'c'],
  field: null,
  extraFields: [],
  status: 'unmatched',
  suggestion: null,
  alternatives: [],
  ...overrides,
});

const summaryOf = (columns: MappingColumn[]): MappingSummary => ({
  total: columns.length,
  matched: columns.filter(c => c.status === 'matched').length,
  ambiguous: columns.filter(c => c.status === 'ambiguous').length,
  unmatched: columns.filter(c => c.status === 'unmatched').length,
});

const sample: MappingColumn[] = [
  column({ header: 'cash', index: 5, status: 'unmatched', samples: ['927.50', '800.00'] }),
  column({ header: 'quantitydelta', index: 1, status: 'ambiguous', suggestion: 'quantity', samples: ['5', '3'] }),
  column({ header: 'Date', index: 0, status: 'matched', field: 'transactionDate', samples: ['2024-01-15'] }),
  column({ header: 'Amount', index: 3, status: 'matched', field: 'amountPrimary', samples: ['100.00'] }),
];

const renderTable = (overrides: Partial<React.ComponentProps<typeof ColumnMappingTable>> = {}) => {
  const props: React.ComponentProps<typeof ColumnMappingTable> = {
    columns: sample,
    summary: summaryOf(sample),
    rowCount: 2500,
    mappings: { transactionDate: 'Date', amountPrimary: 'Amount' },
    pendingCount: 1,
    onChange: vi.fn(),
    onAcceptAll: vi.fn(),
    ...overrides,
  };
  return { ...render(<ColumnMappingTable {...props} />), props };
};

describe('ColumnMappingTable', () => {
  it('opens with a summary of matched, to-check and unused columns', () => {
    renderTable();
    const summary = screen.getByRole('status', { name: /summaryLabel/ });
    expect(within(summary).getByText('2')).toBeTruthy(); // matched
    expect(within(summary).getAllByText('1')).toHaveLength(2); // to check + not used
    expect(within(summary).getByText(/summary.matched/)).toBeTruthy();
    expect(within(summary).getByText(/summary.attention/)).toBeTruthy();
    expect(within(summary).getByText(/summary.ignored/)).toBeTruthy();
  });

  it('accepts every suggestion in one click, and hides the button when none is pending', () => {
    const { props, rerender } = renderTable();
    fireEvent.click(screen.getByRole('button', { name: /acceptAll/ }));
    expect(props.onAcceptAll).toHaveBeenCalledTimes(1);

    rerender(<ColumnMappingTable {...props} pendingCount={0} />);
    expect(screen.queryByRole('button', { name: /acceptAll/ })).toBeNull();
  });

  it('shows the cells of each column next to its name', () => {
    renderTable();
    expect(screen.getByText('927.50')).toBeTruthy();
    expect(screen.getByText('2024-01-15')).toBeTruthy();
  });

  it('lists columns to check first and can hide the matched ones', () => {
    renderTable();
    const names = screen.getAllByRole('listitem').map(li => li.getAttribute('data-column'));
    expect(names.slice(0, 2)).toEqual(['cash', 'quantitydelta']);

    fireEvent.click(screen.getByRole('button', { name: /filter.attention/ }));
    expect(screen.queryByText('Date')).toBeNull();
    expect(screen.getByText('cash')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /filter.all/ }));
    expect(screen.getByText('Date')).toBeTruthy();
  });

  it('gives every target select a name that says which column it is for', () => {
    renderTable();
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(4);
    selects.forEach(select => expect(select.getAttribute('aria-label')).toMatch(/selectLabel/));
    expect(selects[0].getAttribute('aria-label')).toContain('cash');
  });

  it('reports the chosen field, or null when the column is ignored', () => {
    const { props } = renderTable();
    const [cashSelect] = screen.getAllByRole('combobox');

    fireEvent.change(cashSelect, { target: { value: 'amountPrimary' } });
    expect(props.onChange).toHaveBeenLastCalledWith('cash', 'amountPrimary');

    const dateSelect = screen.getAllByRole('combobox')[2];
    fireEvent.change(dateSelect, { target: { value: '' } });
    expect(props.onChange).toHaveBeenLastCalledWith('Date', null);
  });

  it('applies the suggestion of one column with its own button', () => {
    const { props } = renderTable();
    fireEvent.click(screen.getByRole('button', { name: /useSuggestionFor/ }));
    expect(props.onChange).toHaveBeenCalledWith('quantitydelta', 'quantity');
  });

  it('marks required fields in the list and says which are still missing', () => {
    renderTable({ mappings: { transactionDate: 'Date' } });
    const required = screen.getByRole('status', { name: /required.title/ });
    // The date is found; the amount and the asset are still missing
    expect(within(required).getAllByText(/required.missing/)).toHaveLength(2);
    expect(within(required).getAllByText(/required.found/)).toHaveLength(1);
    expect(screen.getAllByRole('option', { name: /fields.transactionDate \*/ }).length).toBeGreaterThan(0);
  });

  it('counts an amount computed from quantity and unit price as found', () => {
    renderTable({ mappings: { transactionDate: 'Date', quantity: 'Qty', priceUnit: 'Price', assetSymbol: 'Ticker' } });
    const required = screen.getByRole('status', { name: /required.title/ });
    expect(within(required).queryByText(/required.missing/)).toBeNull();
    expect(within(required).getByText(/required.foundDerived/)).toBeTruthy();
  });

  it('paginates a file with many columns and keeps the buttons keyboard reachable', () => {
    const many = Array.from({ length: 45 }, (_, i) => column({ header: `col${i}`, index: i, status: 'unmatched' }));
    renderTable({ columns: many, summary: summaryOf(many), pendingCount: 0 });

    expect(screen.getAllByRole('listitem')).toHaveLength(20);
    const next = screen.getByRole('button', { name: /pagination.next/ });
    fireEvent.click(next);
    expect(screen.getAllByRole('listitem').map(li => li.getAttribute('data-column'))[0]).toBe('col20');
    fireEvent.click(screen.getByRole('button', { name: /pagination.next/ }));
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect((screen.getByRole('button', { name: /pagination.next/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the other field a column also feeds', () => {
    const both = [column({ header: 'Change', index: 0, status: 'matched', field: 'amountPrimary', extraFields: ['quantity'] })];
    renderTable({ columns: both, summary: summaryOf(both), pendingCount: 0 });
    expect(screen.getByText(/alsoUsedAs/)).toBeTruthy();
  });
});

describe('MappedPreview', () => {
  const entries = (n: number) => Array.from({ length: n }, (_, i) => [
    { field: 'transactionDate' as const, value: `2024-01-0${i + 1}T00:00:00.000Z` },
    { field: 'assetSymbol' as const, value: 'AAPL' },
  ]);

  it('never shows more than two rows', () => {
    render(<MappedPreview rows={entries(5)} ready />);
    expect(screen.getAllByRole('group')).toHaveLength(2);
    expect(screen.getByText('2024-01-02T00:00:00.000Z')).toBeTruthy();
    expect(screen.queryByText('2024-01-03T00:00:00.000Z')).toBeNull();
  });

  it('labels each stored value with its field', () => {
    render(<MappedPreview rows={entries(1)} ready />);
    expect(screen.getByText('importWizard.fields.transactionDate')).toBeTruthy();
    expect(screen.getByText('AAPL')).toBeTruthy();
  });

  it('asks for the missing columns instead of showing a half-empty result', () => {
    render(<MappedPreview rows={entries(1)} ready={false} />);
    expect(screen.getByText(/mappedPreview.incomplete/)).toBeTruthy();
    expect(screen.queryByText('AAPL')).toBeNull();
  });
});
