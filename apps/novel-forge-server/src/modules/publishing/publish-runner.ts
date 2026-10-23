import { and, eq, type SQL, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';
import { type Genre, isGenre, isTag, type Tag } from '@shadow-library/sdk';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Publishing, schema } from '@server/database';

import { PublicationAccessService } from './publication-access.service';
import { renderChapterPayload } from './publish-payload';
import { PublishingService, SLUG_ATTEMPT_LIMIT } from './publishing.service';
import {
  type AccessPushBody,
  type AccessState,
  type ChapterPushBody,
  type ManifestItem,
  ReaderPushClient,
  SlugConflictError,
  StaleRevisionError,
  UnknownConflictError,
  type WikiManifest,
  type WikiManifestItem,
} from './reader-push.client';
import { type WikiEntryProjection } from './wiki-projection';
import { WikiPublishingService } from './wiki-publishing.service';

export interface ConvergeOptions {
  /** Reconcile mode: manifest-diff every ledger row (drift healing / rebuild), not just the due ones */
  reconcile?: boolean;
}

interface ConvergeFailure {
  ordinal: number;
  error: string;
}

interface WikiConvergeFailure {
  entryKey: string;
  error: string;
}

interface WikiConvergeResult {
  pushed: string[];
  deleted: string[];
  skipped: string[];
  failed: WikiConvergeFailure[];
  /** Manifest entry keys the ledger knows nothing about — reported, never deleted (one-way convergence) */
  unknownEntries: string[];
}

export interface ConvergeResult {
  novel: 'applied' | 'noop';
  access: 'applied' | 'noop';
  pushed: number[];
  deleted: number[];
  skipped: number[];
  failed: ConvergeFailure[];
  /** Manifest ordinals the ledger knows nothing about — reported, never deleted (one-way convergence) */
  unknownOrdinals: number[];
  /** The wiki convergence outcome — derived projections pushed one-way alongside the chapters */
  wiki: WikiConvergeResult;
}

/** Failed rows carrying this prefix are revision conflicts — retried only by explicit reconcile/republish, never by the sweep */
export const STALE_ERROR_PREFIX = 'stale revision:';

/** The reader rehashed our payload and disagreed: the push itself is malformed, so an identical retry cannot pass */
export const HASH_MISMATCH_ERROR_PREFIX = 'payload hash mismatch:';

/** Every candidate on the ladder is refused by the reader or held by another project — nothing an identical retry can move */
export const SLUG_EXHAUSTED_ERROR_PREFIX = 'slug unassignable:';

/** A 409 the reader attributed to no code — which of its conflicts fired is unknown, so it is handled as the fatal reading */
export const UNKNOWN_CONFLICT_ERROR_PREFIX = 'unattributed conflict:';

/** The canonical chapter moved since this row's contentHash was ledgered — matched by `PublicationJanitor` to know which failures its CRLF repair may clear */
export const CANONICAL_PROSE_CHANGED_PREFIX = 'canonical prose changed';

/** Ledgered failures an identical retry can never clear; the sweep skips them and only an explicit reconcile/republish revisits them */
export const UNSWEEPABLE_ERROR_PREFIXES = [STALE_ERROR_PREFIX, HASH_MISMATCH_ERROR_PREFIX, SLUG_EXHAUSTED_ERROR_PREFIX, UNKNOWN_CONFLICT_ERROR_PREFIX];

/** The terminal outcome of the slug ladder: ledgered under an unsweepable prefix so the janitor stops re-running a converge that cannot converge */
class SlugExhaustedError extends Error {
  constructor(readonly slug: string) {
    super(`${SLUG_EXHAUSTED_ERROR_PREFIX} the reader refuses '${slug}' and no re-assignment is available — republish this project with an explicit novelSlug`);
    this.name = 'SlugExhaustedError';
  }
}

/** The reader has not accepted the current access revision; null until the first access push lands. */
export function accessBehind(): SQL {
  return sql`${schema.publications.accessPushedRevision} is distinct from ${schema.publications.accessRevision}`;
}

function isUnsweepable(error: string | null | undefined): boolean {
  return UNSWEEPABLE_ERROR_PREFIXES.some(prefix => error?.startsWith(prefix) === true);
}

/** A matching hash is not enough on a gate-capable reader: a rollback's old code rewrites entries without touching the gate column, leaving the right hash and a stale gate. */
export function isWikiDrifted(row: Publishing.WikiPublication, served: WikiManifestItem | undefined, projection: WikiEntryProjection | undefined, headlineGate: boolean): boolean {
  if (row.state !== 'pushed') return false;
  if (!served || served.contentHash !== row.contentHash) return true;
  return headlineGate && (served.imageVisibleFromOrdinal ?? undefined) !== projection?.payload.imageVisibleFromOrdinal;
}

/** Convergence engine behind the `publish` job, janitor sweep and reconcile endpoint; reader calls are idempotent, so overlapping runs and replays are safe. */
@Injectable()
export class PublishRunner {
  private readonly logger = Logger.getLogger(APP_NAME, PublishRunner.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly publishingService: PublishingService,
    private readonly pushClient: ReaderPushClient,
    private readonly accessService: PublicationAccessService,
    private readonly wikiService: WikiPublishingService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async converge(projectId: bigint, options: ConvergeOptions = {}): Promise<ConvergeResult> {
    let publication = await this.publishingService.getPublication(projectId);
    const ledger = await this.publishingService.loadLedger(projectId);
    const result: ConvergeResult = {
      novel: 'noop',
      access: 'noop',
      pushed: [],
      deleted: [],
      skipped: [],
      failed: [],
      unknownOrdinals: [],
      wiki: { pushed: [], deleted: [], skipped: [], failed: [], unknownEntries: [] },
    };

    // Missing credentials fail soft: due rows get an actionable ledger error and the caller a PUB_004.
    let manifest: Map<number, ManifestItem>;
    try {
      const header = await this.convergeHeader(publication, options, result);
      publication = header.publication;
      manifest = header.manifest;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.recordFailure(this.dueRows(ledger, options), message);
      await this.recordAccessFailure(publication, message);
      // The header may have laddered before it failed, so the slug the row now holds is not the one it entered with.
      const held = await this.db.query.publications.findFirst({ where: eq(schema.publications.projectId, projectId), columns: { novelSlug: true } });
      const context = { projectId, slug: publication.novelSlug, heldSlug: held?.novelSlug, message };
      if (err instanceof SlugExhaustedError) {
        this.logger.warn('publish converge found no slug the reader accepts', context);
        throw AppErrorCode.PUB_008.create({ base: err.slug });
      }
      if (err instanceof StaleRevisionError || err instanceof UnknownConflictError) {
        this.logger.warn('publish converge refused by the reader as a conflict', context);
        throw AppErrorCode.PUB_011.create({ reason: message });
      }
      this.logger.error('publish converge aborted before chapter pushes', context);
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

    // Wiki converges after the chapters so it reads their fresh `published` ordinals; it never throws — a reader hiccup is ledgered soft and swept.
    await this.convergeWiki(projectId, publication.novelSlug, options, result);
    await this.convergeLateAccess(publication, result);

    this.logger.info('publish converge finished', {
      projectId,
      slug: publication.novelSlug,
      novel: result.novel,
      pushed: result.pushed.length,
      deleted: result.deleted.length,
      skipped: result.skipped.length,
      failed: result.failed.length,
      unknownOrdinals: result.unknownOrdinals,
      wikiPushed: result.wiki.pushed.length,
      wikiDeleted: result.wiki.deleted.length,
      wikiSkipped: result.wiki.skipped.length,
      wikiFailed: result.wiki.failed.length,
      wikiUnknown: result.wiki.unknownEntries,
    });
    return result;
  }

  /** Metadata, access, manifest: must land before any chapter and can reveal a slug conflict; `WBN_010` climbs to the next free slug and replays, renaming via `sourceRef`. */
  private async convergeHeader(
    publication: Publishing.Publication,
    options: ConvergeOptions,
    result: ConvergeResult,
  ): Promise<{ publication: Publishing.Publication; manifest: Map<number, ManifestItem> }> {
    const refused = new Set<string>();
    const entrySlug = publication.novelSlug;
    let current = publication;
    const publishToken = await this.publishingService.ensurePublishToken(publication);

    for (let attempt = 1; attempt <= SLUG_ATTEMPT_LIMIT; attempt++) {
      try {
        /** Decimal `projectId`: never reassigned for the project's life, and 19 digits at most against the reader's `varchar(64)`. */
        const novelResult = await this.pushClient.upsertNovel(current.novelSlug, {
          sourceRef: current.projectId.toString(),
          publishToken,
          title: current.title,
          originalAuthor: current.originalAuthor ?? undefined,
          blurb: current.blurb ?? undefined,
          coverPath: current.coverPath ?? undefined,
          genres: this.vocabulary(current.genres, isGenre, 'genres', current.projectId),
          tags: this.vocabulary(current.tags, isTag, 'tags', current.projectId),
          sexualContent: current.sexualContent ?? undefined,
          violence: current.violence ?? undefined,
          darkContent: current.darkContent ?? undefined,
          status: current.status === 'retired' ? 'retired' : 'live',
          visibility: current.visibility,
          revision: current.revision,
        });
        result.novel = novelResult.outcome;

        // Access first: the metadata push carries the tier, so the novel is created restricted.
        result.access = await this.convergeAccess(current, options);

        const items = await this.pushClient.getManifest(current.novelSlug);
        return { publication: current, manifest: new Map(items.map(item => [item.ordinal, item])) };
      } catch (err) {
        if (!(err instanceof SlugConflictError)) throw err;
        refused.add(current.novelSlug);
        const moved = await this.publishingService.reassignSlug(current, entrySlug, refused);
        if (!moved) return this.abandonSlugLadder(current, entrySlug);
        this.logger.warn('reader refused the publication slug — retrying under a re-assigned one', {
          projectId: current.projectId,
          refused: current.novelSlug,
          slug: moved.novelSlug,
        });
        current = moved;
      }
    }
    return this.abandonSlugLadder(current, entrySlug);
  }

  /** Drops stored terms the sdk vocabulary no longer has: the DTO rejects them on the way in, but the reader 422s the whole push over one. */
  private vocabulary<T extends Genre | Tag>(stored: unknown, isMember: (value: unknown) => value is T, field: string, projectId: bigint): T[] | undefined {
    if (!Array.isArray(stored) || stored.length === 0) return undefined;
    const kept = [...new Set(stored.filter(isMember))];
    if (kept.length !== stored.length) this.logger.warn('publication vocabulary values dropped before the reader push', { projectId, field, stored, kept });
    return kept.length ? kept : undefined;
  }

  private async abandonSlugLadder(current: Publishing.Publication, entrySlug: string): Promise<never> {
    await this.publishingService.restoreSlug(current, entrySlug);
    throw new SlugExhaustedError(entrySlug);
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
      const message = err instanceof Error ? err.message : String(err);
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

  /** Never throws; the projection is fully derived, so there is no prose-drift guard. */
  private async convergeWiki(projectId: bigint, slug: string, options: ConvergeOptions, result: ConvergeResult): Promise<void> {
    // Manifest first: the projection depends on what the reader can gate and a capability change re-hashes entries; with no manifest the ledger is left alone rather than
    // reconciled against a guess.
    let manifest: WikiManifest;
    try {
      manifest = await this.pushClient.getWikiManifest(slug);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const ledger = await this.wikiService.loadLedger(projectId);
      const due = ledger.filter(row => row.state !== 'deleted' && this.isWikiDue(row, options));
      for (const row of due) await this.markWikiFailed(row, message);
      result.wiki.failed.push(...due.map(row => ({ entryKey: row.entryKey, error: message })));
      this.logger.warn('wiki converge could not read the reader manifest', { projectId, slug, message });
      return;
    }

    const projections = await this.wikiService.computeProjections(projectId, manifest.headlineGate);
    const ledger = await this.wikiService.reconcileLedger(projectId, projections);
    const byKey = new Map(projections.map(projection => [projection.entryKey, projection]));
    const served = new Map(manifest.items.map(item => [item.entryKey, item]));

    const ledgerKeys = new Set(ledger.map(row => row.entryKey));
    result.wiki.unknownEntries = [...served.keys()].filter(entryKey => !ledgerKeys.has(entryKey)).sort();

    for (const row of ledger) {
      const item = served.get(row.entryKey);
      if (row.state === 'deleted') {
        if (item) await this.deleteWiki(slug, row, result);
        else result.wiki.skipped.push(row.entryKey);
        continue;
      }

      const due = this.isWikiDue(row, options);
      const projection = byKey.get(row.entryKey);
      if ((due || isWikiDrifted(row, item, projection, manifest.headlineGate)) && projection) await this.pushWiki(slug, row, projection, result);
      else result.wiki.skipped.push(row.entryKey);
    }
  }

  private async pushWiki(slug: string, row: Publishing.WikiPublication, projection: WikiEntryProjection, result: ConvergeResult): Promise<void> {
    try {
      await this.pushClient.upsertWiki(slug, row.entryKey, { ...projection.payload, contentHash: projection.contentHash, revision: row.revision });
      await this.db
        .update(schema.wikiPublications)
        .set({ state: 'pushed', pushedAt: new Date(), error: null, attempts: 0, updatedAt: new Date() })
        .where(eq(schema.wikiPublications.id, row.id));
      result.wiki.pushed.push(row.entryKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.markWikiFailed(row, message);
      result.wiki.failed.push({ entryKey: row.entryKey, error: message });
      this.logger.warn('wiki entry push failed', { slug, entryKey: row.entryKey, message });
    }
  }

  private async deleteWiki(slug: string, row: Publishing.WikiPublication, result: ConvergeResult): Promise<void> {
    try {
      await this.pushClient.deleteWiki(slug, row.entryKey);
      result.wiki.deleted.push(row.entryKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.wiki.failed.push({ entryKey: row.entryKey, error: message });
      this.logger.warn('wiki entry delete push failed', { slug, entryKey: row.entryKey, message });
    }
  }

  /** Due = a fresh/changed projection awaiting a push, or a retryable failure; reconcile widens it to every failure */
  private isWikiDue(row: Publishing.WikiPublication, options: ConvergeOptions): boolean {
    if (row.state === 'pending') return true;
    if (row.state === 'failed') return options.reconcile ? true : !isUnsweepable(row.error);
    return false;
  }

  private async markWikiFailed(row: Publishing.WikiPublication, error: string): Promise<void> {
    await this.db
      .update(schema.wikiPublications)
      .set({ state: 'failed', error: error.slice(0, 2000), attempts: row.attempts + 1, updatedAt: new Date() })
      .where(eq(schema.wikiPublications.id, row.id));
  }

  /** Drifted prose fails the row with a "republish" hint instead of pushing silently. */
  private async renderLedgeredPayload(projectId: bigint, row: Publishing.ChapterPublication): Promise<Omit<ChapterPushBody, 'revision' | 'publishedAt'> | string> {
    const chapter = await this.db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, row.chapter)) });
    if (!chapter || !chapter.content?.trim()) return `canonical chapter ${row.chapter} not found — republish from the current chapter numbering`;
    const payload = renderChapterPayload(chapter);
    if (payload.contentHash !== row.contentHash) return `${CANONICAL_PROSE_CHANGED_PREFIX} since this publish was decided — republish chapter ${row.chapter}`;
    return payload;
  }

  /** Due = awaiting its first/next push: scheduled past its gate, or failed in a way a retry can clear; reconcile widens this to drift checks elsewhere */
  private isDue(row: Publishing.ChapterPublication, options: ConvergeOptions): boolean {
    if (row.status === 'scheduled') return !row.scheduledAt || row.scheduledAt.getTime() <= Date.now();
    if (row.status === 'failed') return options.reconcile ? true : !isUnsweepable(row.error);
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

  /** Pushes the share list when it moved; reconcile reads the reader's copy first and pushes on any disagreement, so a rebuilt reader regains its ACL. */
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
      if (served && !this.accessDrifted(served, body)) {
        await this.recordAccessPushed(publication, body.revision);
        return 'noop';
      }
    }

    const result = await this.pushClient.upsertAccess(publication.novelSlug, body);
    await this.recordAccessPushed(publication, body.revision);
    return result.outcome;
  }

  /** Pushes a share-list change committed after this pass read the publication; a failure is left to the janitor sweep since the chapters already landed. */
  private async convergeLateAccess(publication: Publishing.Publication, result: ConvergeResult): Promise<void> {
    const latest = await this.db.query.publications.findFirst({ where: eq(schema.publications.id, publication.id) });
    if (!latest || latest.accessRevision === publication.accessRevision) return;
    try {
      result.access = await this.convergeAccess(latest, {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.recordAccessFailure(latest, message);
      this.logger.warn('late access push failed — the janitor retries it', { projectId: latest.projectId, slug: latest.novelSlug, revision: latest.accessRevision, message });
    }
  }

  private async recordAccessPushed(publication: Publishing.Publication, revision: number): Promise<void> {
    const accessPushedRevision = sql<number>`greatest(coalesce(${schema.publications.accessPushedRevision}, 0), ${revision})`;
    await this.db.update(schema.publications).set({ accessPushedRevision, accessError: null }).where(eq(schema.publications.id, publication.id));
  }

  /** Only while the reader lacks the current revision: a pass that landed access and failed later leaves nothing to report here. */
  private async recordAccessFailure(publication: Publishing.Publication, error: string): Promise<void> {
    await this.db
      .update(schema.publications)
      .set({ accessError: error.slice(0, 2000) })
      .where(and(eq(schema.publications.id, publication.id), accessBehind()));
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
