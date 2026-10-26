import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { LocalPersistenceStatus } from '../../../../src/services/storage/LocalVaultStorageProvider';

let mockStatus: LocalPersistenceStatus;

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('../../../../src/hooks/useLocalPersistenceStatus', () => ({
    useLocalPersistenceStatus: () => mockStatus,
}));

import { LocalPersistenceNotice } from '../../../../src/components/security/LocalPersistenceNotice';
import { LocalStorageStatusCard } from '../../../../src/components/security/LocalStorageStatusCard';
import { LocalVaultUnavailableScreen } from '../../../../src/components/security/LocalVaultUnavailableScreen';

const status = (patch: Partial<LocalPersistenceStatus>): LocalPersistenceStatus => ({
    mode: 'server',
    pending: 0,
    lastSavedAt: null,
    lastError: null,
    legacyBrowserVaultIgnored: false,
    ...patch,
});

describe('Local persistence UI (E33 — TGLA-140)', () => {
    beforeEach(() => {
        mockStatus = status({});
    });

    describe('LocalPersistenceNotice', () => {
        it('renders nothing when data is safely stored on the server', () => {
            const { container } = render(<LocalPersistenceNotice />);
            expect(container.innerHTML).toBe('');
        });

        it('renders nothing before the storage is initialised (cloud mode)', () => {
            mockStatus = status({ mode: 'uninitialized' });
            const { container } = render(<LocalPersistenceNotice />);
            expect(container.innerHTML).toBe('');
        });

        it('warns that data lives in this browser only', () => {
            mockStatus = status({ mode: 'browser' });
            render(<LocalPersistenceNotice />);
            expect(screen.getByTestId('local-persistence-notice').getAttribute('role')).toBe('status');
            expect(screen.getByText('localPersistence.notice.browserOnly.title')).toBeTruthy();
        });

        it('raises an alert when changes are not reaching the server', () => {
            mockStatus = status({ lastError: 'Could not save to the local server', pending: 2 });
            render(<LocalPersistenceNotice />);
            expect(screen.getByRole('alert')).toBeTruthy();
            expect(screen.getByText('localPersistence.notice.saveError.title')).toBeTruthy();
        });

        it('explains when an older browser vault was left untouched', () => {
            mockStatus = status({ legacyBrowserVaultIgnored: true });
            render(<LocalPersistenceNotice />);
            expect(screen.getByText('localPersistence.notice.legacyIgnored.title')).toBeTruthy();
        });

        it('prefers the save error over the legacy-vault notice', () => {
            mockStatus = status({ lastError: 'x', legacyBrowserVaultIgnored: true });
            render(<LocalPersistenceNotice />);
            expect(screen.getByText('localPersistence.notice.saveError.title')).toBeTruthy();
            expect(screen.queryByText('localPersistence.notice.legacyIgnored.title')).toBeNull();
        });
    });

    describe('LocalStorageStatusCard', () => {
        it('renders nothing in cloud mode', () => {
            mockStatus = status({ mode: 'uninitialized' });
            const { container } = render(<LocalStorageStatusCard />);
            expect(container.innerHTML).toBe('');
        });

        it('shows the server location, last save time and pending changes', () => {
            mockStatus = status({ lastSavedAt: '2026-10-26T10:00:00.000Z', pending: 3 });
            render(<LocalStorageStatusCard />);
            expect(screen.getByText('localPersistence.settings.serverMode')).toBeTruthy();
            expect(screen.getByText('3')).toBeTruthy();
            expect(screen.queryByText('localPersistence.settings.neverSaved')).toBeNull();
        });

        it('shows the browser location without server-only details', () => {
            mockStatus = status({ mode: 'browser' });
            render(<LocalStorageStatusCard />);
            expect(screen.getByText('localPersistence.settings.browserMode')).toBeTruthy();
            expect(screen.queryByText('localPersistence.settings.pending')).toBeNull();
        });
    });

    describe('LocalVaultUnavailableScreen', () => {
        it('shows the reason and retries on demand', async () => {
            const onRetry = vi.fn().mockResolvedValue(undefined);
            render(<LocalVaultUnavailableScreen detail="HTTP 500" onRetry={onRetry} />);

            expect(screen.getByRole('alert')).toBeTruthy();
            expect(screen.getByText('HTTP 500')).toBeTruthy();

            fireEvent.click(screen.getByRole('button', { name: 'localPersistence.unavailable.retry' }));
            await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
            await waitFor(() => expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false));
        });
    });
});
