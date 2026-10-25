/**
 * Column Matcher (E28 — TGLA-102)
 *
 * Scores CSV headers against FR/EN synonym dictionaries to propose a field
 * mapping. Headers are normalized (case, accents, camelCase, punctuation) and
 * compared token-by-token, so "Exchange" never matches "change" and
 * "Opération" matches "operation". Each header is assigned to at most one field,
 * best scores first.
 */

import type { FieldMappings } from './importManager';
import type { SnapshotFieldMappings } from './snapshotService';

export interface ColumnSpec<F extends string> {
    field: F;
    /** Synonyms in priority order (earlier = stronger) */
    synonyms: string[];
    /** Tokens that disqualify a header for this field */
    exclude?: string[];
}

const SCORE_EXACT = 100;
const SCORE_SEQUENCE = 80;
const SCORE_PREFIX = 40;
const MIN_PREFIX_LENGTH = 4;

/**
 * Normalize a header into lowercase, accent-free tokens.
 * "dateOp" → ["date", "op"], "Prix de revient (€)" → ["prix", "de", "revient"]
 */
export function tokenizeHeader(header: string): string[] {
    return header
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

function containsSequence(haystack: string[], needle: string[]): boolean {
    if (needle.length === 0 || needle.length > haystack.length) return false;
    for (let i = 0; i <= haystack.length - needle.length; i++) {
        if (needle.every((token, j) => haystack[i + j] === token)) return true;
    }
    return false;
}

/**
 * Score how well a header matches a field spec (0 = no match).
 */
export function scoreHeader<F extends string>(header: string, spec: ColumnSpec<F>): number {
    const tokens = tokenizeHeader(header);
    if (tokens.length === 0) return 0;
    if (spec.exclude?.some(ex => containsSequence(tokens, tokenizeHeader(ex)))) return 0;

    let best = 0;
    spec.synonyms.forEach((synonym, index) => {
        const synTokens = tokenizeHeader(synonym);
        const priorityPenalty = index * 0.5;
        const extraTokens = Math.max(0, tokens.length - synTokens.length);
        let score = 0;

        if (tokens.join(' ') === synTokens.join(' ')) {
            score = SCORE_EXACT;
        } else if (containsSequence(tokens, synTokens)) {
            score = SCORE_SEQUENCE - extraTokens * 4;
        } else if (synTokens.length === 1 && synTokens[0].length >= MIN_PREFIX_LENGTH
            && tokens.some(t => t.startsWith(synTokens[0]))) {
            score = SCORE_PREFIX - extraTokens;
        }

        if (score > 0) best = Math.max(best, score - priorityPenalty);
    });

    return best;
}

/**
 * Assign headers to fields greedily by descending score. A header and a field
 * are each used at most once.
 */
export function matchColumns<F extends string>(headers: string[], specs: ColumnSpec<F>[]): Partial<Record<F, string>> {
    const candidates: { field: F; header: string; score: number; order: number }[] = [];
    specs.forEach((spec, order) => {
        headers.forEach(header => {
            const score = scoreHeader(header, spec);
            if (score > 0) candidates.push({ field: spec.field, header, score, order });
        });
    });

    candidates.sort((a, b) => b.score - a.score || a.order - b.order);

    const result: Partial<Record<F, string>> = {};
    const usedHeaders = new Set<string>();
    for (const { field, header } of candidates) {
        if (result[field] !== undefined || usedHeaders.has(header)) continue;
        result[field] = header;
        usedHeaders.add(header);
    }
    return result;
}

type HistoryField = Exclude<keyof FieldMappings, 'label' | 'rawType' | 'exchange' | 'network' | 'contractAddress'>;

export const HISTORY_COLUMN_SPECS: ColumnSpec<HistoryField>[] = [
    { field: 'transactionDate', synonyms: ['date operation', 'transaction date', 'trade date', 'date', 'utc time', 'datetime', 'timestamp', 'time', 'jour'], exclude: ['valeur', 'value', 'val', 'acquired'] },
    { field: 'valueDate', synonyms: ['date valeur', 'value date', 'date val', 'settlement date', 'date reglement'] },
    { field: 'assetIsin', synonyms: ['isin', 'code isin'] },
    { field: 'assetSymbol', synonyms: ['symbol', 'symbole', 'ticker', 'coin', 'asset', 'actif', 'pair', 'paire', 'devise', 'currency'], exclude: ['fee', 'frais', 'class', 'type'] },
    { field: 'assetName', synonyms: ['name', 'nom', 'instrument', 'titre', 'security', 'produit', 'designation'] },
    { field: 'type', synonyms: ['type', 'transaction type', 'type operation', 'operation', 'side', 'sens', 'action', 'nature'], exclude: ['actif', 'asset', 'instrument', 'account', 'compte'] },
    { field: 'quantity', synonyms: ['quantite', 'quantity', 'qty', 'shares', 'parts', 'nombre de parts', 'nombre', 'units', 'filled', 'executed', 'volume', 'vol'], exclude: ['price', 'prix'] },
    { field: 'priceUnit', synonyms: ['prix unitaire', 'price per unit', 'unit price', 'cours', 'prix', 'price', 'rate'], exclude: ['total', 'avg', 'average', 'moyen', 'revient'] },
    { field: 'amountPrimary', synonyms: ['montant', 'amount', 'montant net', 'net amount', 'subtotal', 'total', 'change', 'value', 'proceeds', 'cost'], exclude: ['fee', 'frais', 'balance', 'solde', 'unit', 'price', 'prix', 'tax'] },
    { field: 'feeAmount', synonyms: ['frais', 'fee', 'fees', 'commission', 'commissions', 'courtage'], exclude: ['ccy', 'currency', 'devise', 'asset', 'coin'] },
    { field: 'feeAsset', synonyms: ['fee ccy', 'fee currency', 'fee asset', 'fee coin', 'devise frais'] },
    { field: 'taxAmount', synonyms: ['tax', 'taxe', 'taxes', 'impot', 'withholding', 'prelevement'] },
    { field: 'rawLabel', synonyms: ['libelle', 'label', 'description', 'remark', 'note', 'notes', 'memo', 'commentaire', 'details'] },
    { field: 'balanceAfter', synonyms: ['solde', 'balance', 'account balance'] },
    { field: 'externalId', synonyms: ['txid', 'transaction id', 'order id', 'reference', 'id'] }
];

export const SNAPSHOT_COLUMN_SPECS: ColumnSpec<keyof SnapshotFieldMappings>[] = [
    { field: 'assetIsin', synonyms: ['isin', 'code isin'] },
    { field: 'assetSymbol', synonyms: ['symbol', 'symbole', 'ticker', 'coin', 'asset', 'actif', 'code'], exclude: ['class', 'type'] },
    { field: 'assetName', synonyms: ['name', 'nom', 'libelle', 'titre', 'instrument', 'designation', 'security'] },
    { field: 'quantity', synonyms: ['quantite', 'quantity', 'qty', 'shares', 'parts', 'nombre', 'units', 'balance', 'solde', 'amount', 'holding', 'holdings'], exclude: ['value', 'valeur', 'usd', 'eur', 'price', 'prix', 'cost'] },
    { field: 'avgPrice', synonyms: ['pru', 'prix de revient', 'prix revient', 'prix moyen', 'average price', 'avg price', 'average cost', 'avg cost', 'cost basis per unit', 'cost per share', 'prix d achat', 'purchase price', 'buy price', 'cost basis', 'cost', 'prix', 'price'], exclude: ['current', 'actuel', 'last', 'dernier', 'market', 'marche', 'cours'] },
    { field: 'purchaseDate', synonyms: ['date d achat', 'purchase date', 'acquisition date', 'date acquired', 'date', 'acquisition', 'achat'] }
];

/**
 * Propose a history (transaction journal) mapping from headers.
 */
export function matchHistoryColumns(headers: string[]): Partial<FieldMappings> {
    return matchColumns(headers, HISTORY_COLUMN_SPECS);
}

/**
 * Propose a snapshot (current holdings) mapping from headers.
 */
export function matchSnapshotColumns(headers: string[]): Partial<SnapshotFieldMappings> {
    return matchColumns(headers, SNAPSHOT_COLUMN_SPECS);
}
