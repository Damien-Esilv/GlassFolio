import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../../src/i18n';
import Notifications from '../../../src/pages/Notifications';
import { STAGGER_DELAY_MS } from '../../../src/constants/animations';

const mockState = {
  alerts: [
    { id: 'a1', titleKey: 'test.1', type: 'info', category: 'portfolio', read: false, date: '2026-10-30T10:00:00Z' },
    { id: 'a2', titleKey: 'test.2', type: 'warning', category: 'goals', read: true, date: '2026-10-30T11:00:00Z' },
  ],
  unreadAlertsCount: 1,
  alertRules: [
    { id: 'r1', name: 'Rule 1', metric: 'price_above', threshold: 100, enabled: true },
    { id: 'r2', name: 'Rule 2', metric: 'drop_percent', threshold: 5, enabled: false },
  ],
  markAlertAsRead: vi.fn(),
  markAllAlertsAsRead: vi.fn(),
  deleteAlert: vi.fn(),
  clearReadAlerts: vi.fn(),
  saveAlertRule: vi.fn(),
  toggleAlertRule: vi.fn(),
  deleteAlertRule: vi.fn(),
};

vi.mock('../../../src/context/DataContext', () => ({
  useData: () => mockState,
}));

const FADE = /(^|\s)(animate-fade-in|animate-in|fade-in)(\s|$)/;

describe('Notifications page animations and styling', () => {
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

  it('renders alert items with staggered animate-row-in', () => {
    const { container } = render(<MemoryRouter><Notifications /></MemoryRouter>);
    const items = container.querySelectorAll('.animate-row-in');
    expect(items.length).toBe(2);
    expect((items[0] as HTMLElement).style.animationDelay).toBe('0ms');
    expect((items[1] as HTMLElement).style.animationDelay).toBe(`${STAGGER_DELAY_MS}ms`);
  });

  it('renders rule items with staggered animate-row-in', () => {
    const { container } = render(<MemoryRouter initialEntries={['/notifications?tab=rules']}><Notifications /></MemoryRouter>);
    const items = container.querySelectorAll('.animate-row-in');
    expect(items.length).toBe(2);
    expect((items[0] as HTMLElement).style.animationDelay).toBe('0ms');
    expect((items[1] as HTMLElement).style.animationDelay).toBe(`${STAGGER_DELAY_MS}ms`);
  });

  it('uses AnimatedNumber for counters in tabs and stats', () => {
    const { container } = render(<MemoryRouter><Notifications /></MemoryRouter>);
    const animatedNumbers = container.querySelectorAll('[aria-hidden="true"]');
    expect(animatedNumbers.length).toBeGreaterThanOrEqual(5);
  });
});
