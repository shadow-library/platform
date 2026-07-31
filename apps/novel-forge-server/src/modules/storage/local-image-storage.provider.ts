/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { Injectable } from '@shadow-library/app';
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { type ImageStorageProvider } from './image-storage.interface';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class LocalImageStorageProvider implements ImageStorageProvider {
  private get imageDir(): string {
    return Config.get('storage.local.dir');
  }

  async save(projectId: bigint, entityKey: string, bytes: Uint8Array, mime: string): Promise<string> {
    const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
    const dir = join(this.imageDir, String(projectId));
    await mkdir(dir, { recursive: true });
    const filename = `${entityKey}${ext}`;
    await writeFile(join(dir, filename), bytes);
    return `${projectId}/${filename}`;
  }

  async read(ref: string): Promise<{ bytes: Uint8Array; mime: string }> {
    const path = join(this.imageDir, ref);
    const buf = await readFile(path);
    const ext = extname(ref).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return { bytes: new Uint8Array(buf), mime };
  }

  getUrl(ref: string): string {
    return `/api/v1/images/${ref}`;
  }

  async delete(ref: string): Promise<void> {
    await unlink(join(this.imageDir, ref)).catch(() => undefined);
  }
}
