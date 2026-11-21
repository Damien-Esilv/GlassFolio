import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../../../src/components/Layout';

// Mock AIChatPanel to keep tests lightweight
vi.mock('../../../src/components/ai/AIChatPanel', () => ({
  AIChatPanel: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="ai-chat-panel" /> : null,
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'navigation:brandName': 'Glassfolio',
        'navigation:collapseSidebar': 'Réduire le menu latéral',
        'navigation:expandSidebar': 'Développer le menu latéral',
        'navigation:resizeSidebar': 'Redimensionner la barre latérale',
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
vi.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseData = vi.fn();
vi.mock('../../../src/context/DataContext', () => ({
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

describe('Layout Sidebar Collapse & Resizing', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders expanded sidebar by default at 240px CSS variable width', () => {
    const { container } = renderLayout(false);
    const sidebar = screen.getByTestId('desktop-sidebar');
    const root = container.firstElementChild as HTMLElement;
    expect(Boolean(sidebar)).toBe(true);
    expect(sidebar.getAttribute('data-collapsed')).toBe('false');
    expect(sidebar.className).toContain('md:w-[var(--gf-sidebar-w)]');
    expect(root.style.getPropertyValue('--gf-sidebar-w')).toBe('240px');
    expect(sidebar.textContent).toContain('Glassfolio');
  });

  it('toggles to collapsed rail mode at 80px on button click', () => {
    const { container } = renderLayout(false);
    const collapseButton = screen.getByTitle('Réduire le menu latéral');
    expect(Boolean(collapseButton)).toBe(true);

    fireEvent.click(collapseButton);

    const sidebar = screen.getByTestId('desktop-sidebar');
    const root = container.firstElementChild as HTMLElement;
    expect(sidebar.getAttribute('data-collapsed')).toBe('true');
    expect(root.style.getPropertyValue('--gf-sidebar-w')).toBe('80px');
    expect(localStorage.getItem('gf_sidebar_collapsed')).toBe('true');
  });

  it('restores collapsed state from localStorage on initial render without redundant bottom toggle', () => {
    const { container } = renderLayout(true);
    const sidebar = screen.getByTestId('desktop-sidebar');
    const root = container.firstElementChild as HTMLElement;
    expect(sidebar.getAttribute('data-collapsed')).toBe('true');
    expect(root.style.getPropertyValue('--gf-sidebar-w')).toBe('80px');

    const expandButtons = screen.getAllByTitle('Développer le menu latéral');
    expect(expandButtons.length).toBe(1);
  });

  it('supports Spotify-style continuous drag resize and snap-to-collapse persistence', () => {
    const { container } = renderLayout(false);
    const handle = screen.getByTestId('sidebar-resize-handle');
    const root = container.firstElementChild as HTMLElement;

    // Drag right by +60px -> 300px
    fireEvent.pointerDown(handle, { button: 0, clientX: 240 });
    fireEvent.pointerMove(window, { clientX: 300 });
    fireEvent.pointerUp(window, { clientX: 300 });
    expect(root.style.getPropertyValue('--gf-sidebar-w')).toBe('300px');
    expect(localStorage.getItem('gf_sidebar_width')).toBe('300');

    // Drag left below 128px threshold -> snaps collapsed to 80px
    fireEvent.pointerDown(handle, { button: 0, clientX: 300 });
    fireEvent.pointerMove(window, { clientX: 100 });
    fireEvent.pointerUp(window, { clientX: 100 });
    expect(screen.getByTestId('desktop-sidebar').getAttribute('data-collapsed')).toBe('true');
    expect(root.style.getPropertyValue('--gf-sidebar-w')).toBe('80px');
  });
});
