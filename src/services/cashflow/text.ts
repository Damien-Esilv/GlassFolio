/**
 * Text helpers of the cash flow engine: normalised words, merchant keys and readable labels from
 * raw bank labels (Epic E52 — TGLA-249). Pure functions.
 */

/** Upper case, no accents, every non-alphanumeric run turned into one space. */
export function normalizeText(value: string | undefined | null): string {
    if (!value) return '';
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

/** True when `pattern` appears as whole words in `normalizedText` (both already normalised). */
export function containsWords(normalizedText: string, normalizedPattern: string): boolean {
    if (!normalizedPattern) return false;
    return ` ${normalizedText} `.includes(` ${normalizedPattern} `);
}

/** Operation-type words banks put in front of the label; they say nothing about the merchant. */
const NOISE_PREFIXES = [
    'PAIEMENT PAR CARTE', 'PAIEMENT CARTE', 'PAIEMENT CB', 'ACHAT CB', 'CARTE BANCAIRE', 'CARTE', 'CB',
    'PRLV SEPA', 'PRELEVEMENT SEPA', 'PRELEVEMENT', 'PRLV', 'ECHEANCE',
    'VIR SEPA RECU', 'VIR SEPA EMIS', 'VIR SEPA', 'VIR INST RECU', 'VIR INST', 'VIREMENT RECU', 'VIREMENT EMIS',
    'VIREMENT SEPA', 'VIREMENT PERMANENT', 'VIR PERMANENT', 'VIREMENT', 'VIR', 'PERMANENT', 'AVOIR', 'FACTURE CARTE',
    'DE', 'DU', 'PAR', 'VERS', 'POUR', 'RECU', 'EMIS',
];

const NOISE_WORDS = new Set(['SEPA', 'REF', 'MDT', 'ID', 'NUM', 'LIB', 'DATE', 'FR', 'EUR', 'X', 'XX', 'XXX', 'MOTIF']);

/** Drops dates, card masks, long numbers and references from a normalised label. */
function stripNoise(normalized: string): string[] {
    let text = ` ${normalized} `;
    // Dates: 12 03, 12 03 25, 12 03 2025, 2025 03 12 (punctuation already became spaces)
    text = text.replace(/ \d{1,2} \d{1,2}( \d{2,4})? /g, ' ');
    text = text.replace(/ \d{4} \d{2} \d{2} /g, ' ');
    // Card masks and references: X1234, CB 1234, numbers of 4+ digits, mixed tokens like 4X12AB34
    text = text.replace(/ X+\d+ /g, ' ');
    const words = text.trim().split(' ').filter(Boolean);
    const out: string[] = [];
    for (const word of words) {
        if (/^\d+$/.test(word)) continue;
        if (/\d/.test(word) && word.length >= 6) continue;
        if (NOISE_WORDS.has(word)) continue;
        out.push(word);
    }
    // Leading operation-type words (CARTE, PRLV SEPA, VIR…)
    let changed = true;
    while (changed && out.length > 0) {
        changed = false;
        const joined = out.join(' ');
        for (const prefix of NOISE_PREFIXES) {
            if (joined === prefix) break;
            if (joined.startsWith(`${prefix} `)) {
                out.splice(0, prefix.split(' ').length);
                changed = true;
                break;
            }
        }
    }
    return out;
}

/**
 * Stable key of the merchant behind a raw bank label: "CARTE 12/03 NETFLIX.COM AMSTERDAM" and
 * "CB NETFLIX COM 4X1234" both give "NETFLIX COM". Used by rules, recurring detection and top merchants.
 */
export function merchantKey(rawLabel: string | undefined | null): string {
    const words = stripNoise(normalizeText(rawLabel)).filter(word => word.length > 1 || /\d/.test(word));
    if (words.length === 0) return normalizeText(rawLabel).slice(0, 40);
    return words.slice(0, 2).join(' ');
}

const SMALL_WORDS = new Set(['DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'ET', 'A', 'AU', 'AUX', 'EN', 'SUR', 'D', 'L']);

/** Names banks write in capitals that stay in capitals ("EDF", "SNCF"); every other word is title-cased. */
const ACRONYMS = new Set([
    'SA', 'SAS', 'SARL', 'SNC', 'EDF', 'GDF', 'SNCF', 'RATP', 'CPAM', 'CAF', 'DGFIP', 'URSSAF', 'UGC', 'BNP', 'LCL',
    'SFR', 'MSF', 'WWF', 'FNAC', 'KFC', 'IKEA', 'DAB', 'GAB', 'PEA', 'CTO', 'PER', 'LDDS', 'LEP', 'TVA', 'BP', 'CB',
    'USA', 'UK', 'EU', 'IBKR', 'HM', 'APL', 'RSA', 'MMA', 'AXA', 'MAIF', 'MAAF', 'MACIF',
]);

/** Readable label for the lists: "CARTE 12/03 CARREFOUR CITY PARIS 15" → "Carrefour City Paris". */
export function displayLabel(rawLabel: string | undefined | null, maxWords: number = 4): string {
    const words = stripNoise(normalizeText(rawLabel)).slice(0, maxWords);
    while (words.length > 1 && SMALL_WORDS.has(words[words.length - 1])) words.pop();
    if (words.length === 0) return (rawLabel ?? '').trim();
    return words
        .map((word, index) => {
            if (ACRONYMS.has(word)) return word;
            if (index > 0 && SMALL_WORDS.has(word)) return word.toLowerCase();
            return word.charAt(0) + word.slice(1).toLowerCase();
        })
        .join(' ');
}

/** Two-letter initials for the merchant badge ("Netflix Com" → "NC", "Edf" → "ED"). */
export function merchantInitials(label: string): string {
    const words = normalizeText(label).split(' ').filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2);
    return `${words[0][0]}${words[1][0]}`;
}
