import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../../../components/Layout';

// Mock AIChatDrawer to keep tests lightweight
vi.mock('../../../components/ai/AIChatDrawer', () => ({
  AIChatDrawer: () => <div data-testid="ai-chat-drawer" />,
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'navigation:brandName': 'Glassfolio',
        'navigation:collapseSidebar': 'Réduire le menu latéral',
        'navigation:expandSidebar': 'Développer le menu latéral',
        'navigation:menu.dashboard': 'Tableau de bord',
        'navigation:menu.portfolio': 'Portefeuille',
        'navigation:menu.analytics': 'Analyses',
        'navigation:menu.fiscalite': 'Aide Fiscale',
        'navigation:menu.progress': 'Progrès',
        'navigation:menu.settings': 'Paramètres',
      };
      return map[key] || key;
    },
  }),
}));

const mockUser = {
  id: 'usr-1',
  name: 'Damien',
  email: 'damien@example.com',
  createdAt: '2026-01-01',
  preferences: {
    theme: 'dark' as const,
    currency: 'EUR',
    notifications: true,
  },
};

const mockUseAuth = vi.fn();
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseData = vi.fn();
vi.mock('../../../context/DataContext', () => ({
  useData: () => mockUseData(),
}));

const renderLayout = (initialCollapsed = false) => {
  if (initialCollapsed) {
    localStorage.setItem('gf_sidebar_collapsed', 'true');
  } else {
    localStorage.removeItem('gf_sidebar_collapsed');
  }

  mockUseAuth.mockReturnValue({
    user: mockUser,
    logout: vi.fn(),
    lockVault: vi.fn(),
  });

  mockUseData.mockReturnValue({
    lastPriceRefresh: new Date().toISOString(),
    forceRefreshPrices: vi.fn(),
    alerts: [],
    unreadAlertsCount: 0,
    markAlertAsRead: vi.fn(),
    markAllAlertsAsRead: vi.fn(),
    deleteAlert: vi.fn(),
    clearReadAlerts: vi.fn(),
  });

  return render(
    <MemoryRouter initialEntries={['/']}>
      <Layout>
        <div data-testid="page-content">Dashboard Content</div>
      </Layout>
    </MemoryRouter>
  );
};

describe('Layout Sidebar Collapse', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders expanded sidebar by default with w-60 class', () => {
    renderLayout(false);
    const sidebar = screen.getByTestId('desktop-sidebar');
    expect(Boolean(sidebar)).toBe(true);
    expect(sidebar.className).toContain('md:w-60');
    expect(sidebar.textContent).toContain('Glassfolio');
  });

  it('toggles to collapsed rail mode with w-20 class on button click', () => {
    renderLayout(false);
    const collapseButton = screen.getByTitle('Réduire le menu latéral');
    expect(Boolean(collapseButton)).toBe(true);

    fireEvent.click(collapseButton);

    const sidebar = screen.getByTestId('desktop-sidebar');
    expect(sidebar.className).toContain('md:w-20');
    expect(localStorage.getItem('gf_sidebar_collapsed')).toBe('true');
  });

  it('restores collapsed state from localStorage on initial render without redundant bottom toggle', () => {
    renderLayout(true);
    const sidebar = screen.getByTestId('desktop-sidebar');
    expect(sidebar.className).toContain('md:w-20');

    // Expand button is only in header, not duplicated in bottom settings area
    const expandButtons = screen.getAllByTitle('Développer le menu latéral');
    expect(expandButtons.length).toBe(1);
  });
});

