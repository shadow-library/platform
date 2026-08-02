/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { and, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Publishing, schema } from '@server/database';

import { PublicationAccessService } from './publication-access.service';
import { renderChapterPayload } from './publish-payload';
import { PublishingService } from './publishing.service';
import { type AccessPushBody, type AccessState, type ChapterPushBody, type ManifestItem, ReaderPushClient, ReaderPushError, StaleRevisionError } from './reader-push.client';

/**
 * Defining types
 */

export interface ConvergeOptions {
  /** Reconcile mode: manifest-diff every ledger row (drift healing / rebuild), not just the due ones */
  reconcile?: boolean;
}

export interface ConvergeFailure {
  ordinal: number;
  error: string;
}

export interface ConvergeResult {
  novel: 'applied' | 'noop';
  access: 'applied' | 'noop';
  pushed: number[];
  deleted: number[];
  skipped: number[];
  failed: ConvergeFailure[];
  /** Manifest ordinals the ledger knows nothing about — reported, never deleted (one-way convergence, §6) */
  unknownOrdinals: number[];
}

/**
 * Declaring the constants
 */

/** Failed rows carrying this prefix are revision conflicts — retried only by explicit reconcile/republish, never by the sweep */
export const STALE_ERROR_PREFIX = 'stale revision:';

/**
 * The convergence engine behind the `publish` job, the janitor sweep, and the reconcile endpoint
 * (reader-publish design §5–6). One pass: push the novel metadata, fetch the reader manifest, then
 * walk the ledger — PUT every due or drifted chapter, DELETE every ledgered-unpublished ordinal the
 * reader still serves, and record per-row failures on the ledger (the row IS the outbox). Every
 * reader call is idempotent, so overlapping runs and replays are always safe (hard rule 5).
 */
@Injectable()
export class PublishRunner {
  private readonly logger = Logger.getLogger(APP_NAME, PublishRunner.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly publishingService: PublishingService,
    private readonly pushClient: ReaderPushClient,
    private readonly accessService: PublicationAccessService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async converge(projectId: bigint, options: ConvergeOptions = {}): Promise<ConvergeResult> {
    const publication = await this.publishingService.getPublication(projectId);
    const ledger = await this.publishingService.loadLedger(projectId);
    const result: ConvergeResult = { novel: 'noop', access: 'noop', pushed: [], deleted: [], skipped: [], failed: [], unknownOrdinals: [] };

    // Missing credentials fail soft: every due row gets an actionable ledger error and the caller a
    // clear PUB_004, while boot and every non-publishing feature stay untouched.
    let manifest: Map<number, ManifestItem>;
    try {
      const novelResult = await this.pushClient.upsertNovel(publication.novelSlug, {
        title: publication.title,
        blurb: publication.blurb ?? undefined,
        coverPath: publication.coverPath ?? undefined,
        genres: (publication.genres as string[] | null) ?? undefined,
        status: publication.status === 'retired' ? 'retired' : 'live',
        visibility: publication.visibility,
        revision: publication.revision,
      });
      result.novel = novelResult.outcome;

      /**
       * Access goes second, and always before any chapter. The metadata push carries the tier, so a
       * novel is created already restricted; the window between the two pushes is one in which
       * nobody can read it. The reverse order would open a window in which everybody could.
       */
      result.access = await this.convergeAccess(publication, options);

      const items = await this.pushClient.getManifest(publication.novelSlug);
      manifest = new Map(items.map(item => [item.ordinal, item]));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.recordFailure(this.dueRows(ledger, options), message);
      this.logger.error('publish converge aborted before chapter pushes', { projectId, slug: publication.novelSlug, message });
      throw AppErrorCode.PUB_004.create({ reason: message });
    }

    const ledgerOrdinals = new Set(ledger.map(row => row.publishedOrdinal));
    result.unknownOrdinals = [...manifest.keys()].filter(ordinal => !ledgerOrdinals.has(ordinal)).sort((a, b) => a - b);

    for (const row of ledger) {
      const served = manifest.get(row.publishedOrdinal);
      if (row.status === 'unpublished') {
        if (served) await this.deleteChapter(publication.novelSlug, row, result);
        else result.skipped.push(row.publishedOrdinal);
        continue;
      }

      const due = this.isDue(row, options);
      const drifted = row.status === 'published' && (!served || served.contentHash !== row.contentHash);
      if (due || drifted) await this.pushChapter(projectId, publication.novelSlug, row, result);
      else result.skipped.push(row.publishedOrdinal);
    }

    this.logger.info('publish converge finished', {
      projectId,
      slug: publication.novelSlug,
      novel: result.novel,
      pushed: result.pushed.length,
      deleted: result.deleted.length,
      skipped: result.skipped.length,
      failed: result.failed.length,
      unknownOrdinals: result.unknownOrdinals,
    });
    return result;
  }

  private async pushChapter(projectId: bigint, slug: string, row: Publishing.ChapterPublication, result: ConvergeResult): Promise<void> {
    const payload = await this.renderLedgeredPayload(projectId, row);
    if (typeof payload === 'string') {
      await this.markFailed(row, payload);
      result.failed.push({ ordinal: row.publishedOrdinal, error: payload });
      return;
    }

    try {
      const publishedAt = row.publishedAt ?? new Date();
      const body: ChapterPushBody = { ...payload, revision: row.revision, publishedAt: publishedAt.toISOString() };
      await this.pushClient.upsertChapter(slug, row.publishedOrdinal, body);
      await this.db
        .update(schema.chapterPublications)
        .set({ status: 'published', publishedAt, error: null, updatedAt: new Date() })
        .where(eq(schema.chapterPublications.id, row.id));
      result.pushed.push(row.publishedOrdinal);
    } catch (err) {
      const message = err instanceof StaleRevisionError || err instanceof ReaderPushError ? err.message : String(err instanceof Error ? err.message : err);
      await this.markFailed(row, message);
      result.failed.push({ ordinal: row.publishedOrdinal, error: message });
      this.logger.warn('chapter push failed', { projectId, ordinal: row.publishedOrdinal, message });
    }
  }

  private async deleteChapter(slug: string, row: Publishing.ChapterPublication, result: ConvergeResult): Promise<void> {
    try {
      await this.pushClient.deleteChapter(slug, row.publishedOrdinal);
      result.deleted.push(row.publishedOrdinal);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed.push({ ordinal: row.publishedOrdinal, error: message });
      this.logger.warn('chapter unpublish push failed', { slug, ordinal: row.publishedOrdinal, message });
    }
  }

  /**
   * Re-renders the payload from the canonical chapter and insists it still matches the ledgered
   * hash: publication is an editorial decision, so silently pushing prose that drifted after the
   * decision would bypass the author (design §4) — the row fails with a "republish" hint instead.
   */
  private async renderLedgeredPayload(projectId: bigint, row: Publishing.ChapterPublication): Promise<Omit<ChapterPushBody, 'revision' | 'publishedAt'> | string> {
    const chapter = await this.db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, row.chapter)) });
    if (!chapter || !chapter.content?.trim()) return `canonical chapter ${row.chapter} not found — republish from the current chapter numbering`;
    const payload = renderChapterPayload(chapter);
    if (payload.contentHash !== row.contentHash) return `canonical prose changed since this publish was decided — republish chapter ${row.chapter}`;
    return payload;
  }

  /** Due = awaiting its first/next push: scheduled past its gate or failed; reconcile widens this to drift checks elsewhere */
  private isDue(row: Publishing.ChapterPublication, options: ConvergeOptions): boolean {
    if (row.status === 'scheduled') return !row.scheduledAt || row.scheduledAt.getTime() <= Date.now();
    if (row.status === 'failed') return options.reconcile ? true : !row.error?.startsWith(STALE_ERROR_PREFIX);
    return false;
  }

  private dueRows(ledger: Publishing.ChapterPublication[], options: ConvergeOptions): Publishing.ChapterPublication[] {
    return ledger.filter(row => row.status !== 'unpublished' && this.isDue(row, options));
  }

  private async markFailed(row: Publishing.ChapterPublication, error: string): Promise<void> {
    await this.db
      .update(schema.chapterPublications)
      .set({ status: 'failed', error: error.slice(0, 2000), updatedAt: new Date() })
      .where(eq(schema.chapterPublications.id, row.id));
  }

  /**
   * Pushes the share list when it has moved. Reconcile mode reads the reader's copy first and
   * pushes whenever the two disagree — the access counterpart of the chapter manifest diff, so a
   * reader rebuilt from empty regains its ACL rather than serving a novel with no grants at all.
   */
  private async convergeAccess(publication: Publishing.Publication, options: ConvergeOptions): Promise<'applied' | 'noop'> {
    const subjectIds = await this.accessService.getPushPayload(publication.id);
    const body = {
      visibility: publication.visibility,
      organisationId: publication.organisationId ?? undefined,
      subjectIds,
      revision: publication.accessRevision,
    };

    if (options.reconcile) {
      const served = await this.pushClient.getAccess(publication.novelSlug);
      if (served && !this.accessDrifted(served, body)) return 'noop';
    }

    const result = await this.pushClient.upsertAccess(publication.novelSlug, body);
    return result.outcome;
  }

  private accessDrifted(served: AccessState, wanted: AccessPushBody): boolean {
    if (served.visibility !== wanted.visibility) return true;
    if ((served.organisationId ?? undefined) !== wanted.organisationId) return true;
    if (served.revision !== wanted.revision) return true;
    const held = new Set(served.subjectIds);
    return held.size !== (wanted.subjectIds?.length ?? 0) || !(wanted.subjectIds ?? []).every(subjectId => held.has(subjectId));
  }

  private async recordFailure(rows: Publishing.ChapterPublication[], error: string): Promise<void> {
    for (const row of rows) await this.markFailed(row, error);
  }
}
