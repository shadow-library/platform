import { type OcrQuotaResponseDto, type ReceiptConfirmResponseDto, type ReceiptCreateDto, type ReceiptCreateResponseDto, type ReceiptDownloadResponseDto } from './api-types.gen';
import { APIRequest } from './transport';

export interface ObjectUploadProgress {
  onProgress: (percent: number) => void;
  signal: AbortSignal;
}

export type ObjectUploadFailure = 'network' | 'rejected' | 'aborted';

export class ObjectUploadError extends Error {
  constructor(readonly failure: ObjectUploadFailure) {
    super(`Receipt upload ${failure}`);
    this.name = 'ObjectUploadError';
  }
}

/**
 * The presigned PUT goes straight to object storage, not to shadow-memoir-server, so it cannot use
 * `APIRequest`: the URL is absolute, the body is the raw file, and the signature pins the content type
 * (a CSRF or JSON header would break it). XHR rather than fetch, because only XHR reports upload progress.
 */
function putObject(uploadUrl: string, file: Blob, contentType: string, progress: ObjectUploadProgress): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = (): void => request.abort();
    progress.signal.addEventListener('abort', abort, { once: true });
    const settle = (failure: ObjectUploadFailure | null): void => {
      progress.signal.removeEventListener('abort', abort);
      if (failure) reject(new ObjectUploadError(failure));
      else resolve();
    };

    request.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) progress.onProgress((event.loaded / event.total) * 100);
    };
    request.onload = () => settle(request.status >= 200 && request.status < 300 ? null : 'rejected');
    request.onerror = () => settle('network');
    request.onabort = () => settle('aborted');
    if (progress.signal.aborted) return settle('aborted');
    request.open('PUT', uploadUrl);
    request.setRequestHeader('content-type', contentType);
    request.send(file);
  });
}

export const receiptApi = {
  create: (body: ReceiptCreateDto): Promise<ReceiptCreateResponseDto> => APIRequest.post('/v1/receipts').body(body).execute<ReceiptCreateResponseDto>(),
  confirm: (ref: string): Promise<ReceiptConfirmResponseDto> => APIRequest.post(`/v1/receipts/${encodeURIComponent(ref)}/confirm`).execute<ReceiptConfirmResponseDto>(),
  download: (ref: string): Promise<ReceiptDownloadResponseDto> => APIRequest.get(`/v1/receipts/${encodeURIComponent(ref)}/download`).execute<ReceiptDownloadResponseDto>(),
  putObject,
  scanQuota: (): Promise<OcrQuotaResponseDto> => APIRequest.get('/v1/ocr/quota').execute<OcrQuotaResponseDto>(),
};
