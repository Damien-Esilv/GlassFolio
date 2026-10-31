import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOKEN_HEADER, createMcpBridge } from '../../../mcp-server/bridge.mjs';

export const TOKEN = 'a'.repeat(32);
export { TOKEN_HEADER };
export const catalog = JSON.parse(readFileSync(join(process.cwd(), 'mcp-server/tools.json'), 'utf-8')) as {
  tools: Array<{ name: string; description: string; inputSchema: { type: string }; annotations: { readOnlyHint: boolean } }>;
};

export interface RunningBridge {
  bridge: ReturnType<typeof createMcpBridge>;
  server: http.Server;
  base: string;
  port: number;
  stop: () => Promise<void>;
}

export async function startBridge(options: Partial<Parameters<typeof createMcpBridge>[0]> = {}): Promise<RunningBridge> {
  const bridge = createMcpBridge({ token: TOKEN, tools: catalog.tools, version: '9.9.9', callTimeoutMs: 400, keepAliveMs: 50, ...options });
  const server = http.createServer((req, res) => {
    bridge.handle(req, res, new URL(req.url ?? '/', 'http://localhost')).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    bridge,
    server,
    port,
    base: `http://127.0.0.1:${port}`,
    stop: async () => {
      bridge.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export const authHeaders = { [TOKEN_HEADER]: TOKEN, 'Content-Type': 'application/json' };

export const rpc = async (base: string, body: unknown, headers: Record<string, string> = authHeaders): Promise<{ status: number; json: any; headers: Headers }> => {
  const res = await fetch(`${base}/mcp`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : undefined, headers: res.headers };
};

/** A request with headers that fetch refuses to send (Host). */
export const rawRequest = (port: number, options: { method?: string; path: string; headers: Record<string, string>; body?: string }): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: options.method ?? 'GET', path: options.path, headers: options.headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end(options.body);
  });

export interface FakeTab {
  next: (event: string, timeoutMs?: number) => Promise<any>;
  postResult: (payload: unknown) => Promise<number>;
  close: () => void;
  events: Array<{ event: string; data: any }>;
}

/** What the GlassFolio tab does: open the SSE stream, read its events, post results back. */
export async function connectTab(base: string, headers: Record<string, string> = { [TOKEN_HEADER]: TOKEN }): Promise<FakeTab> {
  const controller = new AbortController();
  const res = await fetch(`${base}/mcp/bridge/events`, { headers, signal: controller.signal });
  if (!res.ok || !res.body) throw new Error(`tab refused: ${res.status}`);
  const events: FakeTab['events'] = [];
  const waiters: Array<() => void> = [];
  void (async () => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (event) {
            events.push({ event, data: data ? JSON.parse(data) : null });
            waiters.splice(0).forEach((wake) => wake());
          }
        }
      }
    } catch {
      // aborted
    }
  })();
  const next: FakeTab['next'] = async (event, timeoutMs = 2000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const index = events.findIndex((entry) => entry.event === event);
      if (index >= 0) return events.splice(index, 1)[0].data;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`no "${event}" event`);
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
        setTimeout(resolve, left);
      });
    }
  };
  return {
    next,
    events,
    close: () => controller.abort(),
    postResult: async (payload) => (await fetch(`${base}/mcp/bridge/result`, { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) })).status,
  };
}
