/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { IllustrationModule } from '@modules/illustration/illustration.module';
import { IllustrationService } from '@modules/illustration/illustration.service';
import { IMAGE_STORAGE } from '@modules/storage/image-storage.interface';
import { LocalImageStorageProvider } from '@modules/storage/local-image-storage.provider';
import { StorageModule } from '@modules/storage/storage.module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('LocalImageStorageProvider', () => {
  it('getUrl returns correct API route format', () => {
    const provider = new LocalImageStorageProvider();
    const url = provider.getUrl('1/hero.png');
    expect(url).toBe('/api/v1/images/1/hero.png');
  });

  it('getUrl with nested ref preserves full path', () => {
    const provider = new LocalImageStorageProvider();
    const url = provider.getUrl('42/protagonist.jpg');
    expect(url).toContain('/api/v1/images/');
    expect(url).toContain('42/protagonist.jpg');
  });

  it('class is constructable', () => {
    expect(() => new LocalImageStorageProvider()).not.toThrow();
  });
});

describe('StorageModule', () => {
  it('exports IMAGE_STORAGE symbol', () => {
    expect(IMAGE_STORAGE).toBeDefined();
    expect(typeof IMAGE_STORAGE).toBe('symbol');
  });

  it('module class exists', () => {
    expect(StorageModule).toBeDefined();
  });
});

describe('IllustrationService', () => {
  it('class is defined', () => {
    expect(IllustrationService).toBeDefined();
  });

  it('IllustrationModule is defined', () => {
    expect(IllustrationModule).toBeDefined();
  });
});
