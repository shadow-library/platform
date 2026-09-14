import { isApiError } from './transport';

export type ReceiptDownloadFailure = 'not-found' | 'offline' | 'failed';

export const RECEIPT_DOWNLOAD_FAILURE_COPY: Record<ReceiptDownloadFailure, string> = {
  'not-found': 'This receipt photo isn’t available any more. It may have been deleted on another device, or its upload never finished.',
  offline: 'You’re offline, so the receipt photo can’t be loaded. Try again once you’re back online.',
  failed: 'The receipt photo didn’t load. Try again in a moment.',
};

export class ReceiptDownloadError extends Error {
  constructor(readonly failure: ReceiptDownloadFailure) {
    super(RECEIPT_DOWNLOAD_FAILURE_COPY[failure]);
    this.name = 'ReceiptDownloadError';
  }
}

export function toReceiptDownloadError(error: unknown): ReceiptDownloadError {
  if (error instanceof ReceiptDownloadError) return error;
  if (!isApiError(error)) return new ReceiptDownloadError('failed');
  if (error.code === 'RCP_001') return new ReceiptDownloadError('not-found');
  return new ReceiptDownloadError(error.status === -1 ? 'offline' : 'failed');
}
