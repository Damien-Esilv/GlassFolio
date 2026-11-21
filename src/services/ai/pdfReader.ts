/**
 * Local PDF extractor (E37) — loaded lazily via dynamic import ONLY when
 * a provider without native PDF ingestion (e.g. Ollama, Groq) needs to read a PDF.
 *
 * Security invariants:
 * - Same-origin worker bundle emitted by Vite (`?url`), compatible with Trusted Types `default`.
 * - Dynamic eval/Function font evaluation is disabled in pdfjs-dist v6 and `useSystemFonts: false`
 *   further hardens parsing against font-based XSS.
 */

export class PdfScannedNeedsVisionError extends Error {
  constructor(public readonly pageCount: number) {
    super(`Scanned PDF (${pageCount} page(s)) requires a vision-capable model`);
    this.name = 'PdfScannedNeedsVisionError';
  }
}

export type LocalPdfExtractionResult =
  | {
      mode: 'pdf_text';
      text: string;
      pageCount: number;
    }
  | {
      mode: 'pdf_pages_to_images';
      pageImages: Array<{ base64: string; mimeType: 'image/jpeg' }>;
      pageCount: number;
      renderedPages: number;
    };

const MIN_TEXT_CHARS = 40;
const MAX_TEXT_PAGES = 40;
const DEFAULT_MAX_RENDER_PAGES = 5;
const MAX_RENDER_WIDTH_PX = 1800;

interface TextItemLike {
  str?: string;
  transform?: number[];
}

function groupTextItemsIntoLines(items: TextItemLike[]): string {
  const lines: Array<{ y: number; chunks: Array<{ x: number; text: string }> }> = [];

  for (const item of items) {
    const str = (item.str ?? '').trim();
    if (!str) continue;
    const x = Array.isArray(item.transform) && typeof item.transform[4] === 'number' ? item.transform[4] : 0;
    const y = Array.isArray(item.transform) && typeof item.transform[5] === 'number' ? Math.round(item.transform[5] / 3) * 3 : 0;

    let bucket = lines.find((line) => Math.abs(line.y - y) <= 3);
    if (!bucket) {
      bucket = { y, chunks: [] };
      lines.push(bucket);
    }
    bucket.chunks.push({ x, text: str });
  }

  lines.sort((a, b) => b.y - a.y);
  return lines
    .map((line) => {
      line.chunks.sort((a, b) => a.x - b.x);
      return line.chunks.map((c) => c.text).join(' ');
    })
    .join('\n');
}

/**
 * Extract digital text from a PDF locally, or render scanned pages as JPEG images
 * when `allowImageFallback` is enabled.
 */
export async function extractPdfLocally(
  bytes: Uint8Array,
  options: { allowImageFallback: boolean; maxPages?: number }
): Promise<LocalPdfExtractionResult> {
  const [pdfjs, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);

  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

  const loadingTask = pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
  });

  const pdfDoc = await loadingTask.promise;
  try {
    const pageCount = pdfDoc.numPages;
    const textPages = Math.min(pageCount, MAX_TEXT_PAGES);
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= textPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const formatted = groupTextItemsIntoLines(textContent.items as TextItemLike[]);
      if (formatted.trim()) {
        pageTexts.push(`--- Page ${pageNum} ---\n${formatted}`);
      }
    }

    const joinedText = pageTexts.join('\n\n').trim();
    const nonSpaceLength = joinedText.replace(/\s+/g, '').length;
    if (nonSpaceLength >= MIN_TEXT_CHARS) {
      return {
        mode: 'pdf_text',
        text: joinedText,
        pageCount,
      };
    }

    if (!options.allowImageFallback) {
      throw new PdfScannedNeedsVisionError(pageCount);
    }

    const renderLimit = Math.min(pageCount, options.maxPages ?? DEFAULT_MAX_RENDER_PAGES);
    const pageImages: Array<{ base64: string; mimeType: 'image/jpeg' }> = [];

    for (let pageNum = 1; pageNum <= renderLimit; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(2, MAX_RENDER_WIDTH_PX / Math.max(1, baseViewport.width));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        canvas.width = 0;
        canvas.height = 0;
        throw new PdfScannedNeedsVisionError(pageCount);
      }

      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      canvas.width = 0;
      canvas.height = 0;

      const base64 = dataUrl.split(',')[1] ?? '';
      if (base64) {
        pageImages.push({ base64, mimeType: 'image/jpeg' });
      }
    }

    if (pageImages.length === 0) {
      throw new PdfScannedNeedsVisionError(pageCount);
    }

    return {
      mode: 'pdf_pages_to_images',
      pageImages,
      pageCount,
      renderedPages: pageImages.length,
    };
  } finally {
    await pdfDoc.cleanup();
    await loadingTask.destroy();
  }
}
