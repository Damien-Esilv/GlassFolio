/**
 * Bridge to the GlassFolio desktop app (the Electron shell in `desktop/`).
 *
 * The shell exposes one small, frozen API as `window.glassfolioDesktop`; in a browser, in Docker or on the
 * hosted app it does not exist and every function below reports "not a desktop app". The shell keeps the
 * device settings (automatic update check) in its own process, so nothing here touches storage.
 */

export type DesktopPlatform = 'mac' | 'win' | 'linux';
export type DesktopUpdateStatus = 'idle' | 'checking' | 'upToDate' | 'available' | 'downloading' | 'restarting' | 'error';
/** How the new version gets installed: by the app itself, by our own macOS swap, through the release page, or not at all. */
export type DesktopUpdateStrategy = 'standard' | 'mac-guided' | 'manual' | 'disabled';

export interface DesktopInfo {
    version: string;
    platform: DesktopPlatform;
    arch: string;
    port: number;
    /** Where the MCP server bundled with the app lives (for AI clients that start it themselves). */
    mcpEntryPath: string;
    executablePath: string;
    autoUpdateCheck: boolean;
}

export interface DesktopUpdateState {
    status: DesktopUpdateStatus;
    strategy: DesktopUpdateStrategy;
    version: string | null;
    /** 0..1 while downloading. */
    progress: number | null;
    errorCode: string | null;
    checkedAt: string | null;
}

export interface GlassfolioDesktopApi {
    getInfo: () => Promise<DesktopInfo>;
    getUpdateState: () => Promise<DesktopUpdateState>;
    checkForUpdates: () => Promise<DesktopUpdateState>;
    installUpdate: () => Promise<DesktopUpdateState>;
    openReleasePage: () => Promise<void>;
    setAutoUpdateCheck: (enabled: boolean) => Promise<boolean>;
    onUpdateState: (listener: (state: DesktopUpdateState) => void) => () => void;
}

declare global {
    interface Window {
        glassfolioDesktop?: GlassfolioDesktopApi;
    }
}

const api = (): GlassfolioDesktopApi | null => (typeof window === 'undefined' ? null : (window.glassfolioDesktop ?? null));

export const isDesktopApp = (): boolean => api() !== null;

export async function loadDesktopInfo(): Promise<DesktopInfo | null> {
    return api()?.getInfo() ?? null;
}

export async function getDesktopUpdateState(): Promise<DesktopUpdateState | null> {
    return api()?.getUpdateState() ?? null;
}

export async function checkForDesktopUpdate(): Promise<DesktopUpdateState | null> {
    return api()?.checkForUpdates() ?? null;
}

export async function installDesktopUpdate(): Promise<DesktopUpdateState | null> {
    return api()?.installUpdate() ?? null;
}

export async function openDesktopReleasePage(): Promise<void> {
    await api()?.openReleasePage();
}

export async function setDesktopAutoUpdateCheck(enabled: boolean): Promise<boolean | null> {
    return api()?.setAutoUpdateCheck(enabled) ?? null;
}

/** Subscribes to update progress pushed by the shell. Returns the unsubscribe function. */
export function subscribeToDesktopUpdateState(listener: (state: DesktopUpdateState) => void): () => void {
    return api()?.onUpdateState(listener) ?? ((): void => undefined);
}
