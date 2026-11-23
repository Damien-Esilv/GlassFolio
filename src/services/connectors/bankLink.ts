/**
 * Linking a French bank (TGLA-237): the steps the settings card drives, kept here so the card never
 * handles stored credentials itself. Only these calls may start a two-factor challenge; syncs never do.
 */
import { connectionService } from './connectionService';
import { woobClient, WoobError, type WoobLoginResult } from './woobClient';

/**
 * Opens the bank session of an existing connection again (the bank asked for a new validation, or the
 * user changed their password). New credentials, when given, replace the stored ones first.
 */
export async function reconnectBank(connectionId: string, newCredentials?: Record<string, string>): Promise<WoobLoginResult> {
    const connection = await connectionService.getConnection(connectionId);
    const module = connection?.publicParams.module;
    if (!connection || connection.sourceId !== 'woob' || !module) throw new WoobError('unknown');
    if (newCredentials) await connectionService.updateConnection(connectionId, { credentials: newCredentials });
    return woobClient.login({ key: connectionId, module, credentials: await connectionService.getCredentials(connectionId) });
}
