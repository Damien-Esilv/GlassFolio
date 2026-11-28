/**
 * OFX / QFX bank statements (the "Money" format most French banks offer), read locally and turned
 * into a small CSV the import engine already understands (Epic E52 — TGLA-253). No dependency.
 *
 * OFX 1.x is SGML: leaf tags are often left unclosed (`<TRNAMT>-42.50`). OFX 2.x is XML. Both are
 * read the same way: each `<STMTTRN>` block gives one operation.
 */

/** Columns of the CSV produced from an OFX file (the "OFX" import preset maps them). */
export const OFX_CSV_HEADERS = ['Date', 'Label', 'Amount', 'Reference', 'OFX type'] as const;

export interface OfxTransaction {
    /** YYYY-MM-DD */
    date: string;
    amount: string;
    label: string;
    reference: string;
    type: string;
    currency?: string;
}

/** True when the text is an OFX or QFX statement. */
export function isOfx(text: string): boolean {
    const head = text.slice(0, 2000).toUpperCase();
    return head.includes('OFXHEADER') || head.includes('<OFX>');
}

const decodeEntities = (value: string): string =>
    value
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'")
        .replace(/&amp;/gi, '&');

/** Value of a leaf tag inside a block, closed or not. */
function leaf(block: string, tag: string): string | undefined {
    const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
    const value = match?.[1]?.trim();
    return value ? decodeEntities(value) : undefined;
}

/** YYYYMMDD[HHMMSS[.XXX]][[+-]TZ] → YYYY-MM-DD */
function ofxDate(value: string | undefined): string | undefined {
    const match = value?.match(/^(\d{4})(\d{2})(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}

/** "-42,50" or "1 234.5" → "-42.50" style decimal with a dot. */
function ofxAmount(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const clean = value.replace(/\s/g, '').replace(',', '.');
    return /^[+-]?\d+(\.\d+)?$/.test(clean) ? clean.replace(/^\+/, '') : undefined;
}

/** Every operation of the statement, in file order. Blocks without a date or an amount are skipped. */
export function parseOfx(text: string): OfxTransaction[] {
    const currency = leaf(text, 'CURDEF');
    const blocks = text.split(/<STMTTRN>/i).slice(1).map(part => part.split(/<\/STMTTRN>/i)[0]);
    const out: OfxTransaction[] = [];
    for (const block of blocks) {
        const date = ofxDate(leaf(block, 'DTPOSTED') ?? leaf(block, 'DTUSER'));
        const amount = ofxAmount(leaf(block, 'TRNAMT'));
        if (!date || !amount) continue;
        const name = leaf(block, 'NAME') ?? leaf(block, 'PAYEE') ?? '';
        const memo = leaf(block, 'MEMO') ?? '';
        const label = memo && !name.toUpperCase().includes(memo.toUpperCase()) ? `${name} ${memo}`.trim() : name || memo;
        out.push({
            date,
            amount,
            label,
            reference: leaf(block, 'FITID') ?? '',
            type: (leaf(block, 'TRNTYPE') ?? '').toLowerCase(),
            currency: leaf(block, 'CURRENCY') ?? currency,
        });
    }
    return out;
}

const csvField = (value: string): string => (/[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** The statement as a semicolon CSV with the `OFX_CSV_HEADERS` columns. */
export function ofxToCsv(text: string): string {
    const lines = [OFX_CSV_HEADERS.join(';')];
    for (const tx of parseOfx(text)) {
        lines.push([tx.date, tx.label, tx.amount, tx.reference, tx.type].map(csvField).join(';'));
    }
    return lines.join('\n');
}
