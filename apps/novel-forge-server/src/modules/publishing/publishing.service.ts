import { and, asc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { assertActiveProject } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Publishing, schema } from '@server/database';

import { renderChapterPayload } from './publish-payload';
import { type PublishChapterBody, type PublishNovelBody } from './publishing.dto';

export interface PublicationsLedger {
  publication: Publishing.Publication | null;
  chapters: Publishing.ChapterPublication[];
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'novel'
  );
}

@Injectable()
export class PublishingService {
  private readonly logger = Logger.getLogger(APP_NAME, PublishingService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Creates or updates the novel's publication record — metadata plus go-live (design §4). The slug
   * is set once (given or derived from the title) and never changes; any reader-facing metadata
   * change bumps the forge-assigned `revision` that drives the reader's optimistic concurrency.
   */
  async publishNovel(projectId: bigint, body: PublishNovelBody): Promise<Publishing.Publication> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    assertActiveProject(project);

    const stored = await this.db.query.publications.findFirst({ where: eq(schema.publications.projectId, projectId) });
    if (!stored) {
      const title = body.title?.trim() || project.title?.trim() || project.name;
      const novelSlug = body.novelSlug ?? slugify(title);
      const values = {
        projectId,
        novelSlug,
        title,
        blurb: body.blurb ?? null,
        coverPath: body.coverPath ?? null,
        genres: body.genres ?? null,
        status: body.status ?? ('live' as const),
      };
      const [publication] = await this.db.insert(schema.publications).values(values).returning();
      if (!publication) throw AppErrorCode.PUB_001.create();
      this.logger.info('publication created', { projectId, novelSlug, status: publication.status });
      return publication;
    }

    const next = {
      title: body.title?.trim() || stored.title,
      blurb: body.blurb !== undefined ? body.blurb : stored.blurb,
      coverPath: body.coverPath !== undefined ? body.coverPath : stored.coverPath,
      genres: body.genres !== undefined ? body.genres : stored.genres,
      status: body.status ?? ('live' as const),
    };
    const unchanged =
      next.title === stored.title &&
      next.blurb === stored.blurb &&
      next.coverPath === stored.coverPath &&
      next.status === stored.status &&
      JSON.stringify(next.genres ?? null) === JSON.stringify(stored.genres ?? null);
    if (unchanged) return stored;

    const [updated] = await this.db
      .update(schema.publications)
      .set({ ...next, revision: stored.revision + 1, updatedAt: new Date() })
      .where(eq(schema.publications.id, stored.id))
      .returning();
    if (!updated) throw AppErrorCode.PUB_001.create();
    this.logger.info('publication metadata updated', { projectId, novelSlug: updated.novelSlug, revision: updated.revision, status: updated.status });
    return updated;
  }

  /**
   * Publishes (or schedules, or republishes) a chapter. Gates: the canonical chapter must be
   * finalized (`PUB_002`) and the release sequence contiguous (`PUB_003`). A first publish assigns
   * the next `publishedOrdinal` — once, never re-derived (hard rule 6); a republish reuses the row,
   * bumping `revision` only when the rendered payload's hash actually changed.
   */
  async publishChapter(projectId: bigint, chapterNumber: number, body: PublishChapterBody): Promise<Publishing.ChapterPublication> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { status: true } });
    if (!project) throw AppErrorCode.PRJ_001.create();
    assertActiveProject(project);
    await this.getPublication(projectId);

    const chapter = await this.db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapterNumber)) });
    if (!chapter) throw AppErrorCode.CHP_001.create();
    if (!chapter.locked || !chapter.content?.trim()) throw AppErrorCode.PUB_002.create();

    const payload = renderChapterPayload(chapter);
    const ledger = await this.loadLedger(projectId);
    const existing = ledger.filter(row => row.chapter === chapterNumber).at(-1);
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;

    if (existing) {
      this.assertNoHolesBelow(ledger, existing.publishedOrdinal);
      const hashChanged = payload.contentHash !== existing.contentHash;
      const [updated] = await this.db
        .update(schema.chapterPublications)
        .set({
          chapter: chapterNumber,
          title: payload.title,
          authorNote: payload.authorNote ?? null,
          contentHash: payload.contentHash,
          revision: hashChanged ? existing.revision + 1 : existing.revision,
          scheduledAt,
          status: 'scheduled',
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.chapterPublications.id, existing.id))
        .returning();
      if (!updated) throw AppErrorCode.PUB_001.create();
      this.logger.info('chapter republish scheduled', { projectId, chapter: chapterNumber, ordinal: updated.publishedOrdinal, revision: updated.revision, hashChanged });
      return updated;
    }

    await this.assertEarlierChaptersLedgered(projectId, chapterNumber, ledger);
    const nextOrdinal = Math.max(0, ...ledger.map(row => row.publishedOrdinal)) + 1;
    this.assertNoHolesBelow(ledger, nextOrdinal);

    const [inserted] = await this.db
      .insert(schema.chapterPublications)
      .values({
        projectId,
        chapter: chapterNumber,
        publishedOrdinal: nextOrdinal,
        title: payload.title,
        authorNote: payload.authorNote ?? null,
        contentHash: payload.contentHash,
        scheduledAt,
        status: 'scheduled',
      })
      .returning();
    if (!inserted) throw AppErrorCode.PUB_001.create();
    this.logger.info('chapter publish scheduled', { projectId, chapter: chapterNumber, ordinal: nextOrdinal, scheduledAt });
    return inserted;
  }

  /** Marks the ledger row unpublished — the ordinal is kept forever so a later republish reuses it (design §4). Idempotent. */
  async unpublishChapter(projectId: bigint, chapterNumber: number): Promise<Publishing.ChapterPublication> {
    await this.getPublication(projectId);
    const ledger = await this.loadLedger(projectId);
    const existing = ledger.filter(row => row.chapter === chapterNumber).at(-1);
    if (!existing) throw AppErrorCode.PUB_001.create();
    if (existing.status === 'unpublished') return existing;

    const [updated] = await this.db
      .update(schema.chapterPublications)
      .set({ status: 'unpublished', error: null, updatedAt: new Date() })
      .where(eq(schema.chapterPublications.id, existing.id))
      .returning();
    if (!updated) throw AppErrorCode.PUB_001.create();
    this.logger.info('chapter unpublished in ledger', { projectId, chapter: chapterNumber, ordinal: updated.publishedOrdinal });
    return updated;
  }

  async listPublications(projectId: bigint): Promise<PublicationsLedger> {
    const publication = await this.db.query.publications.findFirst({ where: eq(schema.publications.projectId, projectId) });
    const chapters = await this.loadLedger(projectId);
    return { publication: publication ?? null, chapters };
  }

  async getPublication(projectId: bigint): Promise<Publishing.Publication> {
    const publication = await this.db.query.publications.findFirst({ where: eq(schema.publications.projectId, projectId) });
    return publication ?? AppErrorCode.PUB_001.throw();
  }

  loadLedger(projectId: bigint): Promise<Publishing.ChapterPublication[]> {
    return this.db.query.chapterPublications.findMany({ where: eq(schema.chapterPublications.projectId, projectId), orderBy: asc(schema.chapterPublications.publishedOrdinal) });
  }

  /** PUB_003 half 1: nothing may go (back) live above an unpublished hole — readers would see chapter 7 with 6 missing */
  private assertNoHolesBelow(ledger: Publishing.ChapterPublication[], ordinal: number): void {
    const hole = ledger.some(row => row.publishedOrdinal < ordinal && row.status === 'unpublished');
    if (hole) throw AppErrorCode.PUB_003.create();
  }

  /** PUB_003 half 2: a first publish requires every earlier finalized chapter to already be in the ledger — releases follow story order */
  private async assertEarlierChaptersLedgered(projectId: bigint, chapterNumber: number, ledger: Publishing.ChapterPublication[]): Promise<void> {
    const earlier = await this.db
      .select({ number: schema.chapters.number })
      .from(schema.chapters)
      .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.locked, true)));
    const ledgered = new Set(ledger.filter(row => row.status !== 'unpublished').map(row => row.chapter));
    const missing = earlier.some(row => row.number < chapterNumber && !ledgered.has(row.number));
    if (missing) throw AppErrorCode.PUB_003.create();
  }
}
