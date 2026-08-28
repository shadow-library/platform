import { and, eq, isNull, lte, notLike, or, type SQL, sql } from 'drizzle-orm';
import { type PgColumn } from 'drizzle-orm/pg-core';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { UNSWEEPABLE_ERROR_PREFIXES } from '../publishing/publish-runner';
import { JobExecutor } from './job.executor';
import { JobService } from './job.service';

/** A failure the sweep may retry: no error recorded, or one carrying none of the prefixes an identical retry cannot clear */
function retryableFailure(error: PgColumn): SQL | undefined {
  return or(isNull(error), and(...UNSWEEPABLE_ERROR_PREFIXES.map(prefix => notLike(error, `${prefix}%`))));
}

/** Sweep cadence — also the precision of `scheduledAt` releases and the base retry interval for failed pushes */
export const PUBLISH_SWEEP_INTERVAL_MS = 60_000;

/**
 * The ledger-as-outbox sweeper (checkpoint-janitor pattern, reader-publish design §5): on boot and
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
