/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService, StorageService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Generation, type PrimaryDatabase, schema } from '@server/database';

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
    private readonly storage: StorageService,
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

    const bytes = Buffer.from(image, 'base64');
    this.logger.debug('chapter image add: saving', { projectId, chapter, mime, bytes: bytes.length, sortOrder: nextOrder });
    const ref = await this.storage.save(new Uint8Array(bytes), { contentType: mime });

    const [created] = await this.db
      .insert(schema.chapterImages)
      .values({ projectId, chapter, imagePath: ref, caption: caption ?? null, sortOrder: nextOrder })
      .returning();

    if (!created) throw AppErrorCode.DRF_001.create();
    this.logger.info('chapter image added', { projectId, chapter, imageId: created.id, ref });
    return created;
  }

  async remove(projectId: bigint, chapter: number, imageId: bigint): Promise<void> {
    const image = await this.db.query.chapterImages.findFirst({
      where: and(eq(schema.chapterImages.id, imageId), eq(schema.chapterImages.projectId, projectId), eq(schema.chapterImages.chapter, chapter)),
    });
    if (!image) throw AppErrorCode.DRF_006.create();

    // The content-addressed object is retained (it may back another row); only the chapter-image row is removed.
    this.logger.info('chapter image removed', { projectId, chapter, imageId, ref: image.imagePath });
    await this.db.delete(schema.chapterImages).where(eq(schema.chapterImages.id, imageId));
  }

  /**
   * Keep scene images aligned to the drafter's chapter renumbering: when a chapter is deleted, its own
   * images are dropped and every later chapter's images shift down one to track the draft that moved.
   */
  async onChapterDeleted(projectId: bigint, deletedChapter: number): Promise<void> {
    const removed = await this.list(projectId, deletedChapter);
    this.logger.debug('onChapterDeleted: purging scene image rows and shifting later chapters down', { projectId, deletedChapter, removed: removed.length });
    await this.db.delete(schema.chapterImages).where(and(eq(schema.chapterImages.projectId, projectId), eq(schema.chapterImages.chapter, deletedChapter)));

    await this.db
      .update(schema.chapterImages)
      .set({ chapter: sql`${schema.chapterImages.chapter} - 1` })
      .where(and(eq(schema.chapterImages.projectId, projectId), gt(schema.chapterImages.chapter, deletedChapter)));
  }
}
