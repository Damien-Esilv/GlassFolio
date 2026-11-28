/**
 * Demo vault (Epic E52): a bank, a broker (SnapTrade) and crypto wallets show as connected. The bank and the broker
 * are fictitious: a sync of them changes nothing and never reaches a provider.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../src/services/db', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../../src/services/db')>();
    return { ...actual, delay: () => Promise.resolve() };
});

import { connectionService, syncEngine } from '../../../../src/services/connectors';

describe('demo connections', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => vi.unstubAllGlobals());

    it('shows a bank, SnapTrade and wallets connected, the cash accounts fed by the bank', async () => {
        const connections = await connectionService.listConnections();
        expect(new Set(connections.map(connection => connection.sourceId))).toEqual(new Set(['woob', 'snaptrade', 'wallet_btc', 'wallet_evm', 'wallet_sol']));
        const bank = connections.find(connection => connection.sourceId === 'woob');
        expect(Object.values(bank?.accountMap ?? {})).toEqual(expect.arrayContaining(['acc-bourso-checking', 'acc-bourso-livret']));
        expect(bank).toMatchObject({ lastStatus: 'ok', cashHistory: true, publicParams: expect.objectContaining({ demo: true }) });
        expect(bank?.credentialPreviews).toEqual({});
    });

    it('a sync of a fictitious source never calls a provider', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        for (const id of ['conn-demo-bank', 'conn-demo-snaptrade']) {
            const report = await syncEngine.runSync(id);
            expect(report).toMatchObject({ status: 'ok', accounts: [] });
        }
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
