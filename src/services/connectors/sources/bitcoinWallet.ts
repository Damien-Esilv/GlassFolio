/**
 * Watch-only Bitcoin wallet source (TGLA-221): public addresses or extended public keys
 * (xpub / ypub / zpub), balances from Blockstream Esplora (free, no key, CORS open). Addresses of an
 * extended key are derived here, in the browser (BIP32/44/49/84), and the key never leaves it.
 * Nothing secret is involved: these keys only let anyone read balances, never spend.
 */
import type { ExternalAccount, NormalizedHolding } from '../../../types/connections';
import { EsploraAddressSchema } from '../../contracts/externalSchemas';
import { ConnectorError, errorCodeForStatus, type AdapterContext, type SourceAdapter } from '../types';

export const ESPLORA_ORIGIN = 'https://blockstream.info';
/** The whole wallet is one external account: its addresses are summed, never reconciled one by one. */
export const WALLET_ACCOUNT_ID = 'wallet';
const SATS_PER_BTC = 100_000_000;
const MAX_ENTRIES = 50;
/** BIP44 gap limit: scanning stops after this many unused addresses in a row. */
export const GAP_LIMIT = 20;
const MAX_DERIVED_PER_CHAIN = 200;
const LOOKUP_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 8000;

/** Legacy (1…), P2SH (3…) and bech32/bech32m (bc1…) mainnet addresses. */
const ADDRESS_PATTERN = /^(bc1[02-9ac-hj-np-z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/;
const EXTENDED_KEY_PATTERN = /^[xyz]pub[1-9A-HJ-NP-Za-km-z]{100,112}$/;

type ScriptKind = 'p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh';

/** SLIP-132 version bytes of the mainnet extended public keys, and the address type each implies. */
const EXTENDED_KEY_TYPES: Record<string, { version: number; script: ScriptKind }> = {
    xpub: { version: 0x0488b21e, script: 'p2pkh' },
    ypub: { version: 0x049d7cb2, script: 'p2sh-p2wpkh' },
    zpub: { version: 0x04b24746, script: 'p2wpkh' },
};

/** Key-derivation libraries, loaded only when an extended key is synced (they weigh ~100 KB). */
type Derivation = {
    HDKey: typeof import('@scure/bip32').HDKey;
    bech32: typeof import('@scure/base').bech32;
    base58check: ReturnType<typeof import('@scure/base').createBase58check>;
    sha256: typeof import('@noble/hashes/sha2.js').sha256;
    ripemd160: typeof import('@noble/hashes/legacy.js').ripemd160;
};
let derivation: Promise<Derivation> | null = null;

const loadDerivation = (): Promise<Derivation> => {
    derivation ??= Promise.all([
        import('@scure/bip32'), import('@scure/base'), import('@noble/hashes/sha2.js'), import('@noble/hashes/legacy.js'),
    ]).then(([bip32, base, sha2, legacy]) => ({
        HDKey: bip32.HDKey,
        bech32: base.bech32,
        base58check: base.createBase58check(sha2.sha256),
        sha256: sha2.sha256,
        ripemd160: legacy.ripemd160,
    }));
    return derivation;
};

export const isBitcoinAddress = (value: string): boolean => ADDRESS_PATTERN.test(value.trim());
export const isExtendedPublicKey = (value: string): boolean => EXTENDED_KEY_PATTERN.test(value.trim());
export const isBitcoinWalletEntry = (value: string): boolean => isBitcoinAddress(value) || isExtendedPublicKey(value);

const withPrefix = (prefix: number, payload: Uint8Array): Uint8Array => {
    const out = new Uint8Array(payload.length + 1);
    out[0] = prefix;
    out.set(payload, 1);
    return out;
};

/** Mainnet address of a compressed public key, for the script type of its extended key. */
export async function addressFromPublicKey(publicKey: Uint8Array, script: ScriptKind): Promise<string> {
    const { bech32, base58check, sha256, ripemd160 } = await loadDerivation();
    const hash160 = (bytes: Uint8Array): Uint8Array => ripemd160(sha256(bytes));
    const keyHash = hash160(publicKey);
    if (script === 'p2wpkh') return bech32.encode('bc', [0, ...bech32.toWords(keyHash)]);
    if (script === 'p2pkh') return base58check.encode(withPrefix(0x00, keyHash));
    const redeemScript = new Uint8Array([0x00, 0x14, ...keyHash]);
    return base58check.encode(withPrefix(0x05, hash160(redeemScript)));
}

/** The address at `chain/index` (0 = receiving, 1 = change) under an account-level extended key. */
export async function deriveAddress(extendedKey: string, chain: 0 | 1, index: number): Promise<string> {
    const type = EXTENDED_KEY_TYPES[extendedKey.slice(0, 4)];
    if (!type) throw new ConnectorError('invalid_response', 'Unsupported extended key');
    const { HDKey } = await loadDerivation();
    let node: InstanceType<typeof HDKey>;
    try {
        node = HDKey.fromExtendedKey(extendedKey, { public: type.version, private: 0 });
    } catch {
        throw new ConnectorError('invalid_response', 'Invalid extended key');
    }
    const publicKey = node.deriveChild(chain).deriveChild(index).publicKey;
    if (!publicKey) throw new ConnectorError('invalid_response', 'Derivation failed');
    return addressFromPublicKey(publicKey, type.script);
}

const entriesOf = (ctx: AdapterContext): string[] => {
    const entries = [...new Set((ctx.publicParams.addresses ?? []).map(entry => entry.trim()).filter(Boolean))];
    if (entries.length === 0 || entries.length > MAX_ENTRIES || !entries.every(isBitcoinWalletEntry)) {
        throw new ConnectorError('invalid_response', 'Invalid Bitcoin address list');
    }
    return entries;
};

interface AddressStats { sats: number; used: boolean }

/** Confirmed balance of one address, in satoshis, and whether it ever received anything. */
async function addressStats(address: string): Promise<AddressStats> {
    let response: Response;
    try {
        response = await fetch(`${ESPLORA_ORIGIN}/api/address/${encodeURIComponent(address)}`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch {
        throw new ConnectorError('network');
    }
    if (!response.ok) throw new ConnectorError(errorCodeForStatus(response.status));
    const parsed = EsploraAddressSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new ConnectorError('invalid_response');
    const { funded_txo_sum, spent_txo_sum, tx_count } = parsed.data.chain_stats;
    return { sats: funded_txo_sum - spent_txo_sum, used: tx_count > 0 || funded_txo_sum > 0 };
}

/** Balance of every used address of one chain of an extended key, until GAP_LIMIT unused in a row. */
async function scanChain(extendedKey: string, chain: 0 | 1): Promise<number> {
    let total = 0;
    let unusedInARow = 0;
    for (let start = 0; start < MAX_DERIVED_PER_CHAIN && unusedInARow < GAP_LIMIT; start += LOOKUP_CONCURRENCY) {
        const indexes = Array.from({ length: LOOKUP_CONCURRENCY }, (_, offset) => start + offset);
        const stats = await Promise.all(indexes.map(async index => addressStats(await deriveAddress(extendedKey, chain, index))));
        for (const stat of stats) {
            total += stat.sats;
            unusedInARow = stat.used ? 0 : unusedInARow + 1;
            if (unusedInARow >= GAP_LIMIT) break;
        }
    }
    return total;
}

/** Exact decimal string of a satoshi amount (no floating-point rounding). */
export const satsToBtc = (sats: number): string => {
    const whole = Math.floor(sats / SATS_PER_BTC);
    const fraction = String(sats % SATS_PER_BTC).padStart(8, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : String(whole);
};

export const bitcoinWalletSource: SourceAdapter = {
    id: 'wallet_btc',
    transport: 'direct',
    capabilities: { holdings: true, history: false },
    credentialFields: [],
    ownsAsset: (symbol?: string) => symbol?.toUpperCase() === 'BTC',

    async listExternalAccounts(ctx: AdapterContext): Promise<ExternalAccount[]> {
        const [first] = entriesOf(ctx);
        await addressStats(isExtendedPublicKey(first) ? await deriveAddress(first, 0, 0) : first);
        return [{ externalId: WALLET_ACCOUNT_ID, name: 'Bitcoin', currency: 'BTC' }];
    },

    async fetchHoldings(ctx: AdapterContext, externalAccountId: string): Promise<NormalizedHolding[]> {
        let total = 0;
        for (const entry of entriesOf(ctx)) {
            total += isExtendedPublicKey(entry)
                ? await scanChain(entry, 0) + await scanChain(entry, 1)
                : (await addressStats(entry)).sats;
        }
        // A confirmed zero is an answer too: the engine closes a position emptied on-chain
        return [{
            externalAccountId,
            symbol: 'BTC',
            name: 'Bitcoin',
            instrumentType: 'crypto',
            network: 'bitcoin',
            coingeckoId: 'bitcoin',
            quantity: satsToBtc(total),
            currency: 'USD',
        }];
    },
};
