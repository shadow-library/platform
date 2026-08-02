/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { and, eq, isNull, lte, notLike, or, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { STALE_ERROR_PREFIX } from '../publishing/publish-runner';
import { JobExecutor } from './job.executor';
import { JobService } from './job.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** Sweep cadence — also the precision of `scheduledAt` releases and the base retry interval for failed pushes */
export const PUBLISH_SWEEP_INTERVAL_MS = 60_000;

/**
 * The ledger-as-outbox sweeper (checkpoint-janitor pattern, reader-publish design §5): on boot and
 * every minute it finds projects whose ledger has due work — scheduled rows past their gate, or
 * failed pushes that are not stale-revision conflicts — and (re-)enqueues their `publish` job. The
 * enqueue dedups onto an active job and resets a terminal one, so a reader outage simply keeps the
 * loop turning until it converges. Stale conflicts wait for an explicit reconcile or republish.
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
    this.sweep().catch(err => this.logger.warn('publication sweep failed on boot', { err }));
    this.timer = setInterval(() => this.sweep().catch(err => this.logger.warn('publication sweep failed', { err })), PUBLISH_SWEEP_INTERVAL_MS);
    // The sweep must never keep a stopping process alive.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Enqueues (and dispatches) a `publish` job for every project with due ledger work; returns the projects touched */
  async sweep(): Promise<bigint[]> {
    const chapterDue = await this.db
      .selectDistinct({ projectId: schema.chapterPublications.projectId })
      .from(schema.chapterPublications)
      .where(
        or(
          and(eq(schema.chapterPublications.status, 'scheduled'), or(isNull(schema.chapterPublications.scheduledAt), lte(schema.chapterPublications.scheduledAt, sql`now()`))),
          and(eq(schema.chapterPublications.status, 'failed'), or(isNull(schema.chapterPublications.error), notLike(schema.chapterPublications.error, `${STALE_ERROR_PREFIX}%`))),
        ),
      );

    // Wiki entries share the `publish` job and converge: a project with a pending or non-stale-failed wiki row
    // has a push owed, exactly as a scheduled/failed chapter does. Tombstoned (`deleted`) rows are not swept —
    // like a chapter's `unpublished`, their DELETE rides the next converge some other due work triggers.
    const wikiDue = await this.db
      .selectDistinct({ projectId: schema.wikiPublications.projectId })
      .from(schema.wikiPublications)
      .where(
        or(
          eq(schema.wikiPublications.state, 'pending'),
          and(eq(schema.wikiPublications.state, 'failed'), or(isNull(schema.wikiPublications.error), notLike(schema.wikiPublications.error, `${STALE_ERROR_PREFIX}%`))),
        ),
      );

    const projectIds = [...new Set([...chapterDue, ...wikiDue].map(row => row.projectId))];
    for (const projectId of projectIds) {
      const jobId = await this.jobService.enqueue(projectId, 'publish', `publish-${projectId}`);
      this.jobExecutor.dispatch(jobId).catch(err => this.logger.warn('publish dispatch failed from sweep', { err, jobId }));
    }
    if (projectIds.length > 0) this.logger.info(`publication sweep enqueued ${projectIds.length} publish job(s)`, { projects: projectIds.map(projectId => String(projectId)) });
    return projectIds;
  }
}
