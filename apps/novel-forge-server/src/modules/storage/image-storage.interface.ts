/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export const IMAGE_STORAGE = Symbol('IMAGE_STORAGE');

export interface ImageStorageProvider {
  save(projectId: bigint, entityKey: string, bytes: Uint8Array, mime: string): Promise<string>;
  read(ref: string): Promise<{ bytes: Uint8Array; mime: string }>;
  getUrl(ref: string): string;
  delete(ref: string): Promise<void>;
}

/**
 * Declaring the constants
 */
