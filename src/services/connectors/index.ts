/**
 * Automatic sync (TGLA-221): one import surface for the UI and the AI tools. Importing it registers
 * the built-in sources, so the registry is never read empty.
 */
import { sourceRegistry } from './sourceRegistry';
import { bitcoinWalletSource } from './sources/bitcoinWallet';
import { evmWalletSource } from './sources/evmWallet';
import { solanaWalletSource } from './sources/solanaWallet';
import { snaptradeSource } from './sources/snaptrade';
import { woobSource } from './sources/woob';

sourceRegistry.register(bitcoinWalletSource);
sourceRegistry.register(evmWalletSource);
sourceRegistry.register(solanaWalletSource);
sourceRegistry.register(snaptradeSource);
sourceRegistry.register(woobSource);

export { sourceRegistry } from './sourceRegistry';
export { connectionService, newConnectionId } from './connectionService';
export { reconnectBank } from './bankLink';
export { syncEngine } from './syncEngine';
export { ConnectorError } from './types';
export type { SourceAdapter, AdapterContext } from './types';
export { isBitcoinAddress, isBitcoinWalletEntry, isExtendedPublicKey, WALLET_ACCOUNT_ID } from './sources/bitcoinWallet';
export { isEvmAddress } from './sources/evmWallet';
export { isSolanaAddress } from './sources/solanaWallet';
export { woobClient, WoobError } from './woobClient';
export type { WoobAccount, WoobBankField, WoobBankInfo, WoobLoginResult, WoobModuleSource, WoobStatus } from './woobClient';
export { toExternalAccount } from './sources/woob';
