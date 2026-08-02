/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { Config, Logger } from '@shadow-library/common';
import { S3StorageProvider } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import * as schema from '@server/database/schemas';

/**
 * Defining types
 */

interface Stats {
  projects: number;
  uploaded: number;
  rewritten: number;
  skipped: number;
  missing: number;
}

/**
 * Declaring the constants
 *
 * One-shot migration of the four image-ref columns (`projects.cover_image_path`, `entities.image_path`,
 * `entity_images.image_path`, `chapter_images.image_path`) and the reader `publications.cover_path` from
 * the old local-disk layout (`<projectId>/<filename>`) to content-addressed object storage
 * (`<sha256hex>.<ext>`). For every legacy ref it reads the bytes off disk, uploads them content-addressed
 * to the S3 store (deduplicated), and rewrites the column — all columns of one project in a single
 * transaction. Idempotent: refs already hash-shaped, and free-text `cover_path` values that never were
 * disk refs, are left untouched, so a re-run is a no-op. Runs outside the app graph like `migrate.ts`, so
 * it reads `DATABASE_POSTGRES_URL` / `STORAGE_*` from the environment directly.
 */
const LEGACY_REF = /^\d+\/[A-Za-z0-9._-]+$/;
const HASH_REF = /^[0-9a-f]{64}\.[a-z0-9]+$/;
const EXT_CONTENT_TYPE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

const logger = Logger.getLogger(APP_NAME, 'backfill-storage');
Logger.attachTransport(Config.isProd() ? 'console:json' : 'console:pretty');

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable '${key}'`);
  return value;
}

const url = env('DATABASE_POSTGRES_URL', 'postgresql://postgres:postgres@localhost/novel_forge');
const sourceDir = env('BACKFILL_SOURCE_DIR', env('STORAGE_LOCAL_DIR', './images'));
const endpoint = env('STORAGE_S3_ENDPOINT', 'http://garage.system.svc:3900');

const provider = new S3StorageProvider({
  endpoint,
  externalEndpoint: env('STORAGE_S3_EXTERNAL_ENDPOINT', '') || endpoint,
  region: env('STORAGE_S3_REGION', 'garage'),
  bucket: env('STORAGE_S3_BUCKET', 'storage'),
  accessKeyId: required('STORAGE_S3_ACCESS_KEY_ID'),
  secretAccessKey: required('STORAGE_S3_SECRET_ACCESS_KEY'),
});

const db = drizzle(url, { schema });
const stats: Stats = { projects: 0, uploaded: 0, rewritten: 0, skipped: 0, missing: 0 };
const uploaded = new Set<string>();
const resolved = new Map<string, string | null>();

// Reads a legacy disk ref's bytes, uploads them content-addressed (deduplicated), and returns the new
// ref — or `null` when the ref is already migrated, is not a disk ref, or its file is gone.
async function resolveNewRef(oldRef: string | null): Promise<string | null> {
  if (!oldRef || HASH_REF.test(oldRef)) return null;
  if (!LEGACY_REF.test(oldRef)) {
    stats.skipped += 1;
    return null;
  }
  if (resolved.has(oldRef)) return resolved.get(oldRef) ?? null;

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(join(sourceDir, oldRef)));
  } catch (error) {
    logger.warn('source file missing, leaving ref untouched', { ref: oldRef, error: (error as Error).message });
    stats.missing += 1;
    resolved.set(oldRef, null);
    return null;
  }

  const ext = (oldRef.slice(oldRef.lastIndexOf('.') + 1).toLowerCase() || 'bin').replace('jpeg', 'jpg');
  const contentType = EXT_CONTENT_TYPE[ext] ?? 'application/octet-stream';
  const newRef = `${createHash('sha256').update(bytes).digest('hex')}.${ext}`;

  if (!uploaded.has(newRef) && !(await provider.exists(newRef))) {
    await provider.put(newRef, bytes, contentType);
    stats.uploaded += 1;
  }
  uploaded.add(newRef);
  resolved.set(oldRef, newRef);
  return newRef;
}

try {
  const projectRows = await db.select({ id: schema.projects.id, coverImagePath: schema.projects.coverImagePath }).from(schema.projects);
  logger.info('starting storage backfill', { projects: projectRows.length, sourceDir });

  for (const project of projectRows) {
    const projectId = project.id;
    await db.transaction(async tx => {
      const cover = await resolveNewRef(project.coverImagePath);
      if (cover) {
        await tx.update(schema.projects).set({ coverImagePath: cover }).where(eq(schema.projects.id, projectId));
        stats.rewritten += 1;
      }

      const entities = await tx.select({ id: schema.entities.id, imagePath: schema.entities.imagePath }).from(schema.entities).where(eq(schema.entities.projectId, projectId));
      for (const row of entities) {
        const next = await resolveNewRef(row.imagePath);
        if (!next) continue;
        await tx.update(schema.entities).set({ imagePath: next }).where(eq(schema.entities.id, row.id));
        stats.rewritten += 1;
      }

      const galleries = await tx
        .select({ id: schema.entityImages.id, imagePath: schema.entityImages.imagePath })
        .from(schema.entityImages)
        .where(eq(schema.entityImages.projectId, projectId));
      for (const row of galleries) {
        const next = await resolveNewRef(row.imagePath);
        if (!next) continue;
        await tx.update(schema.entityImages).set({ imagePath: next }).where(eq(schema.entityImages.id, row.id));
        stats.rewritten += 1;
      }

      const scenes = await tx
        .select({ id: schema.chapterImages.id, imagePath: schema.chapterImages.imagePath })
        .from(schema.chapterImages)
        .where(eq(schema.chapterImages.projectId, projectId));
      for (const row of scenes) {
        const next = await resolveNewRef(row.imagePath);
        if (!next) continue;
        await tx.update(schema.chapterImages).set({ imagePath: next }).where(eq(schema.chapterImages.id, row.id));
        stats.rewritten += 1;
      }

      const publications = await tx
        .select({ id: schema.publications.id, coverPath: schema.publications.coverPath })
        .from(schema.publications)
        .where(eq(schema.publications.projectId, projectId));
      for (const row of publications) {
        const next = await resolveNewRef(row.coverPath);
        if (!next) continue;
        await tx.update(schema.publications).set({ coverPath: next }).where(eq(schema.publications.id, row.id));
        stats.rewritten += 1;
      }
    });
    stats.projects += 1;
  }

  logger.info('storage backfill complete', { ...stats });
  await db.$client.close();
} catch (error) {
  logger.error('storage backfill failed', { error });
  if (error instanceof Error && error.cause) logger.error('Cause', { cause: error.cause });
  process.exit(1);
}
