/**
 * Importing npm packages
 */
import { Inject, Injectable, OnModuleInit } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { LocalStorageProvider } from './providers/local-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { DEFAULT_CONFIGS, LOGGER_NAMESPACE, STORAGE_MODULE_OPTIONS } from './storage.constants';
import { StorageErrorCode } from './storage.errors';
import { type PresignUploadOptions, type SaveOptions, type StorageDriver, type StorageModuleOptions, type StorageObject, type StorageProvider } from './storage.types';
import { extFromContentType, sha256Hex } from './storage.utils';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * The public object-storage surface. Refs are content-addressed (`<sha256hex>.<ext>`) so a re-upload of
 * identical bytes yields the same ref and is deduplicated by construction, and a stored ref is immutable.
 * URL policy (public origin, presign endpoint) and MIME/extension derivation live here; the driver seam
 * below stays a thin bytes adapter.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = Logger.getLogger(LOGGER_NAMESPACE, 'StorageService');

  private driver!: StorageDriver;
  private provider!: StorageProvider;
  private publicOrigin!: string;

  constructor(@Inject(STORAGE_MODULE_OPTIONS) private readonly options: StorageModuleOptions) {}

  onModuleInit(): void {
    this.driver = this.options.driver ?? Config.register('storage.driver', DEFAULT_CONFIGS['storage.driver']);
    this.publicOrigin = (this.options.publicOrigin ?? this.require('storage.public-origin')).replace(/\/+$/, '');
    this.provider = this.driver === 'local' ? this.buildLocalProvider() : this.buildS3Provider();
    this.logger.info('Storage service initialized', { driver: this.driver, publicOrigin: this.publicOrigin });
  }

  /** Writes `bytes` under a content-addressed ref (`<sha256hex>.<ext>`) and returns it; identical bytes reuse the existing object. */
  async save(bytes: Uint8Array, options: SaveOptions): Promise<string> {
    const ext = options.ext ?? extFromContentType(options.contentType);
    const ref = `${sha256Hex(bytes)}.${ext}`;
    if (await this.provider.exists(ref)) this.logger.debug('Object already present, skipping write', { ref });
    else await this.provider.put(ref, bytes, options.contentType);
    return ref;
  }

  /** Reads the object at `ref`; throws `StorageErrorCode.OBJECT_NOT_FOUND` when it is absent. */
  read(ref: string): Promise<StorageObject> {
    return this.provider.get(ref);
  }

  /** Removes the object at `ref`; a missing object is not an error. */
  delete(ref: string): Promise<void> {
    return this.provider.delete(ref);
  }

  /** Whether an object exists at `ref`. */
  exists(ref: string): Promise<boolean> {
    return this.provider.exists(ref);
  }

  /** The anonymous public download URL for `ref` (`<publicOrigin>/<ref>`); passthrough for a nullish ref eases DTO mapping. */
  getPublicUrl(ref: string): string;
  getPublicUrl(ref: null | undefined): undefined;
  getPublicUrl(ref: string | null | undefined): string | undefined;
  getPublicUrl(ref?: string | null): string | undefined {
    if (!ref) return undefined;
    return `${this.publicOrigin}/${ref}`;
  }

  /** Presigns a `PUT` upload URL against the external S3 endpoint; unsupported on the local driver. */
  getPresignedUploadUrl(ref: string, options: PresignUploadOptions): string {
    if (!this.provider.presignUpload) throw StorageErrorCode.PRESIGN_UNSUPPORTED.create({ driver: this.driver });
    return this.provider.presignUpload(ref, options.contentType, options.expiresSeconds ?? 900);
  }

  private buildS3Provider(): S3StorageProvider {
    const s3 = this.options.s3 ?? {};
    const endpoint = s3.endpoint ?? this.require('storage.s3.endpoint');
    const externalEndpoint = s3.externalEndpoint ?? Config.register('storage.s3.external-endpoint', DEFAULT_CONFIGS['storage.s3.external-endpoint']) ?? endpoint;
    return new S3StorageProvider({
      endpoint,
      externalEndpoint,
      region: s3.region ?? this.require('storage.s3.region'),
      bucket: s3.bucket ?? this.require('storage.s3.bucket'),
      accessKeyId: s3.accessKeyId ?? this.require('storage.s3.access-key-id'),
      secretAccessKey: s3.secretAccessKey ?? this.require('storage.s3.secret-access-key'),
    });
  }

  private buildLocalProvider(): LocalStorageProvider {
    return new LocalStorageProvider({ dir: this.options.local?.dir ?? this.require('storage.local.dir') });
  }

  private require<K extends keyof typeof DEFAULT_CONFIGS>(key: K): string {
    const value = Config.register(key, DEFAULT_CONFIGS[key]);
    if (typeof value !== 'string' || value.length === 0) throw AppError.internal(`Storage config '${key}' is required but was not provided`);
    return value;
  }
}
