/**
 * French banks through Woob (TGLA-237): the worker's picture of a PEA (ETF, cash, euro fund) and of a
 * savings account lands in the journal as a snapshot, once; the sync never asks for a code; a bank that
 * wants a new validation stops the automatic syncs; credentials only go to the local server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../src/services/db', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../../src/services/db')>();
    return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { connectionService, syncEngine, woobClient } from '../../../../src/services/connectors';
import { clearWoobRunCache, euroFundSymbol, toNormalizedHolding } from '../../../../src/services/connectors/sources/woob';
import { portfolioService } from '../../../../src/services/portfolioService';
import { getManualPriceHistory } from '../../../../src/services/priceService';

const PEA = {
    id: 'pea-1', label: 'PEA Damien', type: 'investment', wrapper: 'PEA', kind: 'investment', currency: 'EUR', balance: '5462.34',
    warnings: [],
    holdings: [
        { kind: 'security', isin: 'FR0011869353', code: 'FR0011869353', symbol: null, name: 'Amundi PEA Monde', quantity: '10', avgCost: '42.15', unitValue: '45', currency: 'EUR', marketValue: '450' },
        { kind: 'cash', name: 'Liquidités', currency: 'EUR', quantity: '12.34', marketValue: '12.34' },
        { kind: 'euro_fund', code: null, name: 'Fonds en euros Sécurité', currency: 'EUR', quantity: '5000', marketValue: '5000' },
    ],
};
const LIVRET = { id: 'la-1', label: 'Livret A', type: 'savings', wrapper: 'LIVRET', kind: 'cash', currency: 'EUR', balance: '22950', warnings: [],
    holdings: [{ kind: 'cash', name: 'Livret A', currency: 'EUR', quantity: '22950', marketValue: '22950' }] };

const CREDENTIALS = { login: '12345678', password: 'secret-Passw0rd' };

interface Sent { url: string; body: Record<string, unknown>; headers: Record<string, string> }

const worker = (sent: Sent[], answer: (route: string) => unknown) =>
    vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        sent.push({ url, body, headers: init?.headers as Record<string, string> });
        return new Response(JSON.stringify(answer(url.replace('/api/woob/', ''))), { status: 200 });
    });

const seed = async (): Promise<void> => {
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('woob@example.test', 'Woob-Test-Key-2026!#xx', 'Woob');
    db.saveInstitutes([{ id: 'inst-bourso', ownerId: 'u', name: 'BoursoBank', type: 'bank' } as never]);
    db.saveAccounts([
        { id: 'acc-pea', ownerId: 'u', instituteId: 'inst-bourso', name: 'PEA', type: 'investment', wrapperType: 'PEA', defaultCurrency: 'EUR', isActive: true } as never,
        { id: 'acc-livret', ownerId: 'u', instituteId: 'inst-bourso', name: 'Livret A', type: 'savings', wrapperType: 'LIVRET', defaultCurrency: 'EUR', isActive: true } as never,
    ]);
};

const bankConnection = () => connectionService.createConnection({
    sourceId: 'woob', label: 'BoursoBank', credentials: CREDENTIALS,
    publicParams: { module: 'boursorama' }, accountMap: { 'pea-1': 'acc-pea', 'la-1': 'acc-livret' },
});

describe('Woob source', () => {
    beforeEach(async () => {
        clearWoobRunCache();
        await seed();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('records the PEA lines, its cash and euro fund, and the savings balance, in one bank call', async () => {
        const sent: Sent[] = [];
        vi.stubGlobal('fetch', worker(sent, () => ({ ok: true, result: { accounts: [PEA, LIVRET], cached: false } })));
        const connection = await bankConnection();
        expect(connection.mode).toBe('holdings');

        const report = await syncEngine.runSync(connection.id);
        expect(report.status).toBe('ok');
        expect(sent.filter(call => call.url === '/api/woob/holdings')).toHaveLength(1);
        expect(sent[0].body).toEqual({ key: connection.id, module: 'boursorama', credentials: CREDENTIALS });
        expect(sent[0].headers['X-GlassFolio-Local']).toBe('1');

        await portfolioService.recalculatePositions();
        const pea = db.getPositions().filter(position => position.accountId === 'acc-pea');
        const bySymbol = Object.fromEntries(pea.map(position => [position.isin || position.symbol, position]));
        expect(bySymbol.FR0011869353).toMatchObject({ quantity: 10, avgCost: 42.15 });
        expect(bySymbol.EUR).toMatchObject({ quantity: 12.34, type: 'Cash' });
        const fund = bySymbol[euroFundSymbol(null, 'Fonds en euros Sécurité')];
        expect(fund).toMatchObject({ quantity: 5000, avgCost: 1 });
        expect(getManualPriceHistory(euroFundSymbol(null, 'Fonds en euros Sécurité')).at(-1)?.price).toBe(1);

        const livret = db.getPositions().filter(position => position.accountId === 'acc-livret');
        expect(livret).toEqual([expect.objectContaining({ symbol: 'EUR', quantity: 22950, type: 'Cash' })]);
    });

    it('a second sync of the same picture writes nothing', async () => {
        vi.stubGlobal('fetch', worker([], () => ({ ok: true, result: { accounts: [PEA, LIVRET], cached: true } })));
        const connection = await bankConnection();
        await syncEngine.runSync(connection.id);
        const rows = db.getUnifiedTransactions().length;
        clearWoobRunCache();
        const second = await syncEngine.runSync(connection.id);
        expect(second.accounts.every(account => account.imported === 0)).toBe(true);
        expect(db.getUnifiedTransactions()).toHaveLength(rows);
    });

    it('the bank closes a line the account no longer holds', async () => {
        vi.stubGlobal('fetch', worker([], () => ({ ok: true, result: { accounts: [PEA, LIVRET] } })));
        const connection = await bankConnection();
        await syncEngine.runSync(connection.id);
        clearWoobRunCache();
        const sold = { ...PEA, holdings: PEA.holdings.filter(holding => holding.kind !== 'security') };
        vi.stubGlobal('fetch', worker([], () => ({ ok: true, result: { accounts: [sold, LIVRET] } })));
        await syncEngine.runSync(connection.id);
        await portfolioService.recalculatePositions();
        const etf = db.getPositions().find(position => position.accountId === 'acc-pea' && position.isin === 'FR0011869353');
        expect(etf?.quantity ?? 0).toBe(0);
    });

    it('a bank asking for a new validation stops the automatic syncs and says so', async () => {
        vi.stubGlobal('fetch', worker([], () => ({ ok: false, error: { code: 'reauth_required', message: '' } })));
        const connection = await bankConnection();
        const report = await syncEngine.runSync(connection.id);
        expect(report.status).toBe('reauth_required');
        const stored = await connectionService.getConnection(connection.id);
        expect(stored?.lastErrorCode).toBe('reauth_required');
        expect(syncEngine.isDue(stored!)).toBe(false);
        expect(db.getUnifiedTransactions()).toHaveLength(0);
    });

    it('no local worker: a clear error, nothing written', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
        const connection = await bankConnection();
        const report = await syncEngine.runSync(connection.id);
        expect(report.errorCode).toBe('companion_unavailable');
    });

    it('removing the connection deletes the saved bank session', async () => {
        const sent: Sent[] = [];
        vi.stubGlobal('fetch', worker(sent, () => ({ ok: true, result: { forgotten: true } })));
        const connection = await bankConnection();
        await connectionService.deleteConnection(connection.id);
        expect(sent).toEqual([expect.objectContaining({ url: '/api/woob/forget', body: { key: connection.id } })]);
    });

    it('bank credentials are redacted from what the assistant sends out', async () => {
        const { guardrailsService } = await import('../../../../src/services/ai/guardrailsService');
        await bankConnection();
        expect(guardrailsService.redactSensitiveExfiltrations('my password is secret-Passw0rd')).not.toContain('secret-Passw0rd');
    });
});

describe('Woob holding mapping', () => {
    it('keeps the ISIN, else the bank code; cash in its currency at 1', () => {
        expect(toNormalizedHolding(PEA.holdings[0] as never, 'pea-1')).toMatchObject({ isin: 'FR0011869353', symbol: undefined, avgCost: '42.15' });
        expect(toNormalizedHolding({ ...PEA.holdings[0], isin: null, code: 'QS0002005324' } as never, 'pea-1')).toMatchObject({ isin: undefined, symbol: 'QS0002005324' });
        expect(toNormalizedHolding(PEA.holdings[1] as never, 'pea-1')).toMatchObject({ symbol: 'EUR', instrumentType: 'cash', avgCost: '1' });
        expect(euroFundSymbol(null, 'Fonds en euros Sécurité')).toBe('FDE-FONDS-EN-EUROS-SECUR');
        expect(euroFundSymbol('FDE123', 'x')).toBe('FDE123');
    });

    it('the online app never calls a worker', async () => {
        const deployment = await import('../../../../src/config/deployment');
        const spy = vi.spyOn(deployment, 'getDeploymentMode').mockReturnValue('cloud');
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        expect(await woobClient.status()).toEqual({ available: false });
        await expect(woobClient.holdings({ key: 'k', module: 'boursorama', credentials: {} })).rejects.toMatchObject({ code: 'companion_unavailable' });
        expect(fetchMock).not.toHaveBeenCalled();
        spy.mockRestore();
        vi.unstubAllGlobals();
    });
});
