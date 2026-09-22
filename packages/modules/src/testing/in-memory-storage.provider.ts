/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { StorageErrorCode } from '../storage/storage.errors';
import { type HeadResult, type StorageObject, type StorageProvider } from '../storage/storage.types';

/**
 * Defining types
 */

export interface InMemoryStorageProviderOptions {
  /** Origin the fake presigned URLs point at */
  presignOrigin?: string;
}

/**
 * Declaring the constants
 */
const DEFAULT_PRESIGN_ORIGIN = 'https://presigned.storage.test';

/**
 * A `StorageProvider` over a map, with the S3 driver's full capability set. Bytes are copied in and out,
 * so a caller mutating its buffer afterwards cannot rewrite what was stored. Presigned URLs are
 * deterministic and carry their method, content type and expiry as query parameters for assertions.
 */
export class InMemoryStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, StorageObject>();
  private readonly presignOrigin: string;

  constructor(options: InMemoryStorageProviderOptions = {}) {
    this.presignOrigin = (options.presignOrigin ?? DEFAULT_PRESIGN_ORIGIN).replace(/\/+$/, '');
  }

  private presign(ref: string, method: 'GET' | 'PUT', expiresSeconds: number, contentType?: string): string {
    const url = new URL(`${this.presignOrigin}/${ref}`);
    url.searchParams.set('method', method);
    if (contentType) url.searchParams.set('content-type', contentType);
    url.searchParams.set('expires', String(expiresSeconds));
    return url.toString();
  }

  async put(ref: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(ref, { bytes: new Uint8Array(bytes), contentType });
  }

  async get(ref: string): Promise<StorageObject> {
    const object = this.objects.get(ref);
    if (!object) throw StorageErrorCode.OBJECT_NOT_FOUND.create({ ref });
    return { bytes: new Uint8Array(object.bytes), contentType: object.contentType };
  }

  async delete(ref: string): Promise<void> {
    this.objects.delete(ref);
  }

  async exists(ref: string): Promise<boolean> {
    return this.objects.has(ref);
  }

  async head(ref: string): Promise<HeadResult | null> {
    const object = this.objects.get(ref);
    return object ? { size: object.bytes.byteLength, contentType: object.contentType } : null;
  }

  presignUpload(ref: string, contentType: string, expiresSeconds: number): string {
    return this.presign(ref, 'PUT', expiresSeconds, contentType);
  }

  presignDownload(ref: string, expiresSeconds: number): string {
    return this.presign(ref, 'GET', expiresSeconds);
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.objects.keys()].filter(ref => ref.startsWith(prefix)).sort();
  }
}
