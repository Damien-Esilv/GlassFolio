import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '../../../src/i18n';
import { CloudSyncNotice } from '../../../src/components/security/CloudSyncNotice';
import { CloudStorageStatusCard } from '../../../src/components/security/CloudStorageStatusCard';
import * as useCloudSyncStatusModule from '../../../src/hooks/useCloudSyncStatus';
import { CloudSyncStatus } from '../../../src/services/storage/SyncedBackingStorageProvider';
import { VAULT_MAX_RECORDS, VAULT_MAX_TOTAL_BYTES } from '../../../src/services/storage/vaultQuota';

const makeStatus = (overrides: Partial<CloudSyncStatus> = {}): CloudSyncStatus => ({
    mode: 'cloud',
    pendingCount: 0,
    quotaError: null,
    syncError: false,
    usageBytes: 1024 * 1024,
    recordCount: 10,
    maxBytes: VAULT_MAX_TOTAL_BYTES,
    maxRecords: VAULT_MAX_RECORDS,
    ...overrides,
});

describe('CloudSyncNotice & CloudStorageStatusCard (Epic E38 — TGLA-214)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders nothing in local mode', () => {
        vi.spyOn(useCloudSyncStatusModule, 'useCloudSyncStatus').mockReturnValue(makeStatus({ mode: 'local' }));
        const { container: notice } = render(<CloudSyncNotice />);
        const { container: card } = render(<CloudStorageStatusCard />);
        expect(notice).toBeEmptyDOMElement();
        expect(card).toBeEmptyDOMElement();
    });

    it('renders no banner when cloud usage is healthy (< 80%)', () => {
        vi.spyOn(useCloudSyncStatusModule, 'useCloudSyncStatus').mockReturnValue(makeStatus());
        const { container } = render(<CloudSyncNotice />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders a warning status banner at >= 80% storage usage', () => {
        vi.spyOn(useCloudSyncStatusModule, 'useCloudSyncStatus').mockReturnValue(
            makeStatus({ usageBytes: Math.round(VAULT_MAX_TOTAL_BYTES * 0.85) }),
        );
        render(<CloudSyncNotice />);
        const banner = screen.getByTestId('cloud-sync-notice');
        expect(banner).toHaveAttribute('role', 'status');
        expect(banner.textContent).toContain('85');
    });

    it.each(['storage_limit', 'record_limit', 'record_size', 'header_size'] as const)(
        'renders an alert banner for quotaError=%s',
        (reason) => {
            vi.spyOn(useCloudSyncStatusModule, 'useCloudSyncStatus').mockReturnValue(
                makeStatus({ quotaError: reason, syncError: true, pendingCount: 1 }),
            );
            render(<CloudSyncNotice />);
            const banner = screen.getByTestId('cloud-sync-notice');
            expect(banner).toHaveAttribute('role', 'alert');
            expect(banner.textContent?.length).toBeGreaterThan(20);
        },
    );

    it('renders cloud storage quota usage and progressbar in Settings card', () => {
        vi.spyOn(useCloudSyncStatusModule, 'useCloudSyncStatus').mockReturnValue(
            makeStatus({ usageBytes: 2.5 * 1024 * 1024, recordCount: 18, pendingCount: 0 }),
        );
        render(<CloudStorageStatusCard />);
        const card = screen.getByTestId('cloud-storage-status');
        expect(card).toBeInTheDocument();
        const bar = screen.getByRole('progressbar');
        expect(bar).toHaveAttribute('aria-valuenow', '25');
        expect(card.textContent).toContain('18 / 64');
    });
});
