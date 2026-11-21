import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isinResolver, pickListing } from '../../../../src/services/market/isinResolver';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('ISIN resolver (TGLA-221)', () => {
  beforeEach(() => {
    isinResolver.clearCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers the listing of the account currency', () => {
    expect(pickListing(['IWDA.L', 'IWDA.AS', 'EUNL.DE'], 'EUR')).toBe('IWDA.AS');
    expect(pickListing(['CW8.PA', 'CW8.AS'], 'EUR')).toBe('CW8.PA');
    expect(pickListing(['IWDA.L', 'IWDA.AS'], 'GBP')).toBe('IWDA.L');
    expect(pickListing(['VOO'], 'JPY')).toBe('VOO');
    expect(pickListing([], 'EUR')).toBeUndefined();
  });

  it('ignores anything that is not an ISIN, without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await isinResolver.resolve('CW8', 'EUR')).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('takes the Yahoo symbol when it already matches the currency, then serves it from cache', async () => {
    const fetchMock = vi.fn(async () => json({ quotes: [{ symbol: 'CW8.PA', quoteType: 'ETF' }] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await isinResolver.resolve('LU1681043599', 'EUR')).toBe('CW8.PA');
    expect(await isinResolver.resolve('lu1681043599', 'EUR')).toBe('CW8.PA');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('/v1/finance/search?q=LU1681043599');
  });

  it('completes a single foreign listing with OpenFIGI through the relay', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('/v1/finance/search')
        ? json({ quotes: [{ symbol: 'IWDA.L', quoteType: 'ETF' }] })
        : json([{ data: [{ ticker: 'IWDA', exchCode: 'NA' }, { ticker: 'IWDA', exchCode: 'LN' }, { ticker: 'X', exchCode: 'ZZ' }] }]),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await isinResolver.resolve('IE00B4L5Y983', 'EUR')).toBe('IWDA.AS');
    const relayCall = fetchMock.mock.calls.find(([url]) => url === '/api/connector-relay') as unknown as [string, RequestInit];
    expect(JSON.parse(relayCall[1].body as string)).toMatchObject({ provider: 'openfigi', path: '/v3/mapping' });
  });

  it('remembers an unknown ISIN for a day instead of asking again', async () => {
    const fetchMock = vi.fn(async () => json({ quotes: [] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await isinResolver.resolve('FR0000000000', 'EUR')).toBeUndefined();
    const calls = fetchMock.mock.calls.length;
    expect(await isinResolver.resolve('FR0000000000', 'EUR')).toBeUndefined();
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('never throws when every source fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await isinResolver.resolve('US0378331005', 'USD')).toBeUndefined();
  });
});
