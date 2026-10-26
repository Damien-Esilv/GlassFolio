import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PasskeyManager } from '../../../src/components/security/PasskeyManager';
import { passkeyService } from '../../../src/services/security/passkeyService';

let mockUser: any = null;

vi.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => {
      const map: Record<string, string> = {
        'security:passkeys.title': 'Passkeys WebAuthn',
        'security:passkeys.subtitle': 'Connectez-vous en toute sécurité',
        'security:passkeys.addPasskeyButton': 'Ajouter une passkey',
        'security:passkeys.managedByGoogleBadge': 'Géré par le compte Google',
        'security:passkeys.managedByGoogleTitle': 'Clés d\'accès biométriques gérées par Google',
        'security:passkeys.managedByGoogleDesc': 'Vos clés d\'accès biométriques sont gérées par votre compte Google.',
        'security:passkeys.notSupported': 'Non supporté',
        'security:passkeys.noPasskeys': 'Aucune passkey',
      };
      return map[key] || defaultValue || key;
    },
  }),
}));

describe('PasskeyManager Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Google delegation badge and information when user is authenticated with Google', async () => {
    mockUser = {
      id: 'google-usr-1',
      email: 'alex@gmail.com',
      name: 'Alex',
      authProvider: 'google',
    };

    render(<PasskeyManager />);

    expect(screen.getByText('Géré par le compte Google')).toBeTruthy();
    expect(screen.getByText('Clés d\'accès biométriques gérées par Google')).toBeTruthy();
    expect(screen.getByText('Vos clés d\'accès biométriques sont gérées par votre compte Google.')).toBeTruthy();
    expect(screen.queryByText('Ajouter une passkey')).toBeNull();
  });

  it('renders normal passkey interface with add button when user has email auth provider', async () => {
    mockUser = {
      id: 'email-usr-1',
      email: 'user@example.com',
      name: 'Standard User',
      authProvider: 'email',
    };

    vi.spyOn(passkeyService, 'isSupported').mockResolvedValue(true);
    vi.spyOn(passkeyService, 'listPasskeys').mockResolvedValue([]);

    render(<PasskeyManager />);

    await waitFor(() => {
      expect(screen.getByText('Ajouter une passkey')).toBeTruthy();
      expect(screen.getByText('Aucune passkey')).toBeTruthy();
    });

    expect(screen.queryByText('Géré par le compte Google')).toBeNull();
  });
});
