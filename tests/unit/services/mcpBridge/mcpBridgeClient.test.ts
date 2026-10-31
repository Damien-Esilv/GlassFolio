import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpBridgeClient, type BridgeCall, type BridgeOutcome } from '../../../../src/services/mcpBridge/mcpBridgeClient';
import type { McpBridgeStatus } from '../../../../src/services/mcpBridge/mcpBridgeStatus';

interface Stream {
  push: (text: string) => void;
  end: () => void;
}
interface Harness {
  fetchImpl: ReturnType<typeof vi.fn>;
  streams: Stream[];
  posts: Array<{ url: string; headers: Record<string, string>; body: any }>;
  statuses: McpBridgeStatus[];
}

const eventsResponse = (harness: Harness): Response => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
  const encoder = new TextEncoder();
  harness.streams.push({ push: (text) => controller.enqueue(encoder.encode(text)), end: () => controller.close() });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
};

const harness = (events: (harness: Harness, attempt: number) => Response | Promise<Response>): Harness => {
  const h: Harness = { fetchImpl: vi.fn(), streams: [], posts: [], statuses: [] };
  let attempt = 0;
  h.fetchImpl.mockImplementation(async (url: string, init: RequestInit) => {
    if (url.endsWith('/mcp/bridge/events')) return events(h, attempt++);
    h.posts.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return new Response(null, { status: 204 });
  });
  return h;
};

const waitFor = async (check: () => boolean, what: string): Promise<void> => {
  const deadline = Date.now() + 2000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timeout: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

let client: McpBridgeClient | undefined;
afterEach(() => client?.stop());

const make = (h: Harness, execute: (call: BridgeCall) => Promise<BridgeOutcome> = async () => ({ ok: true, result: 'x' }), baseUrl = 'http://127.0.0.1:47831'): McpBridgeClient =>
  (client = new McpBridgeClient({ baseUrl, token: 'tok', execute, onStatus: (s) => h.statuses.push(s), fetchImpl: h.fetchImpl as unknown as typeof fetch, retryDelaysMs: [5] }));

describe('tab side of the MCP bridge', () => {
  it('opens the event stream with the token, and is connected once the bridge says hello', async () => {
    const h = harness((hh) => eventsResponse(hh));
    make(h).start();
    await waitFor(() => h.streams.length === 1, 'stream');
    const [url, init] = h.fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:47831/mcp/bridge/events');
    expect(init.headers).toMatchObject({ 'X-GlassFolio-Token': 'tok', Accept: 'text/event-stream' });
    h.streams[0].push('event: hello\ndata: {"version":"1","tools":35}\n\n');
    await waitFor(() => h.statuses.includes('connected'), 'connected');
    expect(h.statuses).toEqual(['connecting', 'connected']);
  });

  it('runs a call it receives and posts the result back with the same id', async () => {
    const execute = vi.fn(async (): Promise<BridgeOutcome> => ({ ok: true, result: '{"totalValue":42}' }));
    const h = harness((hh) => eventsResponse(hh));
    make(h, execute, '').start();
    await waitFor(() => h.streams.length === 1, 'stream');
    h.streams[0].push('event: call\ndata: {"id":"c1","name":"get_portfolio_summary","arguments":{"currency":"EUR"}}\n\n');
    await waitFor(() => h.posts.length === 1, 'result');
    expect(execute).toHaveBeenCalledWith({ name: 'get_portfolio_summary', arguments: { currency: 'EUR' } });
    expect(h.posts[0].url).toBe('/mcp/bridge/result');
    expect(h.posts[0].headers['X-GlassFolio-Token']).toBe('tok');
    expect(h.posts[0].body).toEqual({ id: 'c1', ok: true, result: '{"totalValue":42}' });
  });

  it('reports a failing tool as an error result instead of dropping the call', async () => {
    const h = harness((hh) => eventsResponse(hh));
    make(h, async () => { throw new Error('boom'); }).start();
    await waitFor(() => h.streams.length === 1, 'stream');
    h.streams[0].push('event: call\ndata: {"id":"c2","name":"x","arguments":[]}\n\n');
    await waitFor(() => h.posts.length === 1, 'result');
    expect(h.posts[0].body).toEqual({ id: 'c2', ok: false, error: 'boom' });
  });

  it('turns a result that is too large or cannot be encoded into an error', async () => {
    const h = harness((hh) => eventsResponse(hh));
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    let n = 0;
    make(h, async () => (++n === 1 ? { ok: true, result: 'x'.repeat(1_000_000) } : { ok: true, result: circular })).start();
    await waitFor(() => h.streams.length === 1, 'stream');
    h.streams[0].push('event: call\ndata: {"id":"big","name":"x","arguments":{}}\n\nevent: call\ndata: {"id":"loop","name":"x","arguments":{}}\n\n');
    await waitFor(() => h.posts.length === 2, 'results');
    expect(h.posts.map((post) => post.body.ok)).toEqual([false, false]);
    expect(h.posts[0].body.error).toMatch(/too large/);
    expect(h.posts[1].body.error).toMatch(/encoded/);
  });

  it('ignores a call it cannot read', async () => {
    const execute = vi.fn();
    const h = harness((hh) => eventsResponse(hh));
    make(h, execute).start();
    await waitFor(() => h.streams.length === 1, 'stream');
    h.streams[0].push('event: call\ndata: not json\n\nevent: call\ndata: {"name":"x"}\n\n');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(execute).not.toHaveBeenCalled();
    expect(h.posts).toHaveLength(0);
  });

  it('stops for good when the bridge refuses the token', async () => {
    const h = harness(() => new Response('{}', { status: 401 }));
    make(h).start();
    await waitFor(() => h.statuses.includes('unauthorized'), 'unauthorized');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reconnects by itself when the stream drops', async () => {
    const h = harness((hh) => eventsResponse(hh));
    make(h).start();
    await waitFor(() => h.streams.length === 1, 'stream 1');
    h.streams[0].end();
    await waitFor(() => h.streams.length === 2, 'stream 2');
    expect(h.statuses).toContain('unreachable');
    expect(h.statuses.filter((s) => s === 'connecting')).toHaveLength(2);
  });

  it('retries when the bridge cannot be reached, then connects', async () => {
    const h = harness((hh, attempt) => { if (attempt === 0) throw new Error('refused'); return eventsResponse(hh); });
    make(h).start();
    await waitFor(() => h.streams.length === 1, 'stream');
    expect(h.statuses.slice(0, 3)).toEqual(['connecting', 'unreachable', 'connecting']);
  });

  it('does not fight another tab that took over', async () => {
    const h = harness((hh) => eventsResponse(hh));
    make(h).start();
    await waitFor(() => h.streams.length === 1, 'stream');
    h.streams[0].push('event: replaced\ndata: {}\n\n');
    h.streams[0].end();
    await waitFor(() => h.statuses.includes('replaced'), 'replaced');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(h.streams).toHaveLength(1);
  });

  it('stops cleanly: no reconnection, status off', async () => {
    const h = harness((hh) => eventsResponse(hh));
    const instance = make(h);
    instance.start();
    await waitFor(() => h.streams.length === 1, 'stream');
    instance.stop();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(h.streams).toHaveLength(1);
    expect(h.statuses[h.statuses.length - 1]).toBe('off');
  });
});
