/**
 * Importing npm packages
 */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { StorageErrorCode } from '../storage.errors';
import { type StorageObject, type StorageProvider } from '../storage.types';
import { contentTypeFromRef } from '../storage.utils';

/**
 * Defining types
 */

export interface LocalStorageProviderConfig {
  dir: string;
}

/**
 * Declaring the constants
 */

/**
 * Disk-backed provider for tests and cluster-less development. Refs are content-addressed flat
 * filenames, so no per-project subdirectory tree is needed; the root is created lazily on first write.
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(config: LocalStorageProviderConfig) {
    this.root = resolve(config.dir);
  }

  async put(ref: string, bytes: Uint8Array, _contentType: string): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.resolveRef(ref), bytes);
  }

  async get(ref: string): Promise<StorageObject> {
    try {
      const buffer = await readFile(this.resolveRef(ref));
      return { bytes: new Uint8Array(buffer), contentType: contentTypeFromRef(ref) };
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') throw StorageErrorCode.OBJECT_NOT_FOUND.create({ ref }, error);
      throw AppError.internal(`Failed to read object '${ref}' from local storage`, error);
    }
  }

  async delete(ref: string): Promise<void> {
    await unlink(this.resolveRef(ref)).catch(() => undefined);
  }

  async exists(ref: string): Promise<boolean> {
    return readFile(this.resolveRef(ref))
      .then(() => true)
      .catch(() => false);
  }

  // A content-addressed ref is a bare filename; reject any separator so a crafted value can never escape the root.
  private resolveRef(ref: string): string {
    if (ref.includes('/') || ref.includes('\\') || isAbsolute(ref) || ref.includes('..')) throw AppError.internal(`Refusing to resolve unsafe storage ref '${ref}'`);
    return join(this.root, ref);
  }
}
