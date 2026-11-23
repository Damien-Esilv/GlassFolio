/**
 * Removing a source asks once more in place: the bin becomes "Confirm removal" where it stood, and the other
 * actions give way to what the removal deletes.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../../../src/i18n';
import { SyncControls } from '../../../src/components/connections/ConnectionRow';
import type { SafeConnection } from '../../../src/types/connections';

const connection = { id: 'conn-1', lastSyncAt: '2026-11-23T19:06:00.000Z', lastErrorCode: null } as unknown as SafeConnection;

describe('<SyncControls />', () => {
    it('turns the bin into the confirmation, then removes on confirm', async () => {
        const onDelete = vi.fn(async () => undefined);
        render(
            <SyncControls connection={connection} syncing={false} disabled={false} onSync={vi.fn()} onDelete={onDelete}>
                <button type="button">Reconnect</button>
            </SyncControls>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Remove this source' }));
        expect(screen.getByRole('alert').textContent).toContain('the operations it imported');
        expect(screen.queryByRole('button', { name: /Sync now/ })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
        // The confirmation is the last action, where the bin was
        const buttons = screen.getAllByRole('button');
        expect(buttons[buttons.length - 1].textContent).toBe('Confirm removal');

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.getByRole('button', { name: /Sync now/ })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Remove this source' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
        await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
    });
});
