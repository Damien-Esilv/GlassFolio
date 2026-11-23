/**
 * Settings → Institutions & accounts: synced accounts point to Connections and cannot be deleted here; the others
 * are renamed in place and deleted after a confirmation that says what goes with them.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../../src/i18n';

vi.mock('../../../src/context/DataContext', () => ({ useData: () => ({ refreshData: vi.fn(async () => undefined) }) }));
const service = vi.hoisted(() => ({
  listInstitutions: vi.fn(),
  renameInstitution: vi.fn(async () => ({ success: true })),
  renameAccount: vi.fn(async () => ({ success: true })),
  deleteAccount: vi.fn(async () => ({ success: true, operations: 2 })),
  deleteInstitution: vi.fn(async () => ({ success: true, operations: 2 })),
}));
vi.mock('../../../src/services/accountManagementService', () => ({ accountManagementService: service }));

import { AccountsTab } from '../../../src/components/accounts/AccountsTab';

service.listInstitutions.mockResolvedValue([
  { id: 'inst-bourso', name: 'BoursoBank', type: 'bank', accounts: [
    { id: 'acc-pea', name: 'PEA CATAU', type: 'investment', wrapperType: 'PEA', currency: 'EUR', operations: 7, syncedBy: { connectionId: 'c1', label: 'BoursoBank', sourceId: 'woob' } },
  ] },
  { id: 'inst-old', name: 'Old broker', type: 'broker', accounts: [
    { id: 'acc-cto', name: 'CTO', type: 'investment', wrapperType: 'CTO', currency: 'EUR', operations: 2, syncedBy: null },
  ] },
]);

describe('<AccountsTab />', () => {
  it('shows what feeds each account, renames in place and deletes after confirming', async () => {
    render(<MemoryRouter><AccountsTab /></MemoryRouter>);

    expect(await screen.findByText('Synced · BoursoBank')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete PEA CATAU' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete BoursoBank' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Rename CTO' }));
    fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'CTO Degiro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(service.renameAccount).toHaveBeenCalledWith('acc-cto', 'CTO Degiro'));

    fireEvent.click(screen.getByRole('button', { name: 'Delete CTO' }));
    expect(screen.getByRole('alert').textContent).toContain('its 2 operations');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
    await waitFor(() => expect(service.deleteAccount).toHaveBeenCalledWith('acc-cto'));
  });
});
