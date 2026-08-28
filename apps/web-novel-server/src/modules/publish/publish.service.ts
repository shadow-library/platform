import { and, asc, eq, type SQL } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { chapterContentHash } from '@shadow-library/sdk/publishing';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Novel, type PrimaryDatabase, schema } from '@server/modules/datastore';

import { PublishAuditService } from './publish-audit.service';
import { assertNovelOwnership, loadOwnedNovel, loadReadableNovel, publishCaller, type PublishCaller } from './publish-ownership';
import { type ChapterUpsertBody, type ManifestItem, type NovelAccessBody, type NovelAccessResponse, type NovelUpsertBody } from './publish.dto';
import { type PublishAuditEntry } from './publish.types';

export interface UpsertResult {
  outcome: 'applied' | 'noop';
  revision: number;
}

export interface UnpublishResult {
  outcome: 'applied' | 'noop';
}

type PublishTransaction = Parameters<Parameters<PrimaryDatabase['transaction']>[0]>[0];

interface StaleMarker {
  outcome: 'stale';
  stored: number;
}

/**
 * Raised out of the novel insert to roll its transaction back; only a re-read of the committed row can say
 * whose the slug is. A second race within one call escapes as a 500 the publisher retries, never as an
 * ownership verdict — being wrong about ownership is what sends a publisher off to re-slug.
 */
class NovelInsertRace extends Error {
  constructor() {
    super('novel insert lost a slug race; the committed row must be re-read');
  }
}

/**
 * Optimistic-concurrency rules (same for novels and chapters): an incoming revision behind the
 * stored one is a 409 stale rejection; an equal revision carrying identical content is a no-op;
 * anything else replaces the row and stores the incoming revision. Every branch — including the
 * rejection — commits exactly one audit row atomically with its decision.
 */

@Injectable()
export class PublishService {
  private readonly logger = Logger.getLogger(APP_NAME, PublishService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: PublishAuditService,
    private readonly context: ContextService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /**
   * A first push locks nothing — the row does not exist yet — so two converge passes of the same
   * publisher can both reach the insert, and the index rejects the loser. That is a self-race, not
   * foreign ownership: the loser re-runs against the now-committed row, where the ownership check
   * converges our own row and still refuses another publisher's with `WBN_010`.
   */
  async upsertNovel(slug: string, body: NovelUpsertBody): Promise<UpsertResult> {
    const caller = this.caller();
    const result = await this.runNovelUpsert(slug, body, caller).catch((err: unknown) => {
      if (err instanceof NovelInsertRace) return this.runNovelUpsert(slug, body, caller);
      throw err;
    });

    this.auditService.markRecorded();
    if (result.outcome === 'stale') throw AppErrorCode.WBN_003.create({ incoming: body.revision, stored: result.stored });
    this.logger.info('novel metadata push handled', { slug, outcome: result.outcome, revision: body.revision });
    return result;
  }

  private runNovelUpsert(slug: string, body: NovelUpsertBody, caller: PublishCaller): Promise<UpsertResult | StaleMarker> {
    return this.db.transaction(async tx => {
      const [stored] = await tx.select().from(schema.novels).where(eq(schema.novels.slug, slug)).for('update');
      const base: Omit<PublishAuditEntry, 'outcome'> = { action: 'novel.upsert', novelSlug: slug, incomingRevision: body.revision, storedRevision: stored?.revision, ...caller };
      /** Ahead of the revision ladder: WBN_003 quotes the stored revision, which a foreign caller has no business learning. */
      if (stored) assertNovelOwnership(stored, caller);

      if (stored && body.revision < stored.revision) {
        await this.auditService.record({ ...base, outcome: 'stale_rejected' }, tx);
        return { outcome: 'stale', stored: stored.revision } satisfies StaleMarker;
      }
      if (stored && body.revision === stored.revision && this.isNovelUnchanged(stored, body)) {
        await this.auditService.record({ ...base, outcome: 'noop' }, tx);
        return { outcome: 'noop', revision: stored.revision } satisfies UpsertResult;
      }

      const values = {
        title: body.title,
        blurb: body.blurb ?? null,
        coverPath: body.coverPath ?? null,
        genres: body.genres ?? [],
        status: body.status ?? ('live' as const),
        visibility: body.visibility,
        revision: body.revision,
        updatedAt: new Date(),
      };
      if (stored) await tx.update(schema.novels).set(values).where(eq(schema.novels.id, stored.id));
      else await this.insertNovel(tx, { slug, sourceClientId: caller.callerClientId, ...values });
      await this.auditService.record({ ...base, outcome: 'applied' }, tx);
      return { outcome: 'applied', revision: body.revision } satisfies UpsertResult;
    });
  }

  async upsertChapter(slug: string, ordinal: number, body: ChapterUpsertBody): Promise<UpsertResult> {
    const caller = this.caller();
    const novel = await loadOwnedNovel(this.db, slug, caller);
    const expectedHash = chapterContentHash({ title: body.title, content: body.content, authorNote: body.authorNote });
    if (expectedHash !== body.contentHash) throw AppErrorCode.WBN_011.create();
    const result = await this.db.transaction(async tx => {
      const [stored] = await tx.select().from(schema.publishedChapters).where(this.chapterFilter(novel.id, ordinal)).for('update');
      const base: Omit<PublishAuditEntry, 'outcome'> = {
        action: 'chapter.upsert',
        novelSlug: slug,
        ordinal,
        contentHash: body.contentHash,
        incomingRevision: body.revision,
        storedRevision: stored?.revision,
        ...caller,
      };

      if (stored && body.revision < stored.revision) {
        await this.auditService.record({ ...base, outcome: 'stale_rejected' }, tx);
        return { outcome: 'stale', stored: stored.revision } satisfies StaleMarker;
      }
      if (stored && body.revision === stored.revision && body.contentHash === stored.contentHash) {
        await this.auditService.record({ ...base, outcome: 'noop' }, tx);
        return { outcome: 'noop', revision: stored.revision } satisfies UpsertResult;
      }

      const values = {
        title: body.title,
        content: body.content,
        authorNote: body.authorNote ?? null,
        contentHash: body.contentHash,
        revision: body.revision,
        wordCount: body.wordCount ?? this.countWords(body.content),
        publishedAt: body.publishedAt ? new Date(body.publishedAt) : (stored?.publishedAt ?? new Date()),
        updatedAt: new Date(),
      };
      if (stored) await tx.update(schema.publishedChapters).set(values).where(eq(schema.publishedChapters.id, stored.id));
      else await tx.insert(schema.publishedChapters).values({ novelId: novel.id, ordinal, ...values });
      await this.auditService.record({ ...base, outcome: 'applied' }, tx);
      return { outcome: 'applied', revision: body.revision } satisfies UpsertResult;
    });

    this.auditService.markRecorded();
    if (result.outcome === 'stale') throw AppErrorCode.WBN_003.create({ incoming: body.revision, stored: result.stored });
    this.logger.info('chapter push handled', { slug, ordinal, outcome: result.outcome, revision: body.revision });
    return result;
  }

  async unpublishChapter(slug: string, ordinal: number): Promise<UnpublishResult> {
    const caller = this.caller();
    const base: Omit<PublishAuditEntry, 'outcome'> = { action: 'chapter.unpublish', novelSlug: slug, ordinal, ...caller };

    const [novel] = await this.db.select().from(schema.novels).where(eq(schema.novels.slug, slug));
    if (!novel) {
      await this.auditService.record({ ...base, outcome: 'noop' });
      this.auditService.markRecorded();
      return { outcome: 'noop' };
    }
    assertNovelOwnership(novel, caller);

    const result = await this.db.transaction(async tx => {
      const deleted = await tx.delete(schema.publishedChapters).where(this.chapterFilter(novel.id, ordinal)).returning();
      const removed = deleted[0];
      const outcome = removed ? 'applied' : 'noop';
      await this.auditService.record({ ...base, outcome, contentHash: removed?.contentHash, storedRevision: removed?.revision }, tx);
      return { outcome } satisfies UnpublishResult;
    });

    this.auditService.markRecorded();
    this.logger.info('chapter unpublish handled', { slug, ordinal, outcome: result.outcome });
    return result;
  }

  /**
   * Replaces a novel's whole access record — tier, organisation and grant set — under the same
   * revision ladder the metadata push uses, against `accessRevision` rather than `revision`.
   *
   * The replacement is wholesale and transactional: a partial apply would leave a novel restricted
   * to a stale set, which is either a leak or a lockout depending on which half landed. Grants are
   * deleted and re-inserted rather than diffed because the set is small and a diff has more ways to
   * be subtly wrong than the whole-set write it would replace.
   */
  async upsertAccess(slug: string, body: NovelAccessBody): Promise<UpsertResult> {
    const caller = this.caller();
    if (body.visibility === 'ORGANISATION' && !body.organisationId) throw AppErrorCode.WBN_007.create();
    if (body.visibility !== 'ORGANISATION' && body.organisationId) throw AppErrorCode.WBN_008.create();

    const subjectIds = [...new Set(body.subjectIds ?? [])];
    const result = await this.db.transaction(async tx => {
      const [stored] = await tx.select().from(schema.novels).where(eq(schema.novels.slug, slug)).for('update');
      if (!stored) throw AppErrorCode.WBN_001.create();
      assertNovelOwnership(stored, caller);
      const base: Omit<PublishAuditEntry, 'outcome'> = {
        action: 'novel.access',
        novelSlug: slug,
        incomingRevision: body.revision,
        storedRevision: stored.accessRevision,
        ...caller,
      };

      if (body.revision < stored.accessRevision) {
        await this.auditService.record({ ...base, outcome: 'stale_rejected' }, tx);
        return { outcome: 'stale', stored: stored.accessRevision } satisfies StaleMarker;
      }

      const current = await tx.select({ subjectId: schema.novelGrants.subjectId }).from(schema.novelGrants).where(eq(schema.novelGrants.novelId, stored.id));
      if (body.revision === stored.accessRevision && this.isAccessUnchanged(stored, body, subjectIds, current)) {
        await this.auditService.record({ ...base, outcome: 'noop' }, tx);
        return { outcome: 'noop', revision: stored.accessRevision } satisfies UpsertResult;
      }

      await tx
        .update(schema.novels)
        .set({ visibility: body.visibility, organisationId: body.organisationId ?? null, accessRevision: body.revision, updatedAt: new Date() })
        .where(eq(schema.novels.id, stored.id));
      await tx.delete(schema.novelGrants).where(eq(schema.novelGrants.novelId, stored.id));
      if (subjectIds.length > 0) await tx.insert(schema.novelGrants).values(subjectIds.map(subjectId => ({ novelId: stored.id, subjectId })));
      await this.auditService.record({ ...base, outcome: 'applied' }, tx);
      return { outcome: 'applied', revision: body.revision } satisfies UpsertResult;
    });

    this.auditService.markRecorded();
    if (result.outcome === 'stale') throw AppErrorCode.WBN_003.create({ incoming: body.revision, stored: result.stored });
    this.logger.info('novel access push handled', { slug, outcome: result.outcome, visibility: body.visibility, grants: subjectIds.length, revision: body.revision });
    return result;
  }

  async getAccess(slug: string): Promise<NovelAccessResponse> {
    const novel = await loadReadableNovel(this.db, slug, this.caller());
    const grants = await this.db
      .select({ subjectId: schema.novelGrants.subjectId })
      .from(schema.novelGrants)
      .where(eq(schema.novelGrants.novelId, novel.id))
      .orderBy(asc(schema.novelGrants.subjectId));
    return {
      visibility: novel.visibility,
      organisationId: novel.organisationId ?? undefined,
      subjectIds: grants.map(grant => grant.subjectId),
      revision: novel.accessRevision,
    };
  }

  async getManifest(slug: string): Promise<ManifestItem[]> {
    const novel = await loadReadableNovel(this.db, slug, this.caller());
    const chapters = await this.db
      .select({ ordinal: schema.publishedChapters.ordinal, contentHash: schema.publishedChapters.contentHash, revision: schema.publishedChapters.revision })
      .from(schema.publishedChapters)
      .where(eq(schema.publishedChapters.novelId, novel.id))
      .orderBy(asc(schema.publishedChapters.ordinal));
    return chapters;
  }

  private async insertNovel(tx: PublishTransaction, values: typeof schema.novels.$inferInsert): Promise<void> {
    await this.databaseService
      .run(async () => {
        await tx.insert(schema.novels).values(values);
      })
      .catch((err: unknown) => {
        if (AppError.is(err, AppErrorCode.WBN_010)) throw new NovelInsertRace();
        throw err;
      });
  }

  private chapterFilter(novelId: bigint, ordinal: number): SQL {
    return and(eq(schema.publishedChapters.novelId, novelId), eq(schema.publishedChapters.ordinal, ordinal)) as SQL;
  }

  private isNovelUnchanged(stored: Novel, body: NovelUpsertBody): boolean {
    return (
      stored.title === body.title &&
      stored.blurb === (body.blurb ?? null) &&
      stored.coverPath === (body.coverPath ?? null) &&
      stored.status === (body.status ?? 'live') &&
      stored.visibility === body.visibility &&
      stored.genres.length === (body.genres ?? []).length &&
      stored.genres.every((genre, index) => genre === (body.genres ?? [])[index])
    );
  }

  /** Order-insensitive on the grant set: the forge sends a share list, and the order it happened to build it in is not a change. */
  private isAccessUnchanged(stored: Novel, body: NovelAccessBody, subjectIds: string[], current: { subjectId: string }[]): boolean {
    if (stored.visibility !== body.visibility) return false;
    if (stored.organisationId !== (body.organisationId ?? null)) return false;
    if (current.length !== subjectIds.length) return false;
    const held = new Set(current.map(grant => grant.subjectId));
    return subjectIds.every(subjectId => held.has(subjectId));
  }

  private countWords(content: string): number {
    return content.split(/\s+/).filter(Boolean).length;
  }

  private caller(): PublishCaller {
    return publishCaller(this.context);
  }
}
