import { and, asc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService, StorageService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Generation, type PrimaryDatabase, schema } from '@server/database';

type UploadMime = 'image/png' | 'image/jpeg' | 'image/webp';

// A scene image as surfaced to the API: the stored `imagePath` ref gains its resolved public URL, built
// from the server's runtime `storage.public-origin` so the origin is never baked into the client bundle.
// The ref stays on the type for internal callers; only `imageUrl` is declared on the response DTO.
export type PresentedChapterImage = Generation.ChapterImage & { imageUrl: string };

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

  private present(image: Generation.ChapterImage): PresentedChapterImage {
    return { ...image, imageUrl: this.storage.getPublicUrl(image.imagePath) };
  }

  async list(projectId: bigint, chapter: number): Promise<PresentedChapterImage[]> {
    const images = await this.db.query.chapterImages.findMany({
      where: and(eq(schema.chapterImages.projectId, projectId), eq(schema.chapterImages.chapter, chapter)),
      orderBy: [asc(schema.chapterImages.sortOrder), asc(schema.chapterImages.id)],
    });
    return images.map(image => this.present(image));
  }

  async add(projectId: bigint, chapter: number, image: string, mime: UploadMime, caption?: string): Promise<PresentedChapterImage> {
    const bytes = Buffer.from(image, 'base64');
    this.logger.debug('chapter image add: saving', { projectId, chapter, mime, bytes: bytes.length });
    const ref = await this.storage.save(new Uint8Array(bytes), { contentType: mime });
    return this.addRef(projectId, chapter, ref, caption);
  }

  /** Appends a scene-image row for an object already in storage — the path the illustration subsystem takes. */
  async addRef(projectId: bigint, chapter: number, ref: string, caption?: string): Promise<PresentedChapterImage> {
    const existing = await this.list(projectId, chapter);
    const nextOrder = existing.reduce((max, img) => Math.max(max, img.sortOrder + 1), 0);

    const [created] = await this.db
      .insert(schema.chapterImages)
      .values({ projectId, chapter, imagePath: ref, caption: caption ?? null, sortOrder: nextOrder })
      .returning();

    if (!created) throw AppErrorCode.DRF_001.create();
    this.logger.info('chapter image added', { projectId, chapter, imageId: created.id, ref });
    return this.present(created);
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
   * Deleting a draft leaves a hole rather than renumbering the chapters after it, so only the deleted
   * chapter's own image rows are purged — later chapters' images stay with their unmoved drafts.
   */
  async onChapterDeleted(projectId: bigint, deletedChapter: number): Promise<void> {
    const removed = await this.list(projectId, deletedChapter);
    this.logger.debug('onChapterDeleted: purging scene image rows', { projectId, deletedChapter, removed: removed.length });
    await this.db.delete(schema.chapterImages).where(and(eq(schema.chapterImages.projectId, projectId), eq(schema.chapterImages.chapter, deletedChapter)));
  }
}
