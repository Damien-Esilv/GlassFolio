import { MCP_TOKEN_HEADER } from './mcpBridgeSettings';
import type { McpBridgeStatus } from './mcpBridgeStatus';
import { readSse } from './sse';

export interface BridgeCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** `result` is set when the tool ran, `error` when it did not. */
export interface BridgeOutcome {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface McpBridgeClientOptions {
  /** '' when the bridge is served by the same origin as the app. */
  baseUrl: string;
  token: string;
  execute: (call: BridgeCall) => Promise<BridgeOutcome>;
  onStatus: (status: McpBridgeStatus) => void;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
}

const MAX_RESULT_CHARS = 900_000;

/**
 * The tab side of the MCP bridge: keeps a Server-Sent Events stream open to the bridge, runs each tool call
 * it receives with `execute`, and posts the outcome back. It reconnects by itself, and stops for good when
 * the bridge refuses the token or when another tab takes over.
 */
export class McpBridgeClient {
  private controller: AbortController | null = null;
  private stopped = true;
  private attempt = 0;
  private wake: (() => void) | null = null;

  constructor(private readonly options: McpBridgeClientOptions) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.run();
  }

  stop(): void {
    this.stopped = true;
    this.controller?.abort();
    this.controller = null;
    this.wake?.();
    this.options.onStatus('off');
  }

  private get fetchImpl(): typeof fetch {
    return this.options.fetchImpl ?? fetch.bind(globalThis);
  }

  private headers(): Record<string, string> {
    return { [MCP_TOKEN_HEADER]: this.options.token };
  }

  private async run(): Promise<void> {
    const delays = this.options.retryDelaysMs ?? [1000, 2000, 5000, 10_000];
    while (!this.stopped) {
      if ((await this.connectOnce()) === 'final') return;
      const delay = delays[Math.min(this.attempt, delays.length - 1)];
      this.attempt += 1;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay);
        this.wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.wake = null;
    }
  }

  private async connectOnce(): Promise<'retry' | 'final'> {
    const { baseUrl, onStatus } = this.options;
    const controller = new AbortController();
    this.controller = controller;
    onStatus('connecting');
    let response: Response;
    try {
      response = await this.fetchImpl(`${baseUrl}/mcp/bridge/events`, {
        headers: { ...this.headers(), Accept: 'text/event-stream' },
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch {
      if (this.stopped) return 'final';
      onStatus('unreachable');
      return 'retry';
    }
    if (response.status === 401 || response.status === 403) {
      onStatus('unauthorized');
      return 'final';
    }
    if (!response.ok || !response.body) {
      onStatus('unreachable');
      return 'retry';
    }

    let replaced = false;
    try {
      await readSse(response.body, (event) => {
        if (event.event === 'hello') {
          this.attempt = 0;
          onStatus('connected');
        } else if (event.event === 'call') {
          void this.handleCall(event.data);
        } else if (event.event === 'replaced') {
          replaced = true;
        }
      });
    } catch {
      // the stream dropped: handled below
    }
    if (this.stopped) return 'final';
    if (replaced) {
      onStatus('replaced');
      return 'final';
    }
    onStatus('unreachable');
    return 'retry';
  }

  private async handleCall(data: string): Promise<void> {
    let call: { id?: unknown; name?: unknown; arguments?: unknown };
    try {
      call = JSON.parse(data);
    } catch {
      return;
    }
    if (typeof call.id !== 'string' || typeof call.name !== 'string') return;
    let outcome: BridgeOutcome;
    try {
      const args = typeof call.arguments === 'object' && call.arguments !== null && !Array.isArray(call.arguments) ? (call.arguments as Record<string, unknown>) : {};
      outcome = await this.options.execute({ name: call.name, arguments: args });
    } catch (error) {
      outcome = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    await this.postResult(call.id, outcome);
  }

  private async postResult(id: string, outcome: BridgeOutcome): Promise<void> {
    let body: string;
    try {
      body = JSON.stringify(outcome.ok ? { id, ok: true, result: outcome.result } : { id, ok: false, error: outcome.error ?? 'The tool failed.' });
      if (body.length > MAX_RESULT_CHARS) body = JSON.stringify({ id, ok: false, error: 'The result is too large to send. Ask for less data.' });
    } catch {
      body = JSON.stringify({ id, ok: false, error: 'The result could not be encoded.' });
    }
    try {
      await this.fetchImpl(`${this.options.baseUrl}/mcp/bridge/result`, {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body,
      });
    } catch {
      // the bridge is gone: the client of the AI already got its own error
    }
  }
}
