/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type AsyncModuleOptions } from '../internal.utils';

/**
 * Defining types
 */

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'storage.driver': StorageDriver;
    'storage.s3.endpoint'?: string;
    'storage.s3.external-endpoint'?: string;
    'storage.s3.region'?: string;
    'storage.s3.bucket'?: string;
    'storage.s3.access-key-id'?: string;
    'storage.s3.secret-access-key'?: string;
    'storage.public-origin'?: string;
    'storage.local.dir'?: string;
  }
}

export type StorageDriver = 's3' | 'local';

/** The bytes of a stored object plus the content type it was written with. */
export interface StorageObject {
  bytes: Uint8Array;
  contentType: string;
}

export interface SaveOptions {
  /** MIME type the bytes are written with; also drives the ref extension when `ext` is omitted */
  contentType: string;

  /** Explicit ref extension (without the dot); derived from `contentType` when omitted */
  ext?: string;
}

export interface PresignUploadOptions {
  /** MIME type the client will `PUT`; bound into the signature so a mismatched upload is rejected */
  contentType: string;

  /** Seconds until the presigned URL expires (default 900) */
  expiresSeconds?: number;
}

export interface PresignDownloadOptions {
  /** Seconds until the presigned URL expires (default 900) */
  expiresSeconds?: number;
}

/** Metadata fetched without a body transfer (an S3 `HEAD`, or the local driver's file stat). */
export interface HeadResult {
  size: number;
  contentType: string;
}

/**
 * The driver seam. Providers deal only in already-computed refs — content addressing, URL policy and
 * MIME/extension derivation live in `StorageService`, so a provider stays a thin bytes-in/bytes-out
 * adapter over its backend.
 */
export interface StorageProvider {
  /** Writes bytes at `ref`. Callers guarantee `ref` is content-addressed, so a re-put is idempotent */
  put(ref: string, bytes: Uint8Array, contentType: string): Promise<void>;

  /** Reads the object at `ref`; throws `StorageErrorCode.OBJECT_NOT_FOUND` when it is absent */
  get(ref: string): Promise<StorageObject>;

  /** Removes the object at `ref`; a missing object is not an error */
  delete(ref: string): Promise<void>;

  /** Whether an object exists at `ref` */
  exists(ref: string): Promise<boolean>;

  /** Metadata for the object at `ref` without transferring its bytes; `null` when absent */
  head(ref: string): Promise<HeadResult | null>;

  /** Presigns a `PUT` upload URL, when the backend supports it; absent on local-disk storage */
  presignUpload?(ref: string, contentType: string, expiresSeconds: number): string;

  /** Presigns a `GET` download URL, when the backend supports it; absent on local-disk storage */
  presignDownload?(ref: string, expiresSeconds: number): string;

  /** Lists every ref under `prefix`, when the backend supports it; absent on local-disk storage */
  list?(prefix: string): Promise<string[]>;
}

export interface S3StorageOptions {
  /** In-cluster S3 API endpoint used for reads/writes. Falls back to `storage.s3.endpoint` */
  endpoint?: string;

  /** External S3 API endpoint the presigned URLs point at. Falls back to `storage.s3.external-endpoint`, then `endpoint` */
  externalEndpoint?: string;

  /** S3 region. Falls back to `storage.s3.region` */
  region?: string;

  /** Bucket every object lives in. Falls back to `storage.s3.bucket` */
  bucket?: string;

  /** Access key id. Falls back to `storage.s3.access-key-id` */
  accessKeyId?: string;

  /** Secret access key. Falls back to `storage.s3.secret-access-key` */
  secretAccessKey?: string;
}

export interface LocalStorageOptions {
  /** Directory objects are written under. Falls back to `storage.local.dir` */
  dir?: string;
}

export interface StorageModuleOptions {
  /** Which provider backs the service. Falls back to `storage.driver` (default `s3`) */
  driver?: StorageDriver;

  /** Origin the public download URLs are built from. Falls back to `storage.public-origin` */
  publicOrigin?: string;

  /** S3 driver overrides; every field otherwise resolves from config */
  s3?: S3StorageOptions;

  /** Local driver overrides; every field otherwise resolves from config */
  local?: LocalStorageOptions;
}

export type StorageModuleAsyncOptions = AsyncModuleOptions<StorageModuleOptions>;
