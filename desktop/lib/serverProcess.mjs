import { HEALTH_POLL_MS, HEALTH_TIMEOUT_MS, SERVER_HOST } from './constants.mjs';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls the server's /health until it answers 200, the child exits, or the timeout elapses. */
export async function waitForHealth({ port, isAlive = () => true, timeoutMs = HEALTH_TIMEOUT_MS, fetchImpl = fetch }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) return false;
    try {
      const response = await fetchImpl(`http://${SERVER_HOST}:${port}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return true;
    } catch {
      // not listening yet
    }
    await delay(HEALTH_POLL_MS);
  }
  return false;
}
