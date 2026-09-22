/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { StorageService } from '../storage/storage.service';
import { type StorageProvider } from '../storage/storage.types';
import { InMemoryStorageProvider } from './in-memory-storage.provider';

/**
 * Defining types
 */

export interface FakeStorageOptions {
  publicOrigin?: string;

  /** Defaults to a fresh `InMemoryStorageProvider`; pass one to seed objects or to inject failures */
  provider?: StorageProvider;
}

/**
 * Declaring the constants
 */
const DEFAULT_PUBLIC_ORIGIN = 'https://storage.test';

/**
 * The real `StorageService` — content addressing, URL building, not-found mapping — over an in-memory
 * provider, ready from construction. `onModuleInit` is a no-op so a booted app never resolves S3 config.
 */
export class FakeStorageService extends StorageService {
  constructor(options: FakeStorageOptions = {}) {
    const publicOrigin = (options.publicOrigin ?? DEFAULT_PUBLIC_ORIGIN).replace(/\/+$/, '');
    super({ driver: 's3', publicOrigin });
    this.driver = 's3';
    this.publicOrigin = publicOrigin;
    this.provider = options.provider ?? new InMemoryStorageProvider();
  }

  override onModuleInit(): void {
    return undefined;
  }
}
