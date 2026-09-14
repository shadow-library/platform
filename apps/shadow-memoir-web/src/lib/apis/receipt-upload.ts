import { ObjectUploadError } from './receipt.api';
import { isApiError } from './transport';

export const RECEIPT_MAX_BYTES = 8 * 1024 * 1024;

const RECEIPT_CONTENT_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };

export const RECEIPT_EXTENSIONS = Object.keys(RECEIPT_CONTENT_TYPES).map(extension => `.${extension}`);

/** Browsers often report HEIC photos with an empty `type`, so the extension decides when the type is missing. */
export function receiptContentType(file: Pick<File, 'name' | 'type'>): string | null {
  const declared = file.type.toLowerCase();
  if (Object.values(RECEIPT_CONTENT_TYPES).includes(declared)) return declared;
  if (declared) return null;
  return RECEIPT_CONTENT_TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

export type ReceiptUploadFailure = 'unsupported-type' | 'too-large' | 'offline' | 'expired' | 'cancelled' | 'failed';

export const RECEIPT_FAILURE_COPY: Record<ReceiptUploadFailure, string> = {
  'unsupported-type': 'That file isn’t a photo Shadow Memoir can keep. Use a JPEG, PNG, WebP or HEIC image.',
  'too-large': 'That photo is larger than 8 MB. Pick a smaller one.',
  offline: 'You’re offline, so the receipt can’t be attached right now. Remove it to save without one, or try again once you’re back online.',
  expired: 'The receipt upload expired before the expense was saved. Remove it and pick the photo again.',
  cancelled: 'The upload was cancelled.',
  failed: 'The receipt didn’t upload. Retry, or remove it to save without one.',
};

export class ReceiptUploadError extends Error {
  constructor(readonly failure: ReceiptUploadFailure) {
    super(RECEIPT_FAILURE_COPY[failure]);
    this.name = 'ReceiptUploadError';
  }
}

const API_FAILURES: Record<string, ReceiptUploadFailure> = { RCP_001: 'expired', RCP_002: 'unsupported-type', RCP_003: 'too-large' };

export function toReceiptUploadError(error: unknown): ReceiptUploadError {
  if (error instanceof ReceiptUploadError) return error;
  if (error instanceof ObjectUploadError) return new ReceiptUploadError(error.failure === 'aborted' ? 'cancelled' : error.failure === 'network' ? 'offline' : 'failed');
  if (isApiError(error)) return new ReceiptUploadError(API_FAILURES[error.code] ?? (error.status === -1 ? 'offline' : 'failed'));
  return new ReceiptUploadError('failed');
}
