import { and, asc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { AppError, Logger } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { type ContentRating, normalizeContentRating } from '@shadow-library/sdk';

import { AppErrorCode } from '@server/classes';
import { assertActiveProject } from '@server/common';
import { APP_NAME, CURATE_PERMISSION } from '@server/constants';
import { type ImportedNovelMetaData, type PrimaryDatabase, type Publishing, schema } from '@server/database';

import { renderChapterPayload } from './publish-payload';
import { type PublishChapterBody, type PublishNovelBody } from './publishing.dto';
import { describeRatingViolations, findRatingViolations } from './rating-invariant';

export interface PublicationsLedger {
  publication: Publishing.Publication | null;
  chapters: Publishing.ChapterPublication[];
}

/** The reader's `novel_slug` column and its `^[a-z0-9]+(?:-[a-z0-9]+)*$` pattern both cap here, so every candidate must fit */
const MAX_SLUG_LENGTH = 128;

/** `base`, `base-2` … `base-5`: enough for the handful of same-title collisions a real catalog produces, few enough that the ladder always terminates */
export const SLUG_ATTEMPT_LIMIT = 5;

function trimSlug(slug: string, limit = MAX_SLUG_LENGTH): string {
  return slug.slice(0, limit).replace(/-+$/, '');
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return trimSlug(slug) || 'novel';
}

/** The `-N` suffix eats into the base rather than overflowing the reader's cap */
function slugCandidate(base: string, attempt: number): string {
  if (attempt === 1) return trimSlug(base);
  const suffix = `-${attempt}`;
  return `${trimSlug(base, MAX_SLUG_LENGTH - suffix.length)}${suffix}`;
}

/** The publication's three rating columns read as one `ContentRating`; a null column is unrated and stays absent. */
function publicationRating(publication: Pick<Publishing.Publication, 'sexualContent' | 'violence' | 'darkContent'>): ContentRating | undefined {
  return normalizeContentRating({
    sexualContent: publication.sexualContent ?? undefined,
    violence: publication.violence ?? undefined,
    darkContent: publication.darkContent ?? undefined,
  });
}

/** The reader's `originalAuthor` carries `minLength: 1`, so a blank one must reach it as a clear rather than as an empty string. */
function trimmedAuthor(body: PublishNovelBody): string | null | undefined {
  if (body.originalAuthor === undefined) return undefined;
  return body.originalAuthor?.trim() || null;
}

@Injectable()
export class PublishingService {
  private readonly logger = Logger.getLogger(APP_NAME, PublishingService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly context: ContextService,
    private readonly authClient: AuthClient,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Creates or updates the novel's publication record — metadata plus go-live (design §4). An
   * omitted `novelSlug` is derived from the title and walked past collisions on a suffix ladder; a
   * supplied one is taken verbatim — the only way out for a publication every candidate slug has
   * been refused for. Supplying a different one later renames the novel: the converge push carries
   * the project's `sourceRef`, so the reader moves the row it already holds — chapters and wiki
   * included — and nothing is left serving at the old URL, which stops resolving. Any reader-facing
   * metadata change bumps the forge-assigned `revision` that drives the reader's optimistic
   * concurrency.
   */
  async publishNovel(projectId: bigint, body: PublishNovelBody): Promise<Publishing.Publication> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    assertActiveProject(project);

    const stored = await this.db.query.publications.findFirst({ where: eq(schema.publications.projectId, projectId) });
    /**
     * The body always wins, including an explicit null; anything else falls back to what the row already
     * holds, or — on the create only — to what the curated ingest claimed. The ingest seeds a publication
     * once and is never re-consulted: a null on an existing row is the curator's decision, and re-adopting
     * over it would make a clear un-saveable and re-trip the attribution gate on an author without `curate`.
     */
    const adopt = <T>(supplied: T | null | undefined, fallback: T | undefined): T | null => (supplied !== undefined ? supplied : (fallback ?? null));

    if (!stored) {
      const imported: ImportedNovelMetaData = project.importedMeta ?? {};
      const title = body.title?.trim() || project.title?.trim() || project.name;
      const values = {
        projectId,
        title,
        originalAuthor: adopt(trimmedAuthor(body), project.originalAuthor?.trim() || undefined),
        blurb: body.blurb ?? null,
        coverPath: body.coverPath ?? null,
        genres: adopt(body.genres, imported.genres),
        tags: adopt(body.tags, imported.tags),
        sexualContent: adopt(body.sexualContent, imported.sexualContent),
        violence: adopt(body.violence, imported.violence),
        darkContent: adopt(body.darkContent, imported.darkContent),
        status: body.status ?? ('live' as const),
      };
      await this.assertAttributionPermitted(projectId, values.originalAuthor, null);
      const publication = body.novelSlug ? await this.insertWithGivenSlug(values, body.novelSlug) : await this.insertWithFreeSlug(values, slugify(title));
      this.logger.info('publication created', { projectId, novelSlug: publication.novelSlug, status: publication.status });
      return publication;
    }

    const next = {
      novelSlug: body.novelSlug ?? stored.novelSlug,
      title: body.title?.trim() || stored.title,
      originalAuthor: adopt(trimmedAuthor(body), stored.originalAuthor ?? undefined),
      blurb: body.blurb !== undefined ? body.blurb : stored.blurb,
      coverPath: body.coverPath !== undefined ? body.coverPath : stored.coverPath,
      genres: adopt(body.genres, stored.genres ?? undefined),
      tags: adopt(body.tags, stored.tags ?? undefined),
      sexualContent: adopt(body.sexualContent, stored.sexualContent ?? undefined),
      violence: adopt(body.violence, stored.violence ?? undefined),
      darkContent: adopt(body.darkContent, stored.darkContent ?? undefined),
      status: body.status ?? ('live' as const),
    };
    const unchanged =
      next.novelSlug === stored.novelSlug &&
      next.title === stored.title &&
      next.originalAuthor === stored.originalAuthor &&
      next.blurb === stored.blurb &&
      next.coverPath === stored.coverPath &&
      next.status === stored.status &&
      next.sexualContent === stored.sexualContent &&
      next.violence === stored.violence &&
      next.darkContent === stored.darkContent &&
      JSON.stringify(next.genres ?? null) === JSON.stringify(stored.genres ?? null) &&
      JSON.stringify(next.tags ?? null) === JSON.stringify(stored.tags ?? null);
    if (unchanged) return stored;
    await this.assertAttributionPermitted(projectId, next.originalAuthor, stored.originalAuthor);
    const ledgered = await this.loadLedger(projectId);
    this.assertRatingCeiling(
      publicationRating(next),
      ledgered.filter(row => row.status !== 'unpublished').map(row => row.contentRating),
    );

    const [updated] = await this.databaseService.run(() =>
      this.db
        .update(schema.publications)
        .set({ ...next, revision: stored.revision + 1, updatedAt: new Date() })
        .where(eq(schema.publications.id, stored.id))
        .returning(),
    );
    if (!updated) throw AppErrorCode.PUB_001.create();
    if (updated.novelSlug !== stored.novelSlug)
      this.logger.warn('publication moved to an explicit novelSlug; the next converge renames the reader novel and the old URL stops resolving', {
        projectId,
        from: stored.novelSlug,
        to: updated.novelSlug,
      });
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
    const publication = await this.getPublication(projectId);

    const chapter = await this.db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapterNumber)) });
    if (!chapter) throw AppErrorCode.CHP_001.create();
    if (!chapter.locked || !chapter.content?.trim()) throw AppErrorCode.PUB_002.create();

    const payload = renderChapterPayload(chapter);
    const ledger = await this.loadLedger(projectId);
    const existing = ledger.filter(row => row.chapter === chapterNumber).at(-1);
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    const published = ledger.filter(row => row.status !== 'unpublished' && row.id !== existing?.id).map(row => row.contentRating);
    this.assertRatingCeiling(publicationRating(publication), [...published, payload.contentRating]);

    if (existing) {
      this.assertNoHolesBelow(ledger, existing.publishedOrdinal);
      const hashChanged = payload.contentHash !== existing.contentHash;
      const [updated] = await this.db
        .update(schema.chapterPublications)
        .set({
          chapter: chapterNumber,
          title: payload.title,
          authorNote: payload.authorNote ?? null,
          contentRating: payload.contentRating ?? null,
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
        contentRating: payload.contentRating ?? null,
        contentHash: payload.contentHash,
        scheduledAt,
        status: 'scheduled',
      })
      .returning();
    if (!inserted) throw AppErrorCode.PUB_001.create();
    this.logger.info('chapter publish scheduled', { projectId, chapter: chapterNumber, ordinal: nextOrdinal, scheduledAt });
    return inserted;
  }

  /**
   * Moves the publication onto the next free slug near `base`, skipping the ones a caller already
   * knows are unusable. Published chapters no longer bar the move: the converge push carries the
   * project's `sourceRef`, so the reader resolves by it and re-slugging renames the row it already
   * holds — chapters, wiki and access included. The one refusal that survives that is an ownership
   * change (a rotated forge `clientId`, or a reader row deleted and re-claimed), where the ref
   * lookup misses too and the ladder builds a second novel; refusing the move would not recover the
   * first one, which is unaddressable either way, only leave the project unable to publish at all.
   * Answers `undefined` whenever no move is available, so the caller decides how to give up.
   */
  async reassignSlug(publication: Publishing.Publication, base: string, unusable: ReadonlySet<string>): Promise<Publishing.Publication | undefined> {
    for (let attempt = 1; attempt <= SLUG_ATTEMPT_LIMIT; attempt++) {
      const novelSlug = slugCandidate(base, attempt);
      if (novelSlug === publication.novelSlug || unusable.has(novelSlug)) continue;
      const updated = await this.databaseService
        .run(() => this.db.update(schema.publications).set({ novelSlug, updatedAt: new Date() }).where(eq(schema.publications.id, publication.id)).returning())
        .catch((err: unknown) => {
          if (AppError.is(err, AppErrorCode.PUB_007)) return [];
          throw err;
        });
      const [row] = updated;
      if (!row) continue;
      this.logger.info('publication slug reassigned', { projectId: publication.projectId, from: publication.novelSlug, to: novelSlug });
      return row;
    }
    return undefined;
  }

  /**
   * Walks the publication back onto the slug a spent ladder started from: every rung committed on
   * its own, so giving up must undo them — only the ladder's success is meaningful, and a row parked
   * on a slug the reader explicitly refused sits further from recovery than where it began.
   */
  async restoreSlug(publication: Publishing.Publication, novelSlug: string): Promise<void> {
    if (publication.novelSlug === novelSlug) return;
    const restored = await this.databaseService
      .run(() => this.db.update(schema.publications).set({ novelSlug, updatedAt: new Date() }).where(eq(schema.publications.id, publication.id)).returning())
      .catch((err: unknown) => {
        if (AppError.is(err, AppErrorCode.PUB_007)) return [];
        throw err;
      });
    const context = { projectId: publication.projectId, from: publication.novelSlug, to: novelSlug };
    if (restored.length) this.logger.info('publication slug restored after a spent ladder', context);
    else this.logger.warn('publication slug could not be restored after a spent ladder', context);
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

  /** An author-chosen slug is taken as given: `PUB_007` names the collision, which serves them better than a `-2` they never asked for */
  private async insertWithGivenSlug(values: Omit<typeof schema.publications.$inferInsert, 'novelSlug'>, novelSlug: string): Promise<Publishing.Publication> {
    const [publication] = await this.databaseService.run(() =>
      this.db
        .insert(schema.publications)
        .values({ ...values, novelSlug })
        .returning(),
    );
    return publication ?? AppErrorCode.PUB_001.throw();
  }

  /** `constraintErrorMap` can only say "this constraint fired", never "stop trying", so the loop bound — not the error — decides when to give up */
  private async insertWithFreeSlug(values: Omit<typeof schema.publications.$inferInsert, 'novelSlug'>, base: string): Promise<Publishing.Publication> {
    for (let attempt = 1; attempt <= SLUG_ATTEMPT_LIMIT; attempt++) {
      const novelSlug = slugCandidate(base, attempt);
      const inserted = await this.databaseService
        .run(() =>
          this.db
            .insert(schema.publications)
            .values({ ...values, novelSlug })
            .returning(),
        )
        .catch((err: unknown) => {
          if (AppError.is(err, AppErrorCode.PUB_007)) return [];
          throw err;
        });
      const [publication] = inserted;
      if (publication) return publication;
    }
    throw AppErrorCode.PUB_008.create({ base });
  }

  /**
   * PUB_010: naming someone outside the platform as the work's author is a curation claim, so it is
   * gated on `novel-forge:curate` wherever the value came from — the body or the project the ingest
   * landed. Only a *move* to a non-null name is gated: clearing needs nothing, and neither does a
   * publish that leaves the stored attribution exactly as it stands, so an ordinary author can still
   * save metadata on a novel a curator attributed.
   */
  private async assertAttributionPermitted(projectId: bigint, next: string | null, held: string | null): Promise<void> {
    if (!next || next === held) return;

    // `getAuthPrincipalOrNull` throws outside a request store, and a background converge or job has none.
    const principal = this.context.isInitialized() ? this.context.getAuthPrincipalOrNull() : null;
    const permitted = principal ? await this.authClient.check({ action: CURATE_PERMISSION, organisationId: principal.org, principal }) : false;
    if (permitted) return;

    this.logger.warn('refused an attribution from a caller without the curate permission', { projectId, sub: principal?.sub, organisationId: principal?.org });
    throw AppErrorCode.PUB_010.create();
  }

  /** PUB_009: the catalog's promise must cover every chapter behind it, so a publish that would break the invariant is refused rather than silently raising the novel */
  private assertRatingCeiling(novel: ContentRating | undefined, chapters: readonly (ContentRating | null | undefined)[]): void {
    const violations = findRatingViolations(novel, chapters);
    if (violations.length) throw AppErrorCode.PUB_009.create({ violations: describeRatingViolations(violations) });
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
