/**
 * Automatic sync tools (TGLA-221). Credentials never pass through these tools: connecting a keyed
 * source happens in Settings → Connections only. Watch-only wallets take public addresses, so the
 * assistant may add one, with the user's approval.
 */
import { AIToolDefinition } from '../types';
import { accountService, instituteService } from '../../instituteService';
import { connectionService, isBitcoinWalletEntry, isEvmAddress, isSolanaAddress, syncEngine, WALLET_ACCOUNT_ID } from '../../connectors';
import { notifySyncOutcome } from '../../connectors/syncNotifications';
import type { ConnectionErrorCode, ConnectionStatus, SourceId } from '../../../types/connections';

interface ConnectionSummary {
  id: string;
  label: string;
  source: SourceId;
  mode: 'history' | 'holdings';
  status: ConnectionStatus;
  lastSyncAt: string | null;
  lastError: ConnectionErrorCode | null;
  accounts: string[];
  watchedAddresses: number;
}

export const listConnectionsTool: AIToolDefinition<Record<string, never>, ConnectionSummary[]> = {
  name: 'list_connections',
  description:
    'List the automatic sync sources (SnapTrade, watch-only wallets…) with their status, last sync time and the GlassFolio accounts they feed. Credentials are never returned.',
  parameters: { type: 'object', properties: {} },
  execute: async () => {
    const [connections, accounts] = await Promise.all([connectionService.listConnections(), accountService.getAccounts()]);
    const names = new Map(accounts.map(account => [account.id, account.name]));
    return connections.map(connection => ({
      id: connection.id,
      label: connection.label,
      source: connection.sourceId,
      mode: connection.mode,
      status: connection.lastStatus,
      lastSyncAt: connection.lastSyncAt ?? null,
      lastError: connection.lastErrorCode ?? null,
      accounts: Object.values(connection.accountMap).map(id => names.get(id) ?? id),
      watchedAddresses: connection.publicParams.addresses?.length ?? 0,
    }));
  },
};

interface SyncSummary {
  success: boolean;
  status: ConnectionStatus;
  imported: number;
  skippedDuplicates: number;
  assetsWithDifferences: string[];
  message: string;
}

export const syncConnectionTool: AIToolDefinition<{ connectionId: string }, SyncSummary> = {
  name: 'sync_connection',
  description:
    'Sync one source now: new activities or holdings are recorded in its accounts (a re-sync never duplicates; the batch can be rolled back from the import history). Requires explicit human confirmation. Use list_connections to find the id.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    properties: { connectionId: { type: 'string', description: 'Connection id from list_connections' } },
    required: ['connectionId'],
  },
  execute: async ({ connectionId }) => {
    const connection = await connectionService.getConnection(connectionId);
    if (!connection) {
      return { success: false, status: 'error', imported: 0, skippedDuplicates: 0, assetsWithDifferences: [], message: 'Connection not found.' };
    }
    const report = await syncEngine.runSync(connectionId);
    notifySyncOutcome(connection, report);
    const imported = report.accounts.reduce((total, account) => total + account.imported, 0);
    return {
      success: report.status === 'ok',
      status: report.status,
      imported,
      skippedDuplicates: report.accounts.reduce((total, account) => total + account.skippedDuplicates, 0),
      assetsWithDifferences: report.accounts.flatMap(account => account.drift.map(item => item.asset)),
      message: report.status === 'ok'
        ? `Sync complete: ${imported} change(s) recorded.`
        : `Sync did not complete (${report.errorCode ?? report.status}).`,
    };
  },
};

const WALLET_KINDS = {
  bitcoin: { sourceId: 'wallet_btc', isValid: isBitcoinWalletEntry },
  evm: { sourceId: 'wallet_evm', isValid: isEvmAddress },
  solana: { sourceId: 'wallet_sol', isValid: isSolanaAddress },
} as const satisfies Record<string, { sourceId: SourceId; isValid: (entry: string) => boolean }>;

type WalletKind = keyof typeof WALLET_KINDS;

export const addWatchOnlyWalletTool: AIToolDefinition<
  { label: string; addresses: string; chain?: WalletKind; accountId?: string },
  { success: boolean; connectionId: string | null; message: string }
> = {
  name: 'add_watch_only_wallet',
  description:
    'Track a wallet from its public addresses (read-only: an address can never move funds): Bitcoin (addresses or xpub/ypub/zpub), Ethereum & EVM chains (0x addresses; ETH and main tokens on Ethereum, Arbitrum, Base, Optimism, Polygon) or Solana. Creates a crypto account named after the wallet unless accountId is given, then syncs its balances. Requires explicit human confirmation.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    properties: {
      label: { type: 'string', description: 'Wallet name, e.g. "Ledger cold wallet"' },
      addresses: { type: 'string', description: 'Public addresses (or Bitcoin extended public keys), separated by commas or spaces' },
      chain: { type: 'string', description: 'Network of the addresses (default bitcoin)', enum: ['bitcoin', 'evm', 'solana'] },
      accountId: { type: 'string', description: 'Existing crypto account to record the balance in (optional)' },
    },
    required: ['label', 'addresses'],
  },
  execute: async ({ label, addresses, chain = 'bitcoin', accountId }, context) => {
    const kind = WALLET_KINDS[chain];
    if (!kind) return { success: false, connectionId: null, message: 'Unknown network.' };
    const list = Array.from(new Set(addresses.split(/[\s,;]+/).map(value => value.trim()).filter(value => value.length > 0)));
    const name = label.trim();
    if (!name || list.length === 0 || !list.every(kind.isValid)) {
      return { success: false, connectionId: null, message: `A name and at least one valid ${chain} address are required.` };
    }
    let target = accountId;
    if (target && !(await accountService.getAccountById(target))) {
      return { success: false, connectionId: null, message: 'Account not found.' };
    }
    if (!target) {
      const institute = await instituteService.createInstitute({ name, type: 'wallet' });
      target = (await accountService.createAccount({
        instituteId: institute.id, name, type: 'crypto_spot', defaultCurrency: context?.currency || 'EUR',
      })).id;
    }
    const connection = await connectionService.createConnection({
      sourceId: kind.sourceId, label: name, publicParams: { addresses: list }, accountMap: { [WALLET_ACCOUNT_ID]: target },
    });
    const report = await syncEngine.runSync(connection.id);
    notifySyncOutcome(connection, report);
    return {
      success: report.status === 'ok',
      connectionId: connection.id,
      message: report.status === 'ok'
        ? `Wallet "${name}" added and synced.`
        : `Wallet "${name}" added; its first sync did not complete (${report.errorCode ?? report.status}).`,
    };
  },
};
