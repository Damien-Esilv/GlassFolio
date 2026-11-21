import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetDocument = vi.fn();

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: mockGetDocument,
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/assets/pdf.worker.min.mjs',
}));

import {
  extractPdfLocally,
  PdfScannedNeedsVisionError,
} from '../../../../src/services/ai/pdfReader';

describe('pdfReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts selectable digital text grouped by row without eval', async () => {
    const cleanup = vi.fn(async () => {});
    const destroy = vi.fn(async () => {});
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        cleanup,
        getPage: vi.fn(async () => ({
          getTextContent: async () => ({
            items: [
              { str: '2025-01-15', transform: [1, 0, 0, 1, 10, 700] },
              { str: 'BUY', transform: [1, 0, 0, 1, 120, 700] },
              { str: 'AAPL', transform: [1, 0, 0, 1, 180, 700] },
              { str: '500.00 EUR', transform: [1, 0, 0, 1, 260, 700] },
              { str: '2025-01-20', transform: [1, 0, 0, 1, 10, 680] },
              { str: 'DIVIDEND', transform: [1, 0, 0, 1, 120, 680] },
              { str: '12.50 EUR', transform: [1, 0, 0, 1, 260, 680] },
            ],
          }),
        })),
      }),
      destroy,
    });

    const result = await extractPdfLocally(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
      allowImageFallback: false,
    });

    expect(mockGetDocument).toHaveBeenCalledWith(
      expect.objectContaining({ useSystemFonts: false })
    );
    expect(result.mode).toBe('pdf_text');
    if (result.mode === 'pdf_text') {
      expect(result.pageCount).toBe(1);
      expect(result.text).toContain('2025-01-15 BUY AAPL 500.00 EUR');
      expect(result.text).toContain('2025-01-20 DIVIDEND 12.50 EUR');
    }
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('throws PdfScannedNeedsVisionError on image-only PDFs when vision is disabled', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        cleanup: vi.fn(async () => {}),
        getPage: vi.fn(async () => ({
          getTextContent: async () => ({ items: [] }),
        })),
      }),
      destroy: vi.fn(async () => {}),
    });

    await expect(
      extractPdfLocally(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
        allowImageFallback: false,
      })
    ).rejects.toThrow(PdfScannedNeedsVisionError);
  });

  it('renders scanned PDF pages to JPEG images when vision fallback is enabled', async () => {
    const fakeCtx = {} as CanvasRenderingContext2D;
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => fakeCtx,
          toDataURL: () => 'data:image/jpeg;base64,RkFLRV9QREZfUEFHRQ==',
        } as unknown as HTMLCanvasElement;
      }
      return origCreateElement(tagName);
    });

    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 3,
        cleanup: vi.fn(async () => {}),
        getPage: vi.fn(async () => ({
          getTextContent: async () => ({ items: [] }),
          getViewport: ({ scale }: { scale: number }) => ({
            width: 800 * scale,
            height: 1100 * scale,
          }),
          render: () => ({ promise: Promise.resolve() }),
        })),
      }),
      destroy: vi.fn(async () => {}),
    });

    const result = await extractPdfLocally(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
      allowImageFallback: true,
      maxPages: 2,
    });

    expect(result.mode).toBe('pdf_pages_to_images');
    if (result.mode === 'pdf_pages_to_images') {
      expect(result.pageCount).toBe(3);
      expect(result.renderedPages).toBe(2);
      expect(result.pageImages).toEqual([
        { base64: 'RkFLRV9QREZfUEFHRQ==', mimeType: 'image/jpeg' },
        { base64: 'RkFLRV9QREZfUEFHRQ==', mimeType: 'image/jpeg' },
      ]);
    }
  });
});
