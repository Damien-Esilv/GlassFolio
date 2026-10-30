/**
 * Whether the demo account is offered (TGLA-188).
 *
 * Online, the demo is part of the public showcase. A local install is someone's own app: the demo
 * only exists when the server was started for it (`npm run dev:demo`, `GLASSFOLIO_DEMO=1`), and
 * then the app opens on it directly.
 */
import { getDeploymentMode } from '../config/deployment';
import { fetchLocalConfig } from './storage/localVaultClient';

let localDemo: Promise<boolean> | null = null;
let autoStartConsumed = false;

export const demoAvailability = {
    isDemoOffered: (): Promise<boolean> => {
        if (getDeploymentMode() !== 'local') return Promise.resolve(true);
        localDemo ??= fetchLocalConfig().then(config => config.demo);
        return localDemo;
    },

    /**
     * True once per page load when a local demo launch should open the demo by itself. Signing out
     * of it then shows the sign-in page instead of re-opening the demo at once.
     * Call it only when about to launch: it is spent synchronously.
     */
    claimAutoStart: async (stillWanted: () => boolean = () => true): Promise<boolean> => {
        if (getDeploymentMode() !== 'local' || autoStartConsumed) return false;
        const offered = await demoAvailability.isDemoOffered();
        // A caller that went away meanwhile (StrictMode remount) leaves it to the next one
        if (!offered || autoStartConsumed || !stillWanted()) return false;
        autoStartConsumed = true;
        return true;
    },

    /** Tests only */
    reset: (): void => {
        localDemo = null;
        autoStartConsumed = false;
    },
};
