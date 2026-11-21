import { decodeCsvBuffer } from '../import/csvCore';
import { readXlsxAsCsv, XlsxReadError } from '../import/xlsxReader';
import { canAttach, type ModelCapabilities } from './modelCapabilities';
import { extractPdfLocally, PdfScannedNeedsVisionError } from './pdfReader';
import type { AttachmentKind, ChatAttachment } from './types';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION_PX = 2000;

export type AttachmentErrorCode =
  | 'xls_legacy'
  | 'unsupported_type'
  | 'too_large'
  | 'corrupt_file'
  | 'capability_denied'
  | 'scanned_pdf_no_vision';

export class AttachmentError extends Error {
  constructor(
    public readonly code: AttachmentErrorCode,
    public readonly reasonKey?: string,
    message?: string
  ) {
    super(message || `Attachment error: ${code}`);
    this.name = 'AttachmentError';
  }
}

const hasPrefix = (bytes: Uint8Array, sig: number[]): boolean =>
  bytes.length >= sig.length && sig.every((b, idx) => bytes[idx] === b);

const isWebp = (bytes: Uint8Array): boolean =>
  bytes.length >= 12 &&
  hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) && // RIFF
  bytes[8] === 0x57 &&
  bytes[9] === 0x45 &&
  bytes[10] === 0x42 &&
  bytes[11] === 0x50; // WEBP

const isOle2Xls = (bytes: Uint8Array): boolean =>
  hasPrefix(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const isZipPk = (bytes: Uint8Array): boolean =>
  hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]) || hasPrefix(bytes, [0x50, 0x4b, 0x05, 0x06]);

const isPdfMagic = (bytes: Uint8Array): boolean =>
  hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

const isPngMagic = (bytes: Uint8Array): boolean =>
  hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const isJpegMagic = (bytes: Uint8Array): boolean =>
  hasPrefix(bytes, [0xff, 0xd8, 0xff]);

const containsNulByte = (bytes: Uint8Array): boolean => {
  const limit = Math.min(bytes.length, 4096);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
};

function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(''));
}

function getExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

/**
 * Determine the attachment kind by validating both filename/MIME metadata and file magic bytes.
 */
export function detectAttachmentKind(
  file: Pick<File, 'name' | 'type'>,
  bytes: Uint8Array
): { kind: AttachmentKind; mimeType: string } {
  const ext = getExtension(file.name);
  const mime = (file.type || '').toLowerCase();

  if (ext === 'xls' || isOle2Xls(bytes) || mime === 'application/vnd.ms-excel') {
    throw new AttachmentError('xls_legacy', 'ai:attachments.errors.xlsLegacy');
  }

  if (isPdfMagic(bytes)) {
    return { kind: 'pdf', mimeType: 'application/pdf' };
  }
  if (ext === 'pdf' || mime === 'application/pdf') {
    throw new AttachmentError('corrupt_file', 'ai:attachments.errors.corruptFile');
  }

  if (isPngMagic(bytes)) {
    return { kind: 'image', mimeType: 'image/png' };
  }
  if (isJpegMagic(bytes)) {
    return { kind: 'image', mimeType: 'image/jpeg' };
  }
  if (isWebp(bytes)) {
    return { kind: 'image', mimeType: 'image/webp' };
  }
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext) || mime.startsWith('image/')) {
    throw new AttachmentError('corrupt_file', 'ai:attachments.errors.corruptFile');
  }

  if (
    ext === 'xlsx' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    if (!isZipPk(bytes)) {
      throw new AttachmentError('corrupt_file', 'ai:attachments.errors.corruptFile');
    }
    return {
      kind: 'xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  if (
    ['csv', 'tsv', 'txt'].includes(ext) ||
    mime === 'text/csv' ||
    mime === 'text/tab-separated-values' ||
    mime === 'text/plain'
  ) {
    if (containsNulByte(bytes)) {
      throw new AttachmentError('corrupt_file', 'ai:attachments.errors.corruptFile');
    }
    return { kind: 'csv', mimeType: mime || 'text/csv' };
  }

  throw new AttachmentError('unsupported_type', 'ai:attachments.errors.unsupportedType');
}

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer());
  }
  return new Uint8Array(await new Response(file).arrayBuffer());
}

function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new AttachmentError('corrupt_file', 'ai:attachments.errors.corruptFile'));
    };
    img.src = url;
  });
}

async function maybeResizeImage(
  bytes: Uint8Array,
  mimeType: string,
  maxBytes: number
): Promise<{
  base64: string;
  mimeType: string;
  sizeBytes: number;
  resized?: { width: number; height: number };
}> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    if (bytes.byteLength > maxBytes) {
      throw new AttachmentError('too_large', 'ai:attachments.errors.tooLarge');
    }
    return { base64: uint8ToBase64(bytes), mimeType, sizeBytes: bytes.byteLength };
  }

  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  const img = await loadImageElement(blob);
  const needsResize =
    bytes.byteLength > maxBytes ||
    img.naturalWidth > MAX_IMAGE_DIMENSION_PX ||
    img.naturalHeight > MAX_IMAGE_DIMENSION_PX;

  if (!needsResize) {
    return { base64: uint8ToBase64(bytes), mimeType, sizeBytes: bytes.byteLength };
  }

  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION_PX / Math.max(1, img.naturalWidth, img.naturalHeight)
  );
  const targetWidth = Math.max(1, Math.round(img.naturalWidth * scale));
  const targetHeight = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.width = 0;
    canvas.height = 0;
    throw new AttachmentError('too_large', 'ai:attachments.errors.tooLarge');
  }
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  canvas.width = 0;
  canvas.height = 0;

  const base64 = dataUrl.split(',')[1] ?? '';
  const estimatedBytes = Math.floor((base64.length * 3) / 4);
  if (estimatedBytes > maxBytes) {
    throw new AttachmentError('too_large', 'ai:attachments.errors.tooLarge');
  }

  return {
    base64,
    mimeType: 'image/jpeg',
    sizeBytes: estimatedBytes,
    resized: { width: targetWidth, height: targetHeight },
  };
}

/**
 * Validate, check model capability compatibility, and prepare a user-supplied file
 * (CSV, XLSX, PDF, or image) as a `ChatAttachment`.
 */
export async function prepareAttachment(
  file: File,
  caps: ModelCapabilities
): Promise<ChatAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentError('too_large', 'ai:attachments.errors.tooLarge');
  }

  const bytes = await readFileBytes(file);
  if (bytes.byteLength === 0) {
    throw new AttachmentError('corrupt_file', 'ai:attachments.errors.corruptFile');
  }
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentError('too_large', 'ai:attachments.errors.tooLarge');
  }

  const { kind, mimeType } = detectAttachmentKind(file, bytes);
  const allowance = canAttach(kind, caps);
  if (!allowance.ok) {
    throw new AttachmentError('capability_denied', allowance.reasonKey);
  }

  const id = `att_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  if (kind === 'csv') {
    const { text } = decodeCsvBuffer(buffer);
    if (!text.trim()) {
      throw new AttachmentError('corrupt_file', 'ai:attachments.errors.corruptFile');
    }
    return {
      id,
      kind,
      name: file.name,
      mimeType,
      sizeBytes: bytes.byteLength,
      text,
    };
  }

  if (kind === 'xlsx') {
    try {
      const xlsx = await readXlsxAsCsv(buffer);
      return {
        id,
        kind,
        name: file.name,
        mimeType,
        sizeBytes: bytes.byteLength,
        text: xlsx.csv,
        preprocessing: {
          method: 'xlsx_to_csv',
          details: { sheet: xlsx.activeSheet, rows: xlsx.rowCount },
        },
      };
    } catch (err) {
      if (err instanceof XlsxReadError) {
        throw new AttachmentError('corrupt_file', 'ai:attachments.errors.corruptFile', err.message);
      }
      throw err;
    }
  }

  if (kind === 'image') {
    const processed = await maybeResizeImage(bytes, mimeType, caps.maxImageBytes);
    return {
      id,
      kind,
      name: file.name,
      mimeType: processed.mimeType,
      sizeBytes: processed.sizeBytes,
      base64: processed.base64,
      ...(processed.resized
        ? { preprocessing: { method: 'image_resized', details: processed.resized } }
        : {}),
    };
  }

  // kind === 'pdf'
  if (caps.nativePdf) {
    if (bytes.byteLength > caps.maxPdfBytes) {
      throw new AttachmentError('too_large', 'ai:attachments.errors.tooLarge');
    }
    return {
      id,
      kind,
      name: file.name,
      mimeType,
      sizeBytes: bytes.byteLength,
      base64: uint8ToBase64(bytes),
    };
  }

  try {
    const extracted = await extractPdfLocally(bytes, {
      allowImageFallback: caps.vision,
      maxPages: Math.min(5, Math.max(1, caps.maxImages)),
    });
    if (extracted.mode === 'pdf_text') {
      return {
        id,
        kind,
        name: file.name,
        mimeType,
        sizeBytes: bytes.byteLength,
        text: extracted.text,
        preprocessing: {
          method: 'pdf_text',
          details: { pages: extracted.pageCount },
        },
      };
    }
    return {
      id,
      kind,
      name: file.name,
      mimeType,
      sizeBytes: bytes.byteLength,
      pageImages: extracted.pageImages,
      preprocessing: {
        method: 'pdf_pages_to_images',
        details: { pages: extracted.pageCount, renderedPages: extracted.renderedPages },
      },
    };
  } catch (err) {
    if (err instanceof PdfScannedNeedsVisionError) {
      throw new AttachmentError(
        'scanned_pdf_no_vision',
        'ai:attachments.errors.scannedPdfNoVision',
        err.message
      );
    }
    throw new AttachmentError(
      'corrupt_file',
      'ai:attachments.errors.corruptFile',
      err instanceof Error ? err.message : String(err)
    );
  }
}
