import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../../src/i18n';
import Notifications from '../../../src/pages/Notifications';

vi.mock('../../../src/context/DataContext', () => ({
  useData: () => ({
    alerts: [],
    unreadAlertsCount: 0,
    alertRules: [],
    markAlertAsRead: vi.fn(),
    markAllAlertsAsRead: vi.fn(),
    deleteAlert: vi.fn(),
    clearReadAlerts: vi.fn(),
    saveAlertRule: vi.fn(),
    toggleAlertRule: vi.fn(),
    deleteAlertRule: vi.fn(),
  }),
}));

const FADE = /(^|\s)(animate-fade-in|animate-in|fade-in)(\s|$)/;

describe('Notifications page: no fade-in', () => {
  it('shows its content without fading the whole screen in', () => {
    const { container } = render(<MemoryRouter><Notifications /></MemoryRouter>);
    const faded = Array.from(container.querySelectorAll('*')).filter(el => FADE.test(el.getAttribute('class') ?? ''));
    expect(faded).toHaveLength(0);
  });

  it('opens the rule form without a fade either', () => {
    const { container } = render(<MemoryRouter initialEntries={['/notifications?tab=rules']}><Notifications /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Create Rule/ }));
    expect(container.querySelector('form')).not.toBeNull();
    const faded = Array.from(container.querySelectorAll('*')).filter(el => FADE.test(el.getAttribute('class') ?? ''));
    expect(faded).toHaveLength(0);
  });
});
