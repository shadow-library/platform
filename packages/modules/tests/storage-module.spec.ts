/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Module, ShadowFactory } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { StorageErrorCode, StorageModule, StorageService } from '@shadow-library/modules/storage';

describe('Storage Module', () => {
  const publicOrigin = 'https://storage.example.test';
  const bytes = new TextEncoder().encode('shadow-library object storage');

  describe('Local driver (StorageService)', () => {
    let storage: StorageService;
    let dir: string;

    beforeAll(async () => {
      dir = mkdtempSync(join(tmpdir(), 'shadow-storage-'));

      @Module({ imports: [StorageModule.forRoot({ driver: 'local', publicOrigin, local: { dir } })] })
      class LocalAppModule {}

      const app = await ShadowFactory.create(LocalAppModule);
      storage = app.get(StorageService);
    });

    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('should content-address the ref as <sha256hex>.<ext>', async () => {
      const ref = await storage.save(bytes, { contentType: 'image/png' });
      expect(ref).toMatch(/^[0-9a-f]{64}\.png$/);
    });

    it('should return the same ref for identical bytes (dedupe by construction)', async () => {
      const first = await storage.save(bytes, { contentType: 'image/png' });
      const second = await storage.save(bytes, { contentType: 'image/png' });
      expect(second).toBe(first);
    });

    it('should derive the extension from the content type', async () => {
      const jpeg = await storage.save(bytes, { contentType: 'image/jpeg' });
      expect(jpeg.endsWith('.jpg')).toBe(true);
      const webp = await storage.save(new TextEncoder().encode('another'), { contentType: 'image/webp' });
      expect(webp.endsWith('.webp')).toBe(true);
    });

    it('should honour an explicit extension override', async () => {
      const ref = await storage.save(bytes, { contentType: 'application/octet-stream', ext: 'bin' });
      expect(ref.endsWith('.bin')).toBe(true);
    });

    it('should read back the stored bytes', async () => {
      const ref = await storage.save(bytes, { contentType: 'image/png' });
      const object = await storage.read(ref);
      expect(Buffer.from(object.bytes).toString()).toBe('shadow-library object storage');
      expect(object.contentType).toBe('image/png');
    });

    it('should report existence and remove objects', async () => {
      const ref = await storage.save(bytes, { contentType: 'image/png' });
      expect(await storage.exists(ref)).toBe(true);
      await storage.delete(ref);
      expect(await storage.exists(ref)).toBe(false);
    });

    it('should throw OBJECT_NOT_FOUND when reading a missing ref', async () => {
      await expect(storage.read('deadbeef.png')).rejects.toThrow(StorageErrorCode.OBJECT_NOT_FOUND.message);
    });

    it('should build the public URL from the configured origin', async () => {
      const ref = await storage.save(bytes, { contentType: 'image/png' });
      expect(storage.getPublicUrl(ref)).toBe(`${publicOrigin}/${ref}`);
    });

    it('should pass a nullish ref through getPublicUrl unchanged', () => {
      expect(storage.getPublicUrl(null)).toBeUndefined();
      expect(storage.getPublicUrl(undefined)).toBeUndefined();
    });

    it('should reject presigned uploads on the local driver', () => {
      expect(() => storage.getPresignedUploadUrl('deadbeef.png', { contentType: 'image/png' })).toThrow('not supported');
    });

    it('should reject presigned downloads on the local driver', () => {
      expect(() => storage.getPresignedDownloadUrl('deadbeef.png')).toThrow('not supported');
    });

    it('should stat a stored object without transferring its bytes', async () => {
      const ref = await storage.save(bytes, { contentType: 'image/png' });
      const head = await storage.stat(ref);
      expect(head).toEqual({ size: bytes.length, contentType: 'image/png' });
    });

    it('should throw OBJECT_NOT_FOUND when statting a missing ref', async () => {
      await expect(storage.stat('deadbeef.png')).rejects.toThrow(StorageErrorCode.OBJECT_NOT_FOUND.message);
    });
  });

  describe('S3 driver (presign)', () => {
    let storage: StorageService;

    beforeAll(async () => {
      @Module({
        imports: [
          StorageModule.forRoot({
            driver: 's3',
            publicOrigin,
            s3: {
              endpoint: 'http://garage.internal:3900',
              externalEndpoint: 'https://storage-api.example.test',
              region: 'garage',
              bucket: 'storage',
              accessKeyId: 'test-key',
              secretAccessKey: 'test-secret',
            },
          }),
        ],
      })
      class S3AppModule {}

      const app = await ShadowFactory.create(S3AppModule);
      storage = app.get(StorageService);
    });

    it('should presign a PUT upload against the external endpoint', () => {
      const url = storage.getPresignedUploadUrl('abc123.png', { contentType: 'image/png', expiresSeconds: 600 });
      expect(url.startsWith('https://storage-api.example.test')).toBe(true);
      expect(url).toContain('X-Amz-Signature');
      expect(url).toContain('abc123.png');
    });

    it('should build the public URL from the configured origin', () => {
      expect(storage.getPublicUrl('abc123.png')).toBe(`${publicOrigin}/abc123.png`);
    });

    it('should presign a GET download against the external endpoint', () => {
      const url = storage.getPresignedDownloadUrl('abc123.png', { expiresSeconds: 600 });
      expect(url.startsWith('https://storage-api.example.test')).toBe(true);
      expect(url).toContain('X-Amz-Signature');
      expect(url).toContain('abc123.png');
    });

    it('should accept a caller-supplied non-content-addressed ref for presigning (ADR-0008)', () => {
      const url = storage.getPresignedUploadUrl('r/42/018f1234-abcd-7000-8000-000000000000.jpg', { contentType: 'image/jpeg' });
      expect(url).toContain('r/42/018f1234-abcd-7000-8000-000000000000.jpg');
    });
  });
});
