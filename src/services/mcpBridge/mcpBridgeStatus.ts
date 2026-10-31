export type McpBridgeStatus = 'off' | 'locked' | 'needsToken' | 'connecting' | 'connected' | 'unauthorized' | 'unreachable' | 'replaced';

let status: McpBridgeStatus = 'off';
const listeners = new Set<() => void>();

export const getMcpBridgeStatus = (): McpBridgeStatus => status;

export function setMcpBridgeStatus(next: McpBridgeStatus): void {
  if (next === status) return;
  status = next;
  listeners.forEach((listener) => listener());
}

export function subscribeMcpBridgeStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
