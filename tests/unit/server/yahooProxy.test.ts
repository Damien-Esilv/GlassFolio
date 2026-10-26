import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { handleYahooProxy, isYahooProxyPath } from '../../../server/yahooProxy.mjs';

interface CapturedResponse {
  status: number;
  headers: Record<string, string | number>;
  body: string;
}

const runProxy = async (
  method: string,
  target: string,
  fetchImpl: typeof fetch,
): Promise<CapturedResponse> => {
  const captured: CapturedResponse = { status: 0, headers: {}, body: '' };
  const res = Object.assign(new EventEmitter(), {
    writeHead: (status: number, headers: Record<string, string | number>) => {
      captured.status = status;
      captured.headers = headers;
    },
    end: (chunk?: string | Buffer) => {
      captured.body = chunk ? chunk.toString() : '';
    },
  });
  await handleYahooProxy({ method }, res, new URL(target, 'http://localhost'), {
    fetchImpl,
    securityHeaders: { 'X-Content-Type-Options': 'nosniff' },
  });
  return captured;
};

const okFetch = () =>
  vi.fn(async () =>
    new Response('{"chart":{}}', { status: 200, headers: { 'content-type': 'application/json' } }),
  ) as unknown as typeof fetch;

describe('Yahoo proxy (E31 — TGLA-136)', () => {
  it('recognises only /yf paths', () => {
    expect(isYahooProxyPath('/yf')).toBe(true);
    expect(isYahooProxyPath('/yf/v8/finance/chart/AAPL')).toBe(true);
    expect(isYahooProxyPath('/yfinance')).toBe(false);
    expect(isYahooProxyPath('/api/local-vault')).toBe(false);
  });

  it('forwards an allow-listed chart request to the fixed upstream host', async () => {
    const fetchImpl = okFetch();
    const res = await runProxy('GET', '/yf/v8/finance/chart/BTC-USD?range=1d&interval=1d', fetchImpl);
    expect(res.status).toBe(200);
    expect(res.body).toBe('{"chart":{}}');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      'https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?range=1d&interval=1d',
    );
  });

  it('forwards the search endpoint', async () => {
    const res = await runProxy('GET', '/yf/v1/finance/search?q=apple', okFetch());
    expect(res.status).toBe(200);
  });

  it.each([
    '/yf/v7/finance/quote?symbols=AAPL',
    '/yf/v8/finance/chart/',
    '/yf/v8/finance/chart/../../v7/finance/quote',
    '/yf/v8/finance/chart/AAPL/extra',
    '/yf/',
  ])('rejects the non-allow-listed path %s without calling upstream', async (target) => {
    const fetchImpl = okFetch();
    const res = await runProxy('GET', target, fetchImpl);
    expect(res.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('only allows GET', async () => {
    const fetchImpl = okFetch();
    const res = await runProxy('POST', '/yf/v1/finance/search', fetchImpl);
    expect(res.status).toBe(405);
    expect(res.headers.Allow).toBe('GET');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects oversized query strings', async () => {
    const res = await runProxy('GET', `/yf/v1/finance/search?q=${'a'.repeat(600)}`, okFetch());
    expect(res.status).toBe(404);
  });

  it('answers 502 when the upstream is unreachable', async () => {
    const failing = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const res = await runProxy('GET', '/yf/v8/finance/chart/AAPL', failing);
    expect(res.status).toBe(502);
  });
});
