import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VaultGate } from '../../../../components/security/VaultGate';
import { vaultService } from '../../../../src/services/security/vaultService';

let mockUser: any = null;
const mockLogout = vi.fn();

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: mockLogout,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
  }),
}));

vi.mock('../../../../context/DataContext', () => ({
  useData: () => ({
    refreshData: vi.fn(),
  }),
}));

describe('VaultGate Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when vault status is unlocked', () => {
    mockUser = { id: 'u1', email: 'test@example.com', authProvider: 'email', emailVerified: true };
    vi.spyOn(vaultService, 'getStatus').mockReturnValue('unlocked');
    vi.spyOn(vaultService, 'subscribeStatus').mockReturnValue(() => {});

    render(
      <VaultGate>
        <div data-testid="protected-content">Secret Data</div>
      </VaultGate>
    );

    expect(screen.getByTestId('protected-content')).toBeTruthy();
  });

  it('calls unlockOAuthVault on initial boot when user is google and vault is locked', async () => {
    mockUser = { id: 'g-user-1', email: 'google@example.com', authProvider: 'google', emailVerified: true };
    vi.spyOn(vaultService, 'getStatus').mockReturnValue('locked');
    vi.spyOn(vaultService, 'isInitialized').mockReturnValue(true);
    const unlockSpy = vi.spyOn(vaultService, 'unlockOAuthVault').mockResolvedValue(undefined as any);
    vi.spyOn(vaultService, 'subscribeStatus').mockReturnValue(() => {});

    render(
      <VaultGate>
        <div data-testid="protected-content">Secret Data</div>
      </VaultGate>
    );

    await waitFor(() => {
      expect(unlockSpy).toHaveBeenCalledWith('gf-oauth-e2ee-v1:g-user-1:google@example.com');
    });
  });

  it('calls logout if vault is locked after having been unlocked for a google user', async () => {
    mockUser = { id: 'g-user-1', email: 'google@example.com', authProvider: 'google', emailVerified: true };
    let statusCallback: ((status: any) => void) | null = null;
    vi.spyOn(vaultService, 'getStatus').mockReturnValue('unlocked');
    vi.spyOn(vaultService, 'subscribeStatus').mockImplementation((cb: any) => {
      statusCallback = cb;
      return () => {};
    });

    render(
      <VaultGate>
        <div data-testid="protected-content">Secret Data</div>
      </VaultGate>
    );

    expect(screen.getByTestId('protected-content')).toBeTruthy();

    // Trigger lock (e.g. inactivity timer)
    statusCallback?.('locked');

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
  });
});
