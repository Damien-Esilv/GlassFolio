import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AttachmentError,
  detectAttachmentKind,
  prepareAttachment,
} from '../../../../src/services/ai/attachmentService';
import type { ModelCapabilities } from '../../../../src/services/ai/modelCapabilities';

const mockExtractPdfLocally = vi.fn();
vi.mock('../../../../src/services/ai/pdfReader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/services/ai/pdfReader')>();
  return {
    ...actual,
    extractPdfLocally: (...args: unknown[]) => mockExtractPdfLocally(...args),
  };
});

const mockReadXlsxAsCsv = vi.fn();
vi.mock('../../../../src/services/import/xlsxReader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/services/import/xlsxReader')>();
  return {
    ...actual,
    readXlsxAsCsv: (...args: unknown[]) => mockReadXlsxAsCsv(...args),
  };
});

const makeCaps = (overrides: Partial<ModelCapabilities> = {}): ModelCapabilities => ({
  provider: 'openai',
  model: 'gpt-4o',
  vision: true,
  nativePdf: true,
  pdfMode: 'native_file',
  openRouterPdfPlugin: false,
  maxImageBytes: 10 * 1024 * 1024,
  maxPdfBytes: 10 * 1024 * 1024,
  maxImages: 10,
  probed: true,
  ...overrides,
});

const makeFile = (name: string, bytes: Uint8Array, type = ''): File =>
  ({
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }) as unknown as File;

describe('attachmentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects magic bytes and rejects legacy .xls binary files explicitly', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(detectAttachmentKind({ name: 'screen.png', type: 'image/png' }, png)).toEqual({
      kind: 'image',
      mimeType: 'image/png',
    });

    const oleXls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(() => detectAttachmentKind({ name: 'old.xls', type: '' }, oleXls)).toThrow(AttachmentError);
    try {
      detectAttachmentKind({ name: 'old.xls', type: '' }, oleXls);
    } catch (err) {
      expect((err as AttachmentError).code).toBe('xls_legacy');
      expect((err as AttachmentError).reasonKey).toBe('ai:attachments.errors.xlsLegacy');
    }
  });

  it('rejects mismatched magic bytes (corrupt/spoofed PDF or PNG)', () => {
    const fakePdf = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]);
    expect(() => detectAttachmentKind({ name: 'fake.pdf', type: 'application/pdf' }, fakePdf)).toThrow(
      AttachmentError
    );
  });

  it('prepares CSV files without preprocessing badge', async () => {
    const bytes = new TextEncoder().encode('Date,Type,Symbol,Amount\n2025-01-05,BUY,AAPL,500');
    const att = await prepareAttachment(makeFile('trades.csv', bytes, 'text/csv'), makeCaps());
    expect(att.kind).toBe('csv');
    expect(att.text).toContain('AAPL');
    expect(att.preprocessing).toBeUndefined();
  });

  it('converts XLSX locally and records xlsx_to_csv preprocessing info for the (i) badge', async () => {
    mockReadXlsxAsCsv.mockResolvedValueOnce({
      sheets: ['Trades'],
      activeSheet: 'Trades',
      csv: 'Date,Symbol,Amount\n2025-01-05,BTC,250',
      rowCount: 2,
    });
    const pkBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const att = await prepareAttachment(makeFile('broker.xlsx', pkBytes), makeCaps());
    expect(att.kind).toBe('xlsx');
    expect(att.text).toContain('BTC');
    expect(att.preprocessing).toEqual({
      method: 'xlsx_to_csv',
      details: { sheet: 'Trades', rows: 2 },
    });
  });

  it('keeps PDFs raw base64 for native-PDF providers and extracts locally for Ollama/Groq', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

    const nativeAtt = await prepareAttachment(
      makeFile('statement.pdf', pdfBytes, 'application/pdf'),
      makeCaps({ nativePdf: true, pdfMode: 'native_image_url', provider: 'gemini' })
    );
    expect(nativeAtt.base64).toBeDefined();
    expect(nativeAtt.preprocessing).toBeUndefined();
    expect(mockExtractPdfLocally).not.toHaveBeenCalled();

    mockExtractPdfLocally.mockResolvedValueOnce({
      mode: 'pdf_text',
      text: '2025-01-01 BUY AAPL 500 EUR statement line extracted',
      pageCount: 2,
    });
    const ollamaAtt = await prepareAttachment(
      makeFile('statement.pdf', pdfBytes, 'application/pdf'),
      makeCaps({ provider: 'ollama', vision: false, nativePdf: false, pdfMode: 'local_preprocess' })
    );
    expect(ollamaAtt.text).toContain('AAPL');
    expect(ollamaAtt.preprocessing).toEqual({
      method: 'pdf_text',
      details: { pages: 2 },
    });
  });

  it('denies image upload when active model lacks vision', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    await expect(
      prepareAttachment(
        makeFile('shot.jpg', jpeg, 'image/jpeg'),
        makeCaps({ provider: 'ollama', vision: false })
      )
    ).rejects.toMatchObject({ code: 'capability_denied', reasonKey: 'ai:attachments.errors.noVision' });
  });
});
