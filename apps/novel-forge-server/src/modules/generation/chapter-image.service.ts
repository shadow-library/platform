/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { and, asc, eq, gt, sql } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Generation, type PrimaryDatabase, schema } from '@server/database';

import { IMAGE_STORAGE, type ImageStorageProvider } from '../storage/image-storage.interface';

/**
 * Defining types
 */

type UploadMime = 'image/png' | 'image/jpeg' | 'image/webp';

/**
 * Declaring the constants
 */

@Injectable()
export class ChapterImageService {
  private readonly logger = Logger.getLogger(APP_NAME, ChapterImageService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    @Inject(IMAGE_STORAGE) private readonly imageStorage: ImageStorageProvider,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  list(projectId: bigint, chapter: number): Promise<Generation.ChapterImage[]> {
    return this.db.query.chapterImages.findMany({
      where: and(eq(schema.chapterImages.projectId, projectId), eq(schema.chapterImages.chapter, chapter)),
      orderBy: [asc(schema.chapterImages.sortOrder), asc(schema.chapterImages.id)],
    });
  }

  async add(projectId: bigint, chapter: number, image: string, mime: UploadMime, caption?: string): Promise<Generation.ChapterImage> {
    const existing = await this.list(projectId, chapter);
    const nextOrder = existing.reduce((max, img) => Math.max(max, img.sortOrder + 1), 0);

    // A random suffix keeps every scene image's storage key unique within the chapter.
    const key = `ch${chapter}_s_${randomUUID().slice(0, 8)}`;
    const ref = await this.imageStorage.save(projectId, key, new Uint8Array(Buffer.from(image, 'base64')), mime);

    const [created] = await this.db
      .insert(schema.chapterImages)
      .values({ projectId, chapter, imagePath: ref, caption: caption ?? null, sortOrder: nextOrder })
      .returning();

    if (!created) throw new ServerError(AppErrorCode.DRF_001);
    return created;
  }

  async remove(projectId: bigint, chapter: number, imageId: bigint): Promise<void> {
    const image = await this.db.query.chapterImages.findFirst({
      where: and(eq(schema.chapterImages.id, imageId), eq(schema.chapterImages.projectId, projectId), eq(schema.chapterImages.chapter, chapter)),
    });
    if (!image) throw new ServerError(AppErrorCode.DRF_006);

    await this.imageStorage.delete(image.imagePath);
    await this.db.delete(schema.chapterImages).where(eq(schema.chapterImages.id, imageId));
  }

  /**
   * Keep scene images aligned to the drafter's chapter renumbering: when a chapter is deleted, its own
   * images are dropped and every later chapter's images shift down one to track the draft that moved.
   */
  async onChapterDeleted(projectId: bigint, deletedChapter: number): Promise<void> {
    const removed = await this.list(projectId, deletedChapter);
    await Promise.all(removed.map(img => this.imageStorage.delete(img.imagePath)));
    await this.db.delete(schema.chapterImages).where(and(eq(schema.chapterImages.projectId, projectId), eq(schema.chapterImages.chapter, deletedChapter)));

    await this.db
      .update(schema.chapterImages)
      .set({ chapter: sql`${schema.chapterImages.chapter} - 1` })
      .where(and(eq(schema.chapterImages.projectId, projectId), gt(schema.chapterImages.chapter, deletedChapter)));
  }
}
