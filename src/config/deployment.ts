/**
 * Deployment mode resolution (`VITE_DEPLOYMENT_MODE`).
 *
 *  - `local` (default): 100% local / self-hosted, browser storage.
 *  - `cloud`: hosted build (Vercel / Azure). Accounts are NOT shared with local mode.
 *
 * Storage and auth providers are chosen through factories keyed on this value.
 */

export type DeploymentMode = 'local' | 'cloud';

export const DEFAULT_DEPLOYMENT_MODE: DeploymentMode = 'local';

const VALID_MODES: readonly DeploymentMode[] = ['local', 'cloud'];

export const resolveDeploymentMode = (raw: string | undefined): DeploymentMode => {
    const normalized = raw?.trim().toLowerCase() ?? '';
    if (normalized === '') return DEFAULT_DEPLOYMENT_MODE;
    if ((VALID_MODES as readonly string[]).includes(normalized)) {
        return normalized as DeploymentMode;
    }
    console.warn(`[deployment] Unknown VITE_DEPLOYMENT_MODE "${raw}" — falling back to "${DEFAULT_DEPLOYMENT_MODE}".`);
    return DEFAULT_DEPLOYMENT_MODE;
};

export const getDeploymentMode = (): DeploymentMode => {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    return resolveDeploymentMode(env?.VITE_DEPLOYMENT_MODE);
};
