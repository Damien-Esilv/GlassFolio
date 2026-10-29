import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../../src/i18n';

const mocks = vi.hoisted(() => ({
    handleGoogleCallback: vi.fn(),
    loadUserFromRepo: vi.fn(),
    cancelSecondFactor: vi.fn(),
    pendingSecondFactor: null as null | string[],
    parseCallbackHash: vi.fn(),
    navigate: vi.fn(),
}));

vi.mock('../../../src/context/AuthContext', () => ({
    useAuth: () => ({
        handleGoogleCallback: mocks.handleGoogleCallback,
        loadUserFromRepo: mocks.loadUserFromRepo,
        cancelSecondFactor: mocks.cancelSecondFactor,
        pendingSecondFactor: mocks.pendingSecondFactor,
        completeSecondFactor: vi.fn(),
        completeSecondFactorWithPasskey: vi.fn(),
    }),
}));
vi.mock('../../../src/services/security/googleOidcService', () => ({
    googleOidcService: { parseCallbackHash: mocks.parseCallbackHash },
}));
vi.mock('react-router-dom', async (importOriginal) => ({
    ...(await importOriginal<typeof import('react-router-dom')>()),
    useNavigate: () => mocks.navigate,
}));

import { GoogleAuthCallback } from '../../../src/pages/GoogleAuthCallback';
import { resetGoogleCallbackRun } from '../../../src/services/security/googleCallbackRun';

const renderPage = () =>
    render(
        <React.StrictMode>
            <MemoryRouter>
                <GoogleAuthCallback />
            </MemoryRouter>
        </React.StrictMode>
    );

describe('GoogleAuthCallback', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetGoogleCallbackRun();
        mocks.pendingSecondFactor = null;
        mocks.parseCallbackHash.mockReturnValue({ idToken: 'idt', accessToken: 'at', rawNonce: 'n', state: 's' });
        mocks.loadUserFromRepo.mockResolvedValue(undefined);
    });

    it('shows the thinking sphere (not a spinner ring) while the vault unlocks', () => {
        mocks.handleGoogleCallback.mockReturnValue(new Promise(() => undefined));
        renderPage();
        expect(screen.getAllByTestId('app-thinking-orb')[0].getAttribute('data-state')).toBe('searching');
    });

    it('runs the one-shot callback exactly once, even in StrictMode, then goes home', async () => {
        mocks.handleGoogleCallback.mockResolvedValue({ user: {}, session: {} });
        renderPage();
        await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true }));
        expect(mocks.parseCallbackHash).toHaveBeenCalledTimes(1);
        expect(mocks.handleGoogleCallback).toHaveBeenCalledTimes(1);
    });

    it('finishes the sign-in on the remounted page when the app shell swaps layout mid-flight', async () => {
        let resolveCallback: (value: unknown) => void = () => undefined;
        mocks.handleGoogleCallback.mockReturnValue(new Promise((resolve) => { resolveCallback = resolve; }));
        const first = renderPage();
        first.unmount();
        renderPage();
        resolveCallback({ user: {}, session: {}, recoveryKey: undefined });
        await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true }));
        expect(mocks.parseCallbackHash).toHaveBeenCalledTimes(1);
        expect(mocks.handleGoogleCallback).toHaveBeenCalledTimes(1);
        expect(screen.queryByText(/MISSING_OAUTH_TOKENS/)).toBeNull();
    });

    it('waits for the second factor instead of loading the vault', async () => {
        mocks.pendingSecondFactor = ['totp'];
        mocks.handleGoogleCallback.mockResolvedValue({ user: {}, session: {}, requiresTwoFactor: true, secondFactorMethods: ['totp'] });
        renderPage();
        await waitFor(() => expect(screen.getByRole('textbox')).toBeDefined());
        expect(mocks.loadUserFromRepo).not.toHaveBeenCalled();
        expect(mocks.navigate).not.toHaveBeenCalled();
    });

    it('shows the failure and offers a retry when the callback is rejected', async () => {
        mocks.handleGoogleCallback.mockRejectedValue(new Error('boom'));
        renderPage();
        await waitFor(() => expect(screen.getByRole('button', { name: /Réessayer|Retry|Try again/i })).toBeDefined());
        expect(mocks.navigate).not.toHaveBeenCalled();
    });
});
