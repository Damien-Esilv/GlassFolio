/**
 * Minimal JSON-RPC batch client for the public blockchain endpoints (TGLA-221). One HTTP request per
 * chain; any error fails the whole batch, so a wallet is never reconciled from a partial answer.
 */
import { z } from 'zod';
import { ConnectorError, errorCodeForStatus } from '../types';

const REQUEST_TIMEOUT_MS = 10_000;

export interface RpcCall {
    method: string;
    params: unknown[];
}

const RpcResponseSchema = z.array(
    z.object({
        id: z.number(),
        result: z.unknown().optional(),
        error: z.object({ code: z.number(), message: z.string() }).optional(),
    })
);

/** Results in call order. Throws `ConnectorError` on a transport, HTTP or RPC error. */
export async function rpcBatch(url: string, calls: RpcCall[]): Promise<unknown[]> {
    if (calls.length === 0) return [];
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(calls.map((call, index) => ({ jsonrpc: '2.0', id: index, ...call }))),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch {
        throw new ConnectorError('network');
    }
    if (!response.ok) throw new ConnectorError(errorCodeForStatus(response.status));
    const parsed = RpcResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new ConnectorError('invalid_response');
    const byId = new Map(parsed.data.map(entry => [entry.id, entry]));
    return calls.map((_, index) => {
        const entry = byId.get(index);
        if (!entry || entry.error || entry.result === undefined) {
            throw new ConnectorError(entry?.error?.code === 429 ? 'rate_limited' : 'invalid_response');
        }
        return entry.result;
    });
}

/** A 0x-prefixed hex quantity (eth_getBalance, eth_call) as a bigint. */
export function hexToBigInt(value: unknown): bigint {
    if (typeof value !== 'string' || !/^0x[0-9a-fA-F]*$/.test(value)) throw new ConnectorError('invalid_response');
    return value === '0x' ? 0n : BigInt(value);
}
