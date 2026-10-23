import { Inject, Injectable, OnModuleInit } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';

import { LocalStorageProvider } from './providers/local-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { DEFAULT_CONFIGS, LOGGER_NAMESPACE, STORAGE_MODULE_OPTIONS } from './storage.constants';
import { StorageErrorCode } from './storage.errors';
import {
  type HeadResult,
  type PresignDownloadOptions,
  type PresignUploadOptions,
  type SaveOptions,
  type StorageDriver,
  type StorageModuleOptions,
  type StorageObject,
  type StorageProvider,
} from './storage.types';
import { extFromContentType, sha256Hex } from './storage.utils';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = Logger.getLogger(LOGGER_NAMESPACE, 'StorageService');

  protected driver!: StorageDriver;
  protected provider!: StorageProvider;
  protected publicOrigin!: string;

  constructor(@Inject(STORAGE_MODULE_OPTIONS) private readonly options: StorageModuleOptions) {}

  onModuleInit(): void {
    this.driver = this.options.driver ?? Config.register('storage.driver', DEFAULT_CONFIGS['storage.driver']);
    this.publicOrigin = (this.options.publicOrigin ?? this.require('storage.public-origin')).replace(/\/+$/, '');
    this.provider = this.driver === 'local' ? this.buildLocalProvider() : this.buildS3Provider();
    this.logger.info('Storage service initialized', { driver: this.driver, publicOrigin: this.publicOrigin });
  }

  /** Writes `bytes` under the content-addressed ref `<sha256hex>.<ext>` and returns it; identical bytes are deduplicated and a stored ref is immutable. */
  async save(bytes: Uint8Array, options: SaveOptions): Promise<string> {
    const ext = options.ext ?? extFromContentType(options.contentType);
    const ref = `${sha256Hex(bytes)}.${ext}`;
    if (await this.provider.exists(ref)) this.logger.debug('Object already present, skipping write', { ref });
    else await this.provider.put(ref, bytes, options.contentType);
    return ref;
  }

  /** Writes at a caller-supplied `ref`, bypassing content-addressing (e.g. a per-job export manifest); a re-put overwrites */
  putAt(ref: string, bytes: Uint8Array, contentType: string): Promise<void> {
    return this.provider.put(ref, bytes, contentType);
  }

  /** Reads the object at `ref`; throws `StorageErrorCode.OBJECT_NOT_FOUND` when it is absent */
  read(ref: string): Promise<StorageObject> {
    return this.provider.get(ref);
  }

  /** Removes the object at `ref`; a missing object is not an error */
  delete(ref: string): Promise<void> {
    return this.provider.delete(ref);
  }

  exists(ref: string): Promise<boolean> {
    return this.provider.exists(ref);
  }

  /** Metadata for `ref` without transferring its bytes; throws `StorageErrorCode.OBJECT_NOT_FOUND` when it is absent. */
  async stat(ref: string): Promise<HeadResult> {
    const result = await this.provider.head(ref);
    if (!result) throw StorageErrorCode.OBJECT_NOT_FOUND.create({ ref });
    return result;
  }

  /** `<publicOrigin>/<ref>`; a nullish ref yields `undefined` to ease DTO mapping */
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

  /** Presigns a `GET` download URL against the external S3 endpoint; unsupported on the local driver. */
  getPresignedDownloadUrl(ref: string, options: PresignDownloadOptions = {}): string {
    if (!this.provider.presignDownload) throw StorageErrorCode.PRESIGN_UNSUPPORTED.create({ driver: this.driver });
    return this.provider.presignDownload(ref, options.expiresSeconds ?? 900);
  }

  /** Lists every ref under `prefix`; unsupported on the local driver. */
  list(prefix: string): Promise<string[]> {
    if (!this.provider.list) throw StorageErrorCode.LIST_UNSUPPORTED.create({ driver: this.driver });
    return this.provider.list(prefix);
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
