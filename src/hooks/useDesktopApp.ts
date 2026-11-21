import { useCallback, useEffect, useState } from 'react';
import {
    checkForDesktopUpdate,
    getDesktopUpdateState,
    installDesktopUpdate,
    isDesktopApp,
    loadDesktopInfo,
    setDesktopAutoUpdateCheck,
    subscribeToDesktopUpdateState,
    type DesktopInfo,
    type DesktopUpdateState,
} from '../services/desktop/desktopService';

export interface DesktopAppState {
    /** False in a browser, in Docker and on the hosted app: nothing desktop-specific is shown there. */
    isDesktop: boolean;
    info: DesktopInfo | null;
    update: DesktopUpdateState | null;
    checkNow: () => Promise<void>;
    install: () => Promise<void>;
    setAutoCheck: (enabled: boolean) => Promise<void>;
}

/** Info about the desktop shell and the live state of its update check. */
export function useDesktopApp(): DesktopAppState {
    const isDesktop = isDesktopApp();
    const [info, setInfo] = useState<DesktopInfo | null>(null);
    const [update, setUpdate] = useState<DesktopUpdateState | null>(null);

    useEffect(() => {
        if (!isDesktop) return;
        let active = true;
        void loadDesktopInfo().then((value) => active && setInfo(value));
        void getDesktopUpdateState().then((value) => active && setUpdate(value));
        const unsubscribe = subscribeToDesktopUpdateState((state) => active && setUpdate(state));
        return () => {
            active = false;
            unsubscribe();
        };
    }, [isDesktop]);

    const checkNow = useCallback(async (): Promise<void> => {
        const state = await checkForDesktopUpdate();
        if (state) setUpdate(state);
    }, []);

    const install = useCallback(async (): Promise<void> => {
        const state = await installDesktopUpdate();
        if (state) setUpdate(state);
    }, []);

    const setAutoCheck = useCallback(async (enabled: boolean): Promise<void> => {
        const next = await setDesktopAutoUpdateCheck(enabled);
        if (next !== null) setInfo((current) => (current ? { ...current, autoUpdateCheck: next } : current));
    }, []);

    return { isDesktop, info, update, checkNow, install, setAutoCheck };
}
