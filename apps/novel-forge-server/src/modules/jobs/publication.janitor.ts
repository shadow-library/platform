import { and, eq, isNotNull, isNull, lte, notLike, or, type SQL, sql } from 'drizzle-orm';
import { type PgColumn } from 'drizzle-orm/pg-core';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { renderChapterPayload } from '../publishing/publish-payload';
import { CANONICAL_PROSE_CHANGED_PREFIX, UNSWEEPABLE_ERROR_PREFIXES } from '../publishing/publish-runner';
import { JobExecutor } from './job.executor';
import { JobService } from './job.service';

/** A failure the sweep may retry: no error recorded, or one carrying none of the prefixes an identical retry cannot clear */
function retryableFailure(error: PgColumn): SQL | undefined {
  return or(isNull(error), and(...UNSWEEPABLE_ERROR_PREFIXES.map(prefix => notLike(error, `${prefix}%`))));
}

/** Sweep cadence — also the precision of `scheduledAt` releases and the base retry interval for failed pushes */
const PUBLISH_SWEEP_INTERVAL_MS = 60_000;

/**
 * The ledger-as-outbox sweeper (checkpoint-janitor pattern): on boot and
 * every minute it finds projects whose ledger has due work — scheduled rows past their gate, or
 * failed pushes a retry can still clear — and (re-)enqueues their `publish` job. The enqueue dedups
 * onto an active job and resets a terminal one, so a reader outage simply keeps the loop turning
 * until it converges. Stale conflicts and malformed pushes wait for an explicit reconcile or
 * republish.
 */
@Injectable()
export class PublicationJanitor {
  private readonly logger = Logger.getLogger(APP_NAME, PublicationJanitor.name);
  private readonly db: PrimaryDatabase;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    databaseService: DatabaseService,
    private readonly jobService: JobService,
    private readonly jobExecutor: JobExecutor,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  onModuleInit(): void {
    void this.boot();
  }

  private async boot(): Promise<void> {
    await this.reconcileCrlfContentHashes().catch(err => this.logger.warn('crlf content-hash reconciliation failed on boot', { err }));
    await this.sweep().catch(err => this.logger.warn('publication sweep failed on boot', { err }));
    this.timer = setInterval(() => this.sweep().catch(err => this.logger.warn('publication sweep failed', { err })), PUBLISH_SWEEP_INTERVAL_MS);
    // The sweep must never keep a stopping process alive.
    this.timer.unref?.();
  }

  /** Adopts the fresh `chapterContentHash` for each CRLF-migration-marked row whose chapter wasn't edited since the mark, resetting a stale-prose failure back to `scheduled`; either way the mark is cleared, so this only ever does its one-time job once. */
  async reconcileCrlfContentHashes(): Promise<number> {
    const marked = await this.db
      .select({ publication: schema.chapterPublications, chapter: schema.chapters })
      .from(schema.chapterPublications)
      .innerJoin(schema.chapters, and(eq(schema.chapters.projectId, schema.chapterPublications.projectId), eq(schema.chapters.number, schema.chapterPublications.chapter)))
      .where(isNotNull(schema.chapterPublications.crlfRehashSince));

    let adopted = 0;
    for (const { publication: row, chapter } of marked) {
      const update: Partial<typeof schema.chapterPublications.$inferInsert> = { crlfRehashSince: null };
      if (chapter.updatedAt <= (row.crlfRehashSince as Date)) {
        update.contentHash = renderChapterPayload(chapter).contentHash;
        if (row.status === 'failed' && row.error?.startsWith(CANONICAL_PROSE_CHANGED_PREFIX)) Object.assign(update, { status: 'scheduled' as const, error: null });
        adopted += 1;
      }
      await this.db.update(schema.chapterPublications).set(update).where(eq(schema.chapterPublications.id, row.id));
    }
    if (adopted > 0) this.logger.info(`crlf content-hash reconciliation adopted ${adopted} chapter publication row(s)`);
    return adopted;
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Enqueues (and dispatches) a `publish` job for every project with due ledger work; returns the projects touched */
  async sweep(): Promise<bigint[]> {
    const projectIds = await this.dueProjects();
    for (const projectId of projectIds) {
      const jobId = await this.jobService.enqueue(projectId, 'publish', `publish-${projectId}`);
      this.jobExecutor.dispatch(jobId).catch(err => this.logger.warn('publish dispatch failed from sweep', { err, jobId }));
    }
    if (projectIds.length > 0) this.logger.info(`publication sweep enqueued ${projectIds.length} publish job(s)`, { projects: projectIds.map(projectId => String(projectId)) });
    return projectIds;
  }

  /** The sweep's selection, without its side effects: every project whose ledger holds work a retry can still clear */
  async dueProjects(): Promise<bigint[]> {
    const chapterDue = await this.db
      .selectDistinct({ projectId: schema.chapterPublications.projectId })
      .from(schema.chapterPublications)
      .where(
        or(
          and(eq(schema.chapterPublications.status, 'scheduled'), or(isNull(schema.chapterPublications.scheduledAt), lte(schema.chapterPublications.scheduledAt, sql`now()`))),
          and(eq(schema.chapterPublications.status, 'failed'), retryableFailure(schema.chapterPublications.error)),
        ),
      );

    // Wiki entries share the `publish` job and converge: a project with a pending or retryably-failed wiki row
    // has a push owed, exactly as a scheduled/failed chapter does. Tombstoned (`deleted`) rows are not swept —
    // like a chapter's `unpublished`, their DELETE rides the next converge some other due work triggers.
    const wikiDue = await this.db
      .selectDistinct({ projectId: schema.wikiPublications.projectId })
      .from(schema.wikiPublications)
      .where(or(eq(schema.wikiPublications.state, 'pending'), and(eq(schema.wikiPublications.state, 'failed'), retryableFailure(schema.wikiPublications.error))));

    return [...new Set([...chapterDue, ...wikiDue].map(row => row.projectId))];
  }
}
