import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../../../components/Layout';

// Mock AIChatDrawer to keep tests lightweight
vi.mock('../../../components/ai/AIChatDrawer', () => ({
  AIChatDrawer: () => <div data-testid="ai-chat-drawer" />,
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock contexts
const mockUseAuth = vi.fn();
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseData = vi.fn();
vi.mock('../../../context/DataContext', () => ({
  useData: () => mockUseData(),
}));

describe('<Layout /> Route Shell Resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseData.mockReturnValue({
      lastPriceRefresh: null,
      forceRefreshPrices: vi.fn(),
    });
  });

  it('renders only children without sidebar or header when user is unauthenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      logout: vi.fn(),
      lockVault: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Layout>
          <div data-testid="child-content">Landing or Login Page</div>
        </Layout>
      </MemoryRouter>
    );

    expect(screen.getByTestId('child-content')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('renders children in full screen without sidebar or header on /login even if user is authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-demo',
        name: 'Alex Trader',
        email: 'alex@trader.com',
      },
      logout: vi.fn(),
      lockVault: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Layout>
          <div data-testid="login-content">Login Full Screen</div>
        </Layout>
      </MemoryRouter>
    );

    expect(screen.getByTestId('login-content')).toBeTruthy();
    // Sidebar and Header must NOT be rendered on /login
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByText('Alex Trader')).toBeNull();
  });

  it('renders children in full screen without sidebar or header on /signup even if user is authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-demo',
        name: 'Alex Trader',
        email: 'alex@trader.com',
      },
      logout: vi.fn(),
      lockVault: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/signup']}>
        <Layout>
          <div data-testid="signup-content">Signup Full Screen</div>
        </Layout>
      </MemoryRouter>
    );

    expect(screen.getByTestId('signup-content')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByText('Alex Trader')).toBeNull();
  });

  it('renders children in full screen without sidebar or header on /welcome, /legal, /terms even if user is authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-demo',
        name: 'Alex Trader',
        email: 'alex@trader.com',
      },
      logout: vi.fn(),
      lockVault: vi.fn(),
    });

    for (const route of ['/welcome', '/legal', '/terms', '/privacy', '/cookies', '/accessibility']) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[route]}>
          <Layout>
            <div data-testid={`route-${route}`}>Content</div>
          </Layout>
        </MemoryRouter>
      );

      expect(screen.queryByRole('navigation')).toBeNull();
      expect(screen.queryByRole('banner')).toBeNull();
      unmount();
    }
  });

  it('renders full dashboard layout shell with sidebar and header on protected routes when authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-demo',
        name: 'Alex Trader',
        email: 'alex@trader.com',
      },
      logout: vi.fn(),
      lockVault: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Layout>
          <div data-testid="dashboard-content">Dashboard Content</div>
        </Layout>
      </MemoryRouter>
    );

    expect(screen.getByTestId('dashboard-content')).toBeTruthy();
    // Sidebar and Header must be rendered
    expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0);
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByText('Alex Trader')).toBeTruthy();
  });
});
