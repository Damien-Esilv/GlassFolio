/**
 * A new deployment replaces the hashed chunks: an open tab then fails to load a page it had not
 * opened yet. Reload once to pick up the new build; a second failure soon after is left to the error
 * screen, so a chunk that is really missing never loops.
 */
const RELOAD_MARK_KEY = 'gf_chunk_reload_at';
const RELOAD_WINDOW_MS = 60_000;

export function installChunkReloadHandler(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('vite:preloadError', (event) => {
        let lastReload = 0;
        try {
            lastReload = Number(sessionStorage.getItem(RELOAD_MARK_KEY) || 0);
        } catch {
            // Storage blocked: reload anyway, the error screen covers a second failure
        }
        if (Date.now() - lastReload < RELOAD_WINDOW_MS) return;
        event.preventDefault();
        try {
            sessionStorage.setItem(RELOAD_MARK_KEY, String(Date.now()));
        } catch {
            // ignore
        }
        window.location.reload();
    });
}
