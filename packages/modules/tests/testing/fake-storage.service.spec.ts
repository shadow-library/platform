/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { StorageErrorCode } from '@shadow-library/modules/storage';
import { FakeStorageService, InMemoryStorageProvider } from '@shadow-library/modules/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const bytes = new TextEncoder().encode('fake storage');

describe('FakeStorageService', () => {
  it('should content-address and read back bytes without being initialised', async () => {
    const storage = new FakeStorageService();
    const ref = await storage.save(bytes, { contentType: 'image/png' });
    const object = await storage.read(ref);

    expect(ref).toMatch(/^[0-9a-f]{64}\.png$/);
    expect(object).toEqual({ bytes, contentType: 'image/png' });
  });

  it('should keep stored bytes safe from the caller mutating its buffer', async () => {
    const storage = new FakeStorageService();
    const buffer = new Uint8Array([1, 2, 3]);
    await storage.putAt('fixed.bin', buffer, 'application/octet-stream');
    buffer[0] = 9;

    expect((await storage.read('fixed.bin')).bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('should map a missing object to the storage not-found error', async () => {
    const storage = new FakeStorageService();
    const error = await storage.stat('missing.png').catch((caught: unknown) => caught);
    expect(AppError.is(error, StorageErrorCode.OBJECT_NOT_FOUND)).toBe(true);
  });

  it('should build public urls from the configured origin', () => {
    const storage = new FakeStorageService({ publicOrigin: 'https://cdn.test/' });
    expect(storage.getPublicUrl('a.png')).toBe('https://cdn.test/a.png');
  });

  it('should presign deterministically and list by prefix', async () => {
    const storage = new FakeStorageService();
    await storage.putAt('exports/b.zip', bytes, 'application/zip');
    await storage.putAt('exports/a.zip', bytes, 'application/zip');
    await storage.putAt('receipts/c.png', bytes, 'image/png');

    expect(await storage.list('exports/')).toEqual(['exports/a.zip', 'exports/b.zip']);
    expect(storage.getPresignedUploadUrl('receipts/c.png', { contentType: 'image/png' })).toBe(
      'https://presigned.storage.test/receipts/c.png?method=PUT&content-type=image%2Fpng&expires=900',
    );
    expect(storage.getPresignedDownloadUrl('receipts/c.png', { expiresSeconds: 60 })).toBe('https://presigned.storage.test/receipts/c.png?method=GET&expires=60');
  });

  it('should store through a caller-supplied provider', async () => {
    const provider = new InMemoryStorageProvider();
    const storage = new FakeStorageService({ provider });
    const ref = await storage.save(bytes, { contentType: 'image/png' });

    expect(await provider.exists(ref)).toBe(true);
  });

  it('should skip the real initialisation so no storage config is resolved', () => {
    const storage = new FakeStorageService();
    storage.onModuleInit();
    expect(storage.getPublicUrl('a.png')).toBe('https://storage.test/a.png');
  });
});
