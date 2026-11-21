import { describe, it, expect } from 'vitest';
import { crc32 } from '../../../../src/services/import/zipReader';
import {
  excelSerialToIso,
  readXlsxAsCsv,
  XlsxReadError,
} from '../../../../src/services/import/xlsxReader';

/**
 * Minimal stored (uncompressed) ZIP builder for deterministic in-memory XLSX tests.
 */
function buildStoredZip(entries: Record<string, string>): ArrayBuffer {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = encoder.encode(name);
    const dataBytes = encoder.encode(content);
    const crc = crc32(dataBytes);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true); // stored
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    localParts.push(local, dataBytes);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + dataBytes.length;
  }

  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, Object.keys(entries).length, true);
  ev.setUint16(10, Object.keys(entries).length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const totalSize = offset + centralSize + eocd.length;
  const out = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out.buffer;
}

describe('xlsxReader', () => {
  it('converts Excel 1900 serial dates to ISO strings', () => {
    expect(excelSerialToIso(45658)).toBe('2025-01-01');
    expect(excelSerialToIso(1)).toBe('1900-01-01');
    expect(excelSerialToIso(45658.5)).toBe('2025-01-01T12:00:00Z');
  });

  it('reads shared strings, inline strings, Excel dates, and sparse columns into RFC 4180 CSV', async () => {
    const xlsxBuffer = buildStoredZip({
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?>
        <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
                  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <sheets><sheet name="Transactions" sheetId="1" r:id="rId1"/></sheets>
        </workbook>`,
      'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
        </Relationships>`,
      'xl/sharedStrings.xml': `<?xml version="1.0" encoding="UTF-8"?>
        <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <si><t>Date</t></si>
          <si><t>Symbol</t></si>
          <si><t>Type</t></si>
          <si><t>Amount</t></si>
          <si><t>AAPL</t></si>
          <si><r><t>Apple, </t></r><r><t>Inc.</t></r></si>
        </sst>`,
      'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8"?>
        <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <cellXfs count="2">
            <xf numFmtId="0"/>
            <xf numFmtId="14"/>
          </cellXfs>
        </styleSheet>`,
      'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?>
        <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <sheetData>
            <row r="1">
              <c r="A1" t="s"><v>0</v></c>
              <c r="B1" t="s"><v>1</v></c>
              <c r="C1" t="s"><v>2</v></c>
              <c r="D1" t="s"><v>3</v></c>
              <c r="E1" t="inlineStr"><is><t>Note</t></is></c>
            </row>
            <row r="2">
              <c r="A2" s="1"><v>45658</v></c>
              <c r="B2" t="s"><v>4</v></c>
              <c r="C2" t="inlineStr"><is><t>BUY</t></is></c>
              <c r="D2"><v>500.25</v></c>
              <c r="E2" t="s"><v>5</v></c>
            </row>
            <row r="3">
              <c r="A3" s="1"><v>45659</v></c>
              <c r="D3"><v>100</v></c>
            </row>
          </sheetData>
        </worksheet>`,
    });

    const result = await readXlsxAsCsv(xlsxBuffer);
    expect(result.sheets).toEqual(['Transactions']);
    expect(result.activeSheet).toBe('Transactions');
    expect(result.rowCount).toBe(3);
    expect(result.csv).toBe(
      [
        'Date,Symbol,Type,Amount,Note',
        '2025-01-01,AAPL,BUY,500.25,"Apple, Inc."',
        '2025-01-02,,,100,',
      ].join('\n')
    );
  });

  it('rejects invalid ZIP buffers or empty workbooks', async () => {
    await expect(readXlsxAsCsv(new Uint8Array([1, 2, 3, 4]).buffer)).rejects.toThrow(XlsxReadError);

    const emptySheet = buildStoredZip({
      'xl/workbook.xml': `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Empty" sheetId="1"/></sheets></workbook>`,
      'xl/worksheets/sheet1.xml': `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`,
    });
    await expect(readXlsxAsCsv(emptySheet)).rejects.toMatchObject({ code: 'empty_workbook' });
  });
});
