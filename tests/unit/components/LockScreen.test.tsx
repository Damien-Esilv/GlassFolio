import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LockScreen } from '../../../src/components/security/LockScreen';
import { vaultService } from '../../../src/services/security/vaultService';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => {
      const map: Record<string, string> = {
        'security:lockScreen.title': 'Coffre-fort verrouillé',
        'security:lockScreen.subtitle': 'Déchiffrez vos données.',
        'security:lockScreen.demoBannerTitle': 'Mode Démonstration Actif',
        'security:lockScreen.unlockDemoButton': 'Déverrouiller la démo (1-clic)',
        'security:lockScreen.unlockButton': 'Déverrouiller le coffre',
      };
      return map[key] || defaultValue || key;
    },
  }),
}));

const mockRefreshData = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/context/DataContext', () => ({
  useData: () => ({
    refreshData: mockRefreshData,
  }),
}));

describe('LockScreen Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders quick-unlock demo banner when isDemoVault is true', async () => {
    vi.spyOn(vaultService, 'isDemoVault').mockReturnValue(true);

    render(<LockScreen />);

    expect(screen.getByText('Mode Démonstration Actif')).toBeTruthy();
    expect(screen.getByText('Déverrouiller la démo (1-clic)')).toBeTruthy();
  });

  it('does not render demo banner for production vaults', () => {
    vi.spyOn(vaultService, 'isDemoVault').mockReturnValue(false);

    render(<LockScreen />);

    expect(screen.queryByText('Mode Démonstration Actif')).toBeNull();
  });

  it('calls unlock with demo password and refreshes data on 1-click unlock', async () => {
    vi.spyOn(vaultService, 'isDemoVault').mockReturnValue(true);
    const unlockSpy = vi.spyOn(vaultService, 'unlock').mockResolvedValue({ authKey: 'test' } as any);
    const onUnlocked = vi.fn();

    render(<LockScreen onUnlocked={onUnlocked} />);

    const demoButton = screen.getByText('Déverrouiller la démo (1-clic)');
    fireEvent.click(demoButton);

    await waitFor(() => {
      expect(unlockSpy).toHaveBeenCalledWith('password');
      expect(mockRefreshData).toHaveBeenCalled();
      expect(onUnlocked).toHaveBeenCalled();
    });
  });
});
