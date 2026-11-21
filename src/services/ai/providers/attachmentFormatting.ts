import type { ChatAttachment } from '../types';

/**
 * Serialize any text-based or purged attachments into a deterministic block appended
 * to a user message's text content.
 */
export function formatTextAttachments(attachments?: ChatAttachment[]): string {
  if (!attachments || attachments.length === 0) return '';
  const parts: string[] = [];

  for (const att of attachments) {
    if (att.text) {
      parts.push(`<attachment name="${att.name}">\n${att.text}\n</attachment>`);
    } else if (att.purged) {
      parts.push(`[attachment: ${att.name}]`);
    }
  }

  return parts.length > 0 ? `\n\n${parts.join('\n\n')}` : '';
}

const ATTACHMENT_REJECTION_PATTERNS = [
  /does not support images?/i,
  /image(?:s)? (?:is|are) not supported/i,
  /vision.*not supported/i,
  /multimodal.*not supported/i,
  /unsupported (?:content|media|file|mime|image)/i,
  /invalid image/i,
  /cannot (?:read|process|accept) (?:image|file|pdf|document)/i,
  /unknown (?:content )?type\s*[:=]?\s*['"]?(?:image_url|file|document)/i,
  /file(?:s)? (?:is|are) not supported/i,
  /pdf.*not supported/i,
];

/**
 * Detect whether a 400/422 error payload indicates the model rejected an attached image/PDF.
 */
export function isAttachmentRejectionError(status: number, body: string): boolean {
  if (status !== 400 && status !== 422) return false;
  return ATTACHMENT_REJECTION_PATTERNS.some((pattern) => pattern.test(body));
}
