import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationToastContainer } from '../../../../src/components/notifications/NotificationToastContainer';
import { Alert } from '../../../../src/types/domain';
import '../../../../src/i18n';

const mockDismissToast = vi.fn();
let mockActiveToasts: Alert[] = [];

vi.mock('../../../../src/context/DataContext', () => ({
  useData: () => ({
    activeToasts: mockActiveToasts,
    dismissToast: mockDismissToast,
  }),
}));

describe('NotificationToastContainer Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockActiveToasts = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when there are no active toasts', () => {
    const { container } = render(
      <MemoryRouter>
        <NotificationToastContainer />
      </MemoryRouter>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders active toasts with correct title and message', () => {
    mockActiveToasts = [
      {
        id: 'toast-1',
        type: 'warning',
        title: 'Toast Warning',
        message: 'This is a warning message.',
        date: new Date().toISOString(),
        read: false,
      },
      {
        id: 'toast-2',
        type: 'success',
        title: 'Toast Success',
        message: 'This is a success message.',
        date: new Date().toISOString(),
        read: false,
      },
      {
        id: 'toast-3',
        type: 'error',
        title: 'Toast Error',
        message: 'This is an error message.',
        date: new Date().toISOString(),
        read: false,
      },
      {
        id: 'toast-4',
        type: 'info',
        category: 'security',
        title: 'Toast Security',
        message: 'This is a security message.',
        date: new Date().toISOString(),
        read: false,
      },
    ];

    render(
      <MemoryRouter>
        <NotificationToastContainer />
      </MemoryRouter>
    );

    expect(screen.getByText('Toast Warning')).toBeTruthy();
    expect(screen.getByText('This is a warning message.')).toBeTruthy();
    expect(screen.getByText('Toast Success')).toBeTruthy();
    expect(screen.getByText('This is a success message.')).toBeTruthy();
    expect(screen.getByText('Toast Error')).toBeTruthy();
    expect(screen.getByText('This is an error message.')).toBeTruthy();
    expect(screen.getByText('Toast Security')).toBeTruthy();
    expect(screen.getByText('This is a security message.')).toBeTruthy();
  });

  it('calls dismissToast when close button is clicked', () => {
    mockActiveToasts = [
      {
        id: 'toast-1',
        type: 'info',
        title: 'Info Toast',
        message: 'Information',
        date: new Date().toISOString(),
        read: false,
      },
    ];

    render(
      <MemoryRouter>
        <NotificationToastContainer />
      </MemoryRouter>
    );

    const closeBtn = screen.getByRole('button');
    fireEvent.click(closeBtn);

    expect(mockDismissToast).toHaveBeenCalledWith('toast-1');
  });

  it('auto-dismisses toast after 5 seconds', () => {
    mockActiveToasts = [
      {
        id: 'toast-auto-dismiss',
        type: 'info',
        title: 'Auto Dismiss',
        message: 'Will disappear soon',
        date: new Date().toISOString(),
        read: false,
      },
    ];

    render(
      <MemoryRouter>
        <NotificationToastContainer />
      </MemoryRouter>
    );

    expect(screen.getByText('Auto Dismiss')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockDismissToast).toHaveBeenCalledWith('toast-auto-dismiss');
  });

  it('renders action link when actionUrl is provided', () => {
    mockActiveToasts = [
      {
        id: 'toast-link',
        type: 'info',
        title: 'Link Toast',
        message: 'Has a link',
        date: new Date().toISOString(),
        read: false,
        actionUrl: '/some-path',
        actionLabelKey: 'notifications:toast.viewAction',
      },
      {
        id: 'toast-link-2',
        type: 'info',
        title: 'Link Toast 2',
        message: 'Has a link too',
        date: new Date().toISOString(),
        read: false,
        actionUrl: '/some-other-path',
      },
    ];

    render(
      <MemoryRouter>
        <NotificationToastContainer />
      </MemoryRouter>
    );

    const links = screen.getAllByRole('link');
    expect(links[0].getAttribute('href')).toBe('/some-path');
    expect(links[1].getAttribute('href')).toBe('/some-other-path');

    fireEvent.click(links[0]);
    expect(mockDismissToast).toHaveBeenCalledWith('toast-link');
  });
});
