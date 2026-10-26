/**
 * Column Matcher (E28 — TGLA-102)
 *
 * Scores CSV headers against FR/EN synonym dictionaries to propose a field
 * mapping. Headers are normalized (case, accents, camelCase, punctuation) and
 * compared token-by-token, so "Exchange" never matches "change" and
 * "Opération" matches "operation". Each header is assigned to at most one field,
 * best scores first.
 */

import { ISIN_REGEX, VALID_FIAT_CURRENCIES } from '../../types/types.backend';
import type { FieldMappings } from './importManager';
import type { SnapshotFieldMappings } from './snapshotService';
import { isKnownTypeLabel, parseDate, parseDecimal } from './typeNormalizer';

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

export type HistoryField = Exclude<keyof FieldMappings, 'label' | 'rawType' | 'exchange' | 'network' | 'contractAddress'>;

export const HISTORY_COLUMN_SPECS: ColumnSpec<HistoryField>[] = [
    { field: 'transactionDate', synonyms: ['date operation', 'transaction date', 'trade date', 'date', 'utc time', 'datetime', 'timestamp', 'time', 'jour', 'datum', 'handelstag', 'buchungstag', 'fecha', 'data'], exclude: ['valeur', 'value', 'val', 'acquired'] },
    { field: 'valueDate', synonyms: ['date valeur', 'value date', 'date val', 'settlement date', 'date reglement'] },
    { field: 'assetIsin', synonyms: ['isin', 'code isin'] },
    { field: 'assetSymbol', synonyms: ['symbol', 'symbole', 'ticker', 'coin', 'asset', 'actif', 'pair', 'paire', 'wkn', 'code valeur', 'cusip', 'sedol'], exclude: ['fee', 'frais', 'class', 'type'] },
    { field: 'assetName', synonyms: ['name', 'nom', 'instrument', 'titre', 'security', 'produit', 'designation', 'security description', 'wertpapier', 'bezeichnung', 'nombre', 'denominazione'] },
    { field: 'type', synonyms: ['type', 'transaction type', 'type operation', 'operation', 'side', 'sens', 'action', 'nature', 'typ', 'transaktionstyp', 'tipo', 'operazione'], exclude: ['actif', 'asset', 'instrument', 'account', 'compte'] },
    { field: 'quantity', synonyms: ['quantite', 'quantity', 'qty', 'qte', 'shares', 'parts', 'nombre de parts', 'nombre', 'units', 'filled', 'executed', 'volume', 'vol', 'stuck', 'anzahl', 'cantidad', 'quantita'], exclude: ['price', 'prix'] },
    { field: 'priceUnit', synonyms: ['prix unitaire', 'price per unit', 'unit price', 'cours', 'prix', 'price', 'rate', 'kurs', 'precio', 'prezzo'], exclude: ['total', 'avg', 'average', 'moyen', 'revient'] },
    { field: 'amountPrimary', synonyms: ['montant', 'amount', 'montant net', 'net amount', 'subtotal', 'total', 'change', 'value', 'proceeds', 'cost', 'betrag', 'gesamtbetrag', 'importe', 'importo'], exclude: ['fee', 'frais', 'balance', 'solde', 'unit', 'price', 'prix', 'tax'] },
    { field: 'feeAmount', synonyms: ['frais', 'fee', 'fees', 'commission', 'commissions', 'courtage', 'gebuhr', 'gebuhren', 'spesen', 'comision', 'commissione'], exclude: ['ccy', 'currency', 'devise', 'asset', 'coin'] },
    { field: 'feeAsset', synonyms: ['fee ccy', 'fee currency', 'fee asset', 'fee coin', 'devise frais'] },
    { field: 'taxAmount', synonyms: ['tax', 'taxe', 'taxes', 'impot', 'withholding', 'prelevement', 'steuer', 'impuesto', 'imposta'] },
    { field: 'currency', synonyms: ['currency', 'devise', 'ccy', 'monnaie', 'wahrung', 'moneda', 'valuta'], exclude: ['fee', 'frais', 'commission'] },
    { field: 'rawLabel', synonyms: ['libelle', 'label', 'description', 'remark', 'note', 'notes', 'memo', 'commentaire', 'details', 'libelle operation', 'buchungstext', 'verwendungszweck', 'concepto', 'descrizione'] },
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

// ============================================================================
// COLUMN PROPOSALS (TGLA-151): headers + cell contents, with an honest confidence
// ============================================================================

export type ColumnStatus = 'matched' | 'ambiguous' | 'unmatched';

export interface ColumnProposal<F extends string> {
    header: string;
    index: number;
    /** First non-empty cells, to show the user what the column holds */
    samples: string[];
    /** Proposed target field (null when the column is unmatched) */
    field: F | null;
    score: number;
    status: ColumnStatus;
    /** Other fields this column could be (best first, at most 3) */
    alternatives: F[];
}

const MATCH_SCORE = 60;
const MIN_ASSIGN_SCORE = 30;
const MIN_ALTERNATIVE_SCORE = 10;
const AMBIGUITY_GAP = 10;
const SAMPLE_COUNT = 3;
const CONTENT_ROWS = 1000;
const CONTENT_VALUES = 200;
const MAX_ALTERNATIVES = 3;

interface ColumnContent {
    isinShare: number;
    dateShare: number;
    typeShare: number;
    currencyShare: number;
    numericShare: number;
    count: number;
}

const share = (values: string[], test: (value: string) => boolean): number =>
    values.length === 0 ? 0 : values.filter(test).length / values.length;

const looksLikeDate = (value: string): boolean =>
    (/^\d{10}(\.\d+)?$|^\d{13}$/.test(value) || /[-/.:\sA-Za-z]/.test(value)) && parseDate(value) !== null;

function readContent(values: string[]): ColumnContent {
    return {
        count: values.length,
        isinShare: share(values, v => ISIN_REGEX.test(v.trim().toUpperCase())),
        dateShare: share(values, looksLikeDate),
        typeShare: share(values, v => isKnownTypeLabel(v)),
        currencyShare: share(values, v => (VALID_FIAT_CURRENCIES as readonly string[]).includes(v.trim().toUpperCase())),
        numericShare: share(values, v => parseDecimal(v) !== null)
    };
}

const NUMERIC_FIELDS: ReadonlySet<string> = new Set([
    'quantity', 'priceUnit', 'amountPrimary', 'feeAmount', 'taxAmount', 'balanceAfter', 'avgPrice'
]);

/** What the cells say about a field: a bonus when they look right, a penalty when they cannot be right. */
function contentBonus(field: string, content: ColumnContent): number {
    if (content.count === 0) return 0;
    if (field === 'assetIsin') return content.isinShare >= 0.8 ? 60 : 0;
    if (field === 'assetSymbol') return content.isinShare >= 0.8 ? -50 : 0;
    if (field === 'transactionDate' || field === 'purchaseDate') {
        if (content.dateShare >= 0.8) return 60;
        return content.dateShare < 0.3 ? -50 : 0;
    }
    if (field === 'valueDate') {
        if (content.dateShare >= 0.8) return 10;
        return content.dateShare < 0.3 ? -50 : 0;
    }
    if (field === 'type') return content.typeShare >= 0.6 ? 60 : 0;
    if (field === 'currency') return content.currencyShare >= 0.8 ? 50 : 0;
    if (NUMERIC_FIELDS.has(field)) {
        if (content.numericShare >= 0.9) return 10;
        return content.numericShare < 0.3 ? -50 : 0;
    }
    return 0;
}

/**
 * Propose a target field for every column of a file, from its header and its cells.
 * A column is `matched` when one field clearly wins, `ambiguous` when the winner is weak or a
 * second field fits almost as well, and `unmatched` when nothing fits: the user decides those.
 */
export function proposeColumnMapping<F extends string>(
    headers: string[],
    rows: string[][],
    specs: ColumnSpec<F>[]
): ColumnProposal<F>[] {
    const samples: string[][] = headers.map(() => []);
    const contents: ColumnContent[] = headers.map((_, index) => {
        const values: string[] = [];
        for (const row of rows.slice(0, CONTENT_ROWS)) {
            const value = (row[index] ?? '').trim();
            if (value === '') continue;
            if (samples[index].length < SAMPLE_COUNT) samples[index].push(value);
            if (values.length < CONTENT_VALUES) values.push(value);
        }
        return readContent(values);
    });

    // Every (column, field) fit
    const scores: number[][] = headers.map((header, column) =>
        specs.map(spec => Math.max(0, scoreHeader(header, spec) + contentBonus(spec.field, contents[column]))));

    const candidates: { column: number; spec: number; score: number }[] = [];
    scores.forEach((row, column) => row.forEach((score, spec) => {
        if (score >= MIN_ASSIGN_SCORE) candidates.push({ column, spec, score });
    }));
    candidates.sort((a, b) => b.score - a.score || a.column - b.column || a.spec - b.spec);

    const assigned = new Map<number, { spec: number; score: number }>();
    const usedSpecs = new Set<number>();
    for (const { column, spec, score } of candidates) {
        if (assigned.has(column) || usedSpecs.has(spec)) continue;
        assigned.set(column, { spec, score });
        usedSpecs.add(spec);
    }

    return headers.map((header, column): ColumnProposal<F> => {
        const winner = assigned.get(column);
        const others = specs
            .map((spec, index) => ({ field: spec.field, score: scores[column][index], index }))
            .filter(entry => entry.score >= MIN_ALTERNATIVE_SCORE && entry.index !== winner?.spec)
            .sort((a, b) => b.score - a.score || a.index - b.index);
        const alternatives = others.slice(0, MAX_ALTERNATIVES).map(entry => entry.field);

        if (!winner) {
            return { header, index: column, samples: samples[column], field: null, score: 0, status: 'unmatched', alternatives };
        }

        const runnerUp = others.length > 0 ? others[0].score : 0;
        const confident = winner.score >= MATCH_SCORE && runnerUp < winner.score - AMBIGUITY_GAP;
        return {
            header,
            index: column,
            samples: samples[column],
            field: specs[winner.spec].field,
            score: winner.score,
            status: confident ? 'matched' : 'ambiguous',
            alternatives: others.filter(entry => entry.score >= MIN_ASSIGN_SCORE || entry.score >= winner.score - AMBIGUITY_GAP)
                .slice(0, MAX_ALTERNATIVES).map(entry => entry.field)
        };
    });
}

/** Header-keyed mapping from proposals: matched and ambiguous columns, never unmatched ones. */
export function proposalsToMappings<F extends string>(proposals: ColumnProposal<F>[]): Partial<Record<F, string>> {
    const mapping: Partial<Record<F, string>> = {};
    for (const proposal of proposals) {
        if (proposal.field !== null && proposal.status !== 'unmatched') mapping[proposal.field] = proposal.header;
    }
    return mapping;
}
