import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SecuritySettingsTab } from '../../../../components/security/SecuritySettingsTab';
import { vaultService } from '../../../../src/services/security/vaultService';
import { totpService } from '../../../../src/services/security/totpService';
import * as passwordValidator from '../../../../src/services/security/passwordValidator';

// -- Mock Contexts and Services
let mockUser: any = null;
const mockLockVault = vi.fn();

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    lockVault: mockLockVault,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => {
      const map: Record<string, string> = {
        'security:vaultSection.title': 'Encrypted Vault',
        'security:vaultSection.changeMasterPassword': 'Change Password',
        'security:vaultSection.regenerateRecoveryKey': 'Regenerate Key',
        'security:vaultSection.lockNow': 'Lock Now',
        'security:vaultSection.managedByGoogle': 'Managed by Google OAuth',
        'security:totp.title': 'Two-Factor Authentication',
        'security:totp.enableButton': 'Enable 2FA',
        'security:totp.disableButton': 'Disable 2FA',
        'security:totp.statusGoogle': 'Managed by Google',
        'security:totp.statusEnabled': 'Enabled',
        'security:totp.statusDisabled': 'Disabled',
        'security:totp.managedByGoogle': '2FA is managed directly by your Google Account',
        'security:totp.disableConfirmMessage': 'Are you sure you want to disable 2FA?',
        'security:vaultSection.passwordsMismatch': 'Passwords do not match',
        'auth:signup.passwordWeakError': 'Password is too weak',
        'security:vaultSection.passwordChangedSuccess': 'Password changed successfully',
        'security:vaultSection.oldPassword': 'Old Password',
        'security:vaultSection.newPassword': 'New Password',
        'security:vaultSection.confirmPassword': 'Confirm Password',
        'security:vaultSection.submitChange': 'Submit Change',
        'security:vaultSection.regenerateTitle': 'Regenerate Title',
        'security:vaultSection.masterPasswordConfirm': 'Master Password',
        'security:vaultSection.confirmRegenerate': 'Confirm Regenerate',
      };
      return map[key] || defaultValue || key;
    },
  }),
}));

vi.mock('../../../../src/services/security/vaultService', () => ({
  vaultService: {
    changePassword: vi.fn(),
    regenerateRecoveryKey: vi.fn(),
  },
}));

vi.mock('../../../../src/services/security/totpService', () => ({
  totpService: {
    isEnabled: vi.fn(),
    disable: vi.fn(),
  },
}));

// -- Mock child components
vi.mock('../../../../components/security/TotpEnrollDialog', () => ({
  TotpEnrollDialog: ({ isOpen, onClose }: any) => (
    isOpen ? <div data-testid="totp-enroll-dialog"><button onClick={onClose}>Close Enroll</button></div> : null
  ),
}));
vi.mock('../../../../components/security/PasskeyManager', () => ({
  PasskeyManager: () => <div data-testid="passkey-manager" />,
}));
vi.mock('../../../../components/security/SecretsVaultPanel', () => ({
  SecretsVaultPanel: () => <div data-testid="secrets-vault-panel" />,
}));
vi.mock('../../../../components/security/SessionAuditPanel', () => ({
  SessionAuditPanel: () => <div data-testid="session-audit-panel" />,
}));
vi.mock('../../../../components/security/PasswordStrengthMeter', () => ({
  PasswordStrengthMeter: () => <div data-testid="password-strength-meter" />,
}));
vi.mock('../../../../components/security/RecoveryKeyDialog', () => ({
  RecoveryKeyDialog: ({ onConfirmed }: any) => (
    <div data-testid="recovery-key-dialog"><button onClick={onConfirmed}>Confirm Key</button></div>
  ),
}));

describe('SecuritySettingsTab Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'u1', email: 'test@example.com', authProvider: 'email' };
    vi.spyOn(totpService, 'isEnabled').mockResolvedValue(false);
  });

  it('renders standard layout for email users', async () => {
    render(<SecuritySettingsTab />);

    expect(screen.getByText('Encrypted Vault')).toBeInTheDocument();
    expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument();

    // Check buttons available for standard user
    expect(screen.getByText('Change Password')).toBeInTheDocument();
    expect(screen.getByText('Regenerate Key')).toBeInTheDocument();
    expect(screen.getByText('Lock Now')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Enable 2FA')).toBeInTheDocument();
    });

    // Check child components are rendered
    expect(screen.getByTestId('passkey-manager')).toBeInTheDocument();
    expect(screen.getByTestId('secrets-vault-panel')).toBeInTheDocument();
    expect(screen.getByTestId('session-audit-panel')).toBeInTheDocument();
  });

  it('renders google managed layout for google users', async () => {
    mockUser = { id: 'g1', email: 'google@example.com', authProvider: 'google' };

    render(<SecuritySettingsTab />);

    // Should show google specific text instead of change password
    expect(screen.getByText('Managed by Google OAuth')).toBeInTheDocument();
    expect(screen.queryByText('Change Password')).not.toBeInTheDocument();
    expect(screen.queryByText('Regenerate Key')).not.toBeInTheDocument();

    // Lock now should still be available
    expect(screen.getByText('Lock Now')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('2FA is managed directly by your Google Account')).toBeInTheDocument();
      expect(screen.queryByText('Enable 2FA')).not.toBeInTheDocument();
      expect(screen.queryByText('Disable 2FA')).not.toBeInTheDocument();
    });
  });

  it('allows user to lock vault', async () => {
    render(<SecuritySettingsTab />);

    fireEvent.click(screen.getByText('Lock Now'));

    expect(mockLockVault).toHaveBeenCalled();
  });

  describe('2FA Handling', () => {
    it('opens TOTP enroll dialog when clicking Enable 2FA', async () => {
      render(<SecuritySettingsTab />);

      await waitFor(() => {
        expect(screen.getByText('Enable 2FA')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Enable 2FA'));
      expect(screen.getByTestId('totp-enroll-dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Close Enroll'));
      expect(screen.queryByTestId('totp-enroll-dialog')).not.toBeInTheDocument();
    });

    it('allows disabling 2FA if enabled', async () => {
      vi.spyOn(totpService, 'isEnabled').mockResolvedValue(true);
      window.confirm = vi.fn().mockReturnValue(true);

      render(<SecuritySettingsTab />);

      await waitFor(() => {
        expect(screen.getByText('Disable 2FA')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Disable 2FA'));

      expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to disable 2FA?');
      expect(totpService.disable).toHaveBeenCalled();
    });
  });

  describe('Change Master Password', () => {
    it('shows error if passwords do not match', async () => {
      render(<SecuritySettingsTab />);

      fireEvent.click(screen.getByText('Change Password'));

      fireEvent.change(screen.getByLabelText('Old Password'), { target: { value: 'oldpass' } });
      fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpass' } });
      fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'mismatch' } });

      fireEvent.click(screen.getByText('Submit Change'));

      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      expect(vaultService.changePassword).not.toHaveBeenCalled();
    });

    it('shows error if password is weak', async () => {
      vi.spyOn(passwordValidator, 'evaluatePassword').mockReturnValue({ isValid: false } as any);
      render(<SecuritySettingsTab />);

      fireEvent.click(screen.getByText('Change Password'));

      fireEvent.change(screen.getByLabelText('Old Password'), { target: { value: 'oldpass' } });
      fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'weak' } });
      fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'weak' } });

      fireEvent.click(screen.getByText('Submit Change'));

      expect(screen.getByText('Password is too weak')).toBeInTheDocument();
      expect(vaultService.changePassword).not.toHaveBeenCalled();
    });

    it('submits successfully and clears fields', async () => {
      vi.spyOn(passwordValidator, 'evaluatePassword').mockReturnValue({ isValid: true } as any);
      vi.spyOn(vaultService, 'changePassword').mockResolvedValue(undefined);

      render(<SecuritySettingsTab />);

      fireEvent.click(screen.getByText('Change Password'));

      fireEvent.change(screen.getByLabelText('Old Password'), { target: { value: 'oldpass' } });
      fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'StrongPass1!' } });
      fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'StrongPass1!' } });

      fireEvent.click(screen.getByText('Submit Change'));

      await waitFor(() => {
        expect(vaultService.changePassword).toHaveBeenCalledWith('oldpass', 'StrongPass1!');
        expect(screen.getByText('Password changed successfully')).toBeInTheDocument();
      });
    });
  });

  describe('Regenerate Recovery Key', () => {
    it('regenerates key and displays dialog', async () => {
      vi.spyOn(vaultService, 'regenerateRecoveryKey').mockResolvedValue({ success: true, value: { recoveryKey: 'new-key-123' } } as any);

      render(<SecuritySettingsTab />);

      fireEvent.click(screen.getByText('Regenerate Key'));

      const input = screen.getByLabelText('Master Password');
      fireEvent.change(input, { target: { value: 'mypassword' } });

      fireEvent.click(screen.getByText('Confirm Regenerate'));

      await waitFor(() => {
        expect(vaultService.regenerateRecoveryKey).toHaveBeenCalledWith('mypassword');
        expect(screen.getByTestId('recovery-key-dialog')).toBeInTheDocument();
      });


      // Close dialog
      fireEvent.click(screen.getByText('Confirm Key'));
      expect(screen.queryByTestId('recovery-key-dialog')).not.toBeInTheDocument();
    });

    it('shows error if regeneration fails', async () => {
      vi.spyOn(vaultService, 'regenerateRecoveryKey').mockResolvedValue({ success: false, error: { message: 'Invalid credentials' } } as any); // isErr check

      render(<SecuritySettingsTab />);

      fireEvent.click(screen.getByText('Regenerate Key'));

      const input = screen.getByLabelText('Master Password');
      fireEvent.change(input, { target: { value: 'wrongpassword' } });

      fireEvent.click(screen.getByText('Confirm Regenerate'));

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });
    });
  });
});
