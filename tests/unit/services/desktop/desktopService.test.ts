import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    checkForDesktopUpdate,
    installDesktopUpdate,
    isDesktopApp,
    loadDesktopInfo,
    setDesktopAutoUpdateCheck,
    subscribeToDesktopUpdateState,
    type DesktopUpdateState,
    type GlassfolioDesktopApi,
} from '../../../../src/services/desktop/desktopService';

const state: DesktopUpdateState = { status: 'upToDate', strategy: 'mac-guided', version: null, progress: null, errorCode: null, checkedAt: null };

const fakeApi = (): GlassfolioDesktopApi => ({
    getInfo: vi.fn().mockResolvedValue({ version: '1.0.1', platform: 'mac', arch: 'arm64', port: 3790, mcpEntryPath: '/m/index.mjs', executablePath: '/x', autoUpdateCheck: true }),
    getUpdateState: vi.fn().mockResolvedValue(state),
    checkForUpdates: vi.fn().mockResolvedValue(state),
    installUpdate: vi.fn().mockResolvedValue(state),
    openReleasePage: vi.fn().mockResolvedValue(undefined),
    setAutoUpdateCheck: vi.fn().mockImplementation(async (enabled: boolean) => enabled),
    onUpdateState: vi.fn().mockReturnValue(() => undefined),
});

describe('desktop service', () => {
    afterEach(() => {
        delete window.glassfolioDesktop;
    });

    it('reports "not a desktop app" in a browser: every call is a harmless no-op', async () => {
        expect(isDesktopApp()).toBe(false);
        expect(await loadDesktopInfo()).toBeNull();
        expect(await checkForDesktopUpdate()).toBeNull();
        expect(await installDesktopUpdate()).toBeNull();
        expect(await setDesktopAutoUpdateCheck(false)).toBeNull();
        expect(() => subscribeToDesktopUpdateState(() => undefined)()).not.toThrow();
    });

    it('relays calls to the shell API inside the desktop app', async () => {
        const api = fakeApi();
        window.glassfolioDesktop = api;
        expect(isDesktopApp()).toBe(true);
        expect((await loadDesktopInfo())?.port).toBe(3790);
        expect(await checkForDesktopUpdate()).toEqual(state);
        expect(await setDesktopAutoUpdateCheck(false)).toBe(false);
        expect(api.setAutoUpdateCheck).toHaveBeenCalledWith(false);
        const listener = vi.fn();
        subscribeToDesktopUpdateState(listener);
        expect(api.onUpdateState).toHaveBeenCalledWith(listener);
    });
});
