/**
 * Startup hook of local mode (Epic E33 — TGLA-139).
 *
 * Loads the server snapshot into memory BEFORE the first render, so no service ever reads an
 * empty store while the real data is still on the server. Cloud and showcase builds skip it.
 */

import { getDeploymentMode } from '../../config/deployment';
// Must stay first: appStorage creates the backing provider (and its module cycle with the
// Supabase client only resolves when it is evaluated before storageFactory).
import './appStorage';
import { getLocalVaultProvider } from './storageFactory';

export type BootstrapResult =
    | { status: 'ready'; mode: 'server' | 'browser' | 'cloud' }
    | { status: 'failed'; message: string };

export async function bootstrapLocalPersistence(): Promise<BootstrapResult> {
    const deployment = getDeploymentMode();
    if (deployment !== 'local') return { status: 'ready', mode: 'cloud' };

    const provider = getLocalVaultProvider();
    if (!provider) return { status: 'ready', mode: 'browser' };

    const result = await provider.connect();
    if (result.mode === 'error') return { status: 'failed', message: result.message };
    return { status: 'ready', mode: result.mode };
}
