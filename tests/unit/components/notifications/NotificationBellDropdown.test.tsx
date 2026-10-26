import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationBellDropdown } from '../../../../src/components/notifications/NotificationBellDropdown';
import { Alert } from '../../../../src/types/domain';
import '../../../../src/i18n';

// Mock DataContext
const mockMarkAlertAsRead = vi.fn();
const mockMarkAllAlertsAsRead = vi.fn();
const mockDeleteAlert = vi.fn();

const mockAlerts: Alert[] = [
  {
    id: 'a1',
    type: 'warning',
    category: 'portfolio',
    title: 'Liquidités dormantes élevées',
    message: 'Votre solde de liquidités représente 35.0% de votre portefeuille.',
    date: new Date().toISOString(),
    read: false,
    actionUrl: '/positions',
    actionLabelKey: 'notifications:toast.viewAction',
  },
  {
    id: 'a2',
    type: 'info',
    category: 'fiscal',
    title: 'Échéance fiscale déclarative',
    message: 'Déclaration des revenus en zone 1 dans 28 jours.',
    date: new Date(Date.now() - 3600000).toISOString(),
    read: true,
    actionUrl: '/tax',
  },
];

vi.mock('../../../../src/context/DataContext', () => ({
  useData: () => ({
    alerts: mockAlerts,
    unreadAlertsCount: 1,
    markAlertAsRead: mockMarkAlertAsRead,
    markAllAlertsAsRead: mockMarkAllAlertsAsRead,
    deleteAlert: mockDeleteAlert,
  }),
}));

describe('NotificationBellDropdown Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the interactive bell icon with unread count badge', () => {
    render(
      <MemoryRouter>
        <NotificationBellDropdown />
      </MemoryRouter>
    );

    const bellBtn = screen.getByRole('button', { name: /notification/i });
    expect(bellBtn).toBeTruthy();

    // Unread count badge should display '1'
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('opens dropdown on click and displays alert items with filter tabs', () => {
    render(
      <MemoryRouter>
        <NotificationBellDropdown />
      </MemoryRouter>
    );

    const bellBtn = screen.getByRole('button', { name: /notification/i });
    fireEvent.click(bellBtn);

    // Dropdown is opened
    expect(screen.getByRole('region', { name: /notification/i })).toBeTruthy();
    expect(screen.getByText('Liquidités dormantes élevées')).toBeTruthy();
    expect(screen.getByText('Échéance fiscale déclarative')).toBeTruthy();

    // Filter to unread tab
    const unreadTab = screen.getByRole('button', { name: /unread/i });
    fireEvent.click(unreadTab);
    expect(screen.getByText('Liquidités dormantes élevées')).toBeTruthy();
    expect(screen.queryByText('Échéance fiscale déclarative')).toBeNull();
  });

  it('triggers markAllAlertsAsRead when clicking the mark all button in dropdown header', () => {
    render(
      <MemoryRouter>
        <NotificationBellDropdown />
      </MemoryRouter>
    );

    const bellBtn = screen.getByRole('button', { name: /notification/i });
    fireEvent.click(bellBtn);

    const markAllBtn = screen.getByTitle(/mark all as read/i);
    fireEvent.click(markAllBtn);

    expect(mockMarkAllAlertsAsRead).toHaveBeenCalledTimes(1);
  });

  it('closes the dropdown when clicking outside', () => {
    render(
      <MemoryRouter>
        <div>
          <span data-testid="outside">Outside area</span>
          <NotificationBellDropdown />
        </div>
      </MemoryRouter>
    );

    const bellBtn = screen.getByRole('button', { name: /notification/i });
    fireEvent.click(bellBtn);
    expect(screen.getByRole('region', { name: /notification/i })).toBeTruthy();

    // Click outside
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('region', { name: /notification/i })).toBeNull();
  });
});
