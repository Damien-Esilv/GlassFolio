/**
 * SnapTrade card (TGLA-235): once linked, the same card shows the connection and its broker accounts,
 * with "Manage accounts" to choose again where each one goes. One SnapTrade account covers every broker.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '../../../src/i18n';

vi.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

import { SnapTradeConnectCard } from '../../../src/components/connections/SnapTradeConnectCard';
import { syncEngine } from '../../../src/services/connectors';
import type { SafeConnection } from '../../../src/types/connections';

const connection: SafeConnection = {
    id: 'conn-1', ownerId: 'u', sourceId: 'snaptrade', label: 'SnapTrade Personal',
    accountMap: { 'ibkr-pea': 'acc-pea' },
    credentialPreviews: { clientId: '••••••••1234', consumerKey: '••••••••abcd' },
    publicParams: { accountNames: { 'ibkr-pea': 'IBKR PEA ****1234' } },
    mode: 'history', syncIntervalHours: 24, cursor: {}, lastStatus: 'ok',
    lastSyncAt: '2026-11-23T08:00:00.000Z', createdAt: '2026-11-23T07:00:00.000Z', updatedAt: '2026-11-23T07:00:00.000Z',
};

const props = {
    accountChoices: [{ id: 'acc-pea', label: 'Interactive Brokers · PEA' }, { id: 'acc-crypto', label: 'Bitget · Crypto' }],
    describeAccount: (id: string) => (id === 'acc-pea' ? 'Interactive Brokers · PEA' : id),
    syncing: false,
    busy: false,
    onSync: vi.fn(async () => undefined),
    onDelete: vi.fn(async () => undefined),
    onChanged: vi.fn(async () => undefined),
};

afterEach(() => vi.restoreAllMocks());

describe('<SnapTradeConnectCard />', () => {
    it('asks for the keys while nothing is linked', () => {
        render(<SnapTradeConnectCard {...props} connection={null} />);
        expect(screen.getByLabelText('Client ID')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Test and list my accounts' })).toBeTruthy();
    });

    it('once linked, shows the connection and where each broker account is recorded, never the keys form', () => {
        render(<SnapTradeConnectCard {...props} connection={connection} />);
        expect(screen.queryByLabelText('Client ID')).toBeNull();
        expect(screen.getByText('Keys saved in your vault · Client ID ••••••••1234')).toBeTruthy();
        expect(screen.getByText('IBKR PEA ****1234')).toBeTruthy();
        expect(screen.getByText('Recorded in Interactive Brokers · PEA')).toBeTruthy();
        expect(screen.getByText('Up to date')).toBeTruthy();
    });

    it('"Manage accounts" lists the broker accounts again, keeping the current choices', async () => {
        vi.spyOn(syncEngine, 'listExternalAccounts').mockResolvedValue([
            { externalId: 'ibkr-pea', name: 'IBKR PEA ****1234' },
            { externalId: 'binance-1', name: 'Binance' },
        ]);
        render(<SnapTradeConnectCard {...props} connection={connection} />);
        fireEvent.click(screen.getByRole('button', { name: 'Manage accounts' }));

        const current = await screen.findByLabelText('Record in', { selector: '#snaptrade-target-ibkr-pea' }) as HTMLSelectElement;
        expect(current.value).toBe('acc-pea');
        // A broker account linked later is not synced until it is given an account
        expect((screen.getByLabelText('Record in', { selector: '#snaptrade-target-binance-1' }) as HTMLSelectElement).value).toBe('__skip__');
        expect(syncEngine.listExternalAccounts).toHaveBeenCalledWith('conn-1');
    });
});
