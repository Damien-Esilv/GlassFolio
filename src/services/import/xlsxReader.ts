/**
 * Minimal zero-dependency XLSX reader (E37).
 *
 * Parses Office Open XML (.xlsx) spreadsheets using the repository's existing
 * `readZipTextEntries` ZIP reader and browser `DOMParser`, converting the first
 * populated worksheet into clean RFC 4180 CSV text.
 */

import { readZipTextEntries, ZipError } from './zipReader';

export type XlsxErrorCode = 'invalid_xlsx' | 'empty_workbook' | 'xml_parse_error';

export class XlsxReadError extends Error {
  constructor(public readonly code: XlsxErrorCode, message?: string) {
    super(message || `XLSX error: ${code}`);
    this.name = 'XlsxReadError';
  }
}

export interface XlsxReadResult {
  sheets: string[];
  activeSheet: string;
  csv: string;
  rowCount: number;
}

const BUILTIN_DATE_NUM_FMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

function parseXml(xmlText: string): Document {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new XlsxReadError('xml_parse_error');
  }
  return doc;
}

function getElementsByLocalName(parent: Document | Element, localName: string): Element[] {
  const out: Element[] = [];
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === localName) out.push(all[i]);
  }
  return out;
}

function findChildByLocalName(parent: Element, localName: string): Element | undefined {
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].localName === localName) return parent.children[i];
  }
  return undefined;
}

function parseSharedStrings(xmlText: string | undefined): string[] {
  if (!xmlText) return [];
  const doc = parseXml(xmlText);
  return getElementsByLocalName(doc, 'si').map((si) =>
    getElementsByLocalName(si, 't')
      .map((t) => t.textContent ?? '')
      .join('')
  );
}

function looksLikeDateFormat(formatCode: string): boolean {
  const stripped = formatCode
    .replace(/\[[^\]]*\]/g, '')
    .replace(/"[^"]*"/g, '')
    .toLowerCase();
  return /[yd]/.test(stripped) || (stripped.includes('m') && /[/:]/.test(stripped));
}

function parseDateStyleIndices(stylesXml: string | undefined): Set<number> {
  const dateStyleIndices = new Set<number>();
  if (!stylesXml) return dateStyleIndices;

  const doc = parseXml(stylesXml);
  const customDateFmtIds = new Set<number>();
  for (const numFmt of getElementsByLocalName(doc, 'numFmt')) {
    const idAttr = numFmt.getAttribute('numFmtId');
    const codeAttr = numFmt.getAttribute('formatCode') ?? '';
    const id = idAttr ? Number.parseInt(idAttr, 10) : Number.NaN;
    if (Number.isInteger(id) && looksLikeDateFormat(codeAttr)) {
      customDateFmtIds.add(id);
    }
  }

  const cellXfs = getElementsByLocalName(doc, 'cellXfs')[0];
  if (!cellXfs) return dateStyleIndices;

  const xfs = Array.from(cellXfs.children).filter((el) => el.localName === 'xf');
  xfs.forEach((xf, index) => {
    const numFmtId = Number.parseInt(xf.getAttribute('numFmtId') ?? '', 10);
    if (BUILTIN_DATE_NUM_FMT_IDS.has(numFmtId) || customDateFmtIds.has(numFmtId)) {
      dateStyleIndices.add(index);
    }
  });

  return dateStyleIndices;
}

/** Convert an Excel 1900 serial number (e.g. 45658) into an ISO date string. */
export function excelSerialToIso(serial: number): string {
  // Lotus 1-2-3 mistakenly treated 1900 as a leap year (serial 60 = 1900-02-29)
  const adjusted = serial > 0 && serial < 60 ? serial + 1 : serial;
  const wholeDays = Math.floor(adjusted);
  const fracDay = adjusted - wholeDays;
  const totalMs = EXCEL_EPOCH_MS + Math.round((wholeDays + fracDay) * MS_PER_DAY);
  const date = new Date(totalMs);
  if (Math.abs(fracDay) < 1e-6) {
    return date.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 19) + 'Z';
}

function columnRefToIndex(ref: string): number {
  const lettersMatch = ref.match(/^([A-Z]+)/i);
  if (!lettersMatch) return -1;
  const letters = lettersMatch[1].toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return col - 1;
}

function resolveSheetTargets(entries: Record<string, string>): Array<{ name: string; path: string }> {
  const workbookXml = entries['xl/workbook.xml'];
  if (!workbookXml) {
    const fallback = Object.keys(entries)
      .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
      .sort();
    return fallback.map((p, idx) => ({ name: `Sheet${idx + 1}`, path: p }));
  }

  const wbDoc = parseXml(workbookXml);
  const relsMap = new Map<string, string>();
  const relsXml = entries['xl/_rels/workbook.xml.rels'];
  if (relsXml) {
    const relsDoc = parseXml(relsXml);
    for (const rel of getElementsByLocalName(relsDoc, 'Relationship')) {
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      if (id && target) {
        const normalized = target.startsWith('/') ? target.slice(1) : target.startsWith('xl/') ? target : `xl/${target}`;
        relsMap.set(id, normalized);
      }
    }
  }

  const sheets: Array<{ name: string; path: string }> = [];
  getElementsByLocalName(wbDoc, 'sheet').forEach((sheetEl, index) => {
    const name = sheetEl.getAttribute('name') || `Sheet${index + 1}`;
    const rId =
      sheetEl.getAttribute('r:id') ||
      sheetEl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ||
      '';
    const mappedPath = (rId && relsMap.get(rId)) || `xl/worksheets/sheet${index + 1}.xml`;
    if (entries[mappedPath]) {
      sheets.push({ name, path: mappedPath });
    }
  });
  return sheets;
}

function escapeCsvCell(value: string): string {
  if (value === '') return '';
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseWorksheetRows(
  sheetXml: string,
  sharedStrings: string[],
  dateStyles: Set<number>
): string[][] {
  const doc = parseXml(sheetXml);
  const rows: string[][] = [];

  for (const rowEl of getElementsByLocalName(doc, 'row')) {
    const cells: string[] = [];
    let fallbackCol = 0;

    for (const cEl of getElementsByLocalName(rowEl, 'c')) {
      const ref = cEl.getAttribute('r');
      const colIndex = ref ? columnRefToIndex(ref) : fallbackCol;
      const targetIdx = colIndex >= 0 ? colIndex : fallbackCol;
      fallbackCol = targetIdx + 1;

      while (cells.length <= targetIdx) cells.push('');

      const cellType = cEl.getAttribute('t') ?? 'n';
      const styleAttr = cEl.getAttribute('s');
      const styleIdx = styleAttr ? Number.parseInt(styleAttr, 10) : -1;

      let value = '';
      if (cellType === 'inlineStr') {
        const isEl = findChildByLocalName(cEl, 'is');
        value = isEl
          ? getElementsByLocalName(isEl, 't')
              .map((t) => t.textContent ?? '')
              .join('')
          : '';
      } else {
        const vEl = findChildByLocalName(cEl, 'v');
        const raw = vEl?.textContent ?? '';
        if (cellType === 's') {
          const idx = Number.parseInt(raw, 10);
          value = Number.isInteger(idx) && idx >= 0 && idx < sharedStrings.length ? sharedStrings[idx] : '';
        } else if (cellType === 'b') {
          value = raw === '1' ? 'TRUE' : 'FALSE';
        } else if (cellType === 'str' || cellType === 'e') {
          value = raw;
        } else if (raw !== '') {
          const num = Number(raw);
          if (Number.isFinite(num) && dateStyles.has(styleIdx) && num >= 1) {
            value = excelSerialToIso(num);
          } else {
            value = raw;
          }
        }
      }

      cells[targetIdx] = value;
    }

    if (cells.some((c) => c.trim() !== '')) {
      rows.push(cells);
    }
  }

  return rows;
}

/**
 * Read an `.xlsx` workbook buffer and serialize the first populated worksheet to CSV text.
 */
export async function readXlsxAsCsv(buffer: ArrayBuffer): Promise<XlsxReadResult> {
  let entries: Record<string, string>;
  try {
    entries = await readZipTextEntries(buffer);
  } catch (err) {
    if (err instanceof ZipError) {
      throw new XlsxReadError('invalid_xlsx', err.message);
    }
    throw err;
  }

  const sheets = resolveSheetTargets(entries);
  if (sheets.length === 0) {
    throw new XlsxReadError('invalid_xlsx', 'No worksheets found inside XLSX workbook');
  }

  const sharedStrings = parseSharedStrings(entries['xl/sharedStrings.xml']);
  const dateStyles = parseDateStyleIndices(entries['xl/styles.xml']);

  for (const sheet of sheets) {
    const rows = parseWorksheetRows(entries[sheet.path], sharedStrings, dateStyles);
    if (rows.length === 0) continue;

    const maxCols = rows.reduce((max, r) => Math.max(max, r.length), 0);
    const csv = rows
      .map((r) => {
        const padded = r.length < maxCols ? [...r, ...Array<string>(maxCols - r.length).fill('')] : r;
        return padded.map(escapeCsvCell).join(',');
      })
      .join('\n');

    return {
      sheets: sheets.map((s) => s.name),
      activeSheet: sheet.name,
      csv,
      rowCount: rows.length,
    };
  }

  throw new XlsxReadError('empty_workbook', 'The XLSX workbook contains no data rows');
}
