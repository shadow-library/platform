import { randomUUID } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { type AppError, Config, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { acquireAuthoringClaim, type AuthoringClaimHolder, heartbeatAuthoringClaim, readAuthoringClaim, releaseAuthoringClaim, releaseAuthoringReservation } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type DbExecutor, type Job, type PrimaryDatabase, type PrimaryTransaction } from '@server/database';

const HEARTBEATS_PER_TTL = 4;

/** One authoring job per project, across replicas; heartbeat, release and settle only take effect for the fencing token that holds the claim. */
@Injectable()
export class AuthoringClaimService {
  private readonly logger = Logger.getLogger(APP_NAME, AuthoringClaimService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  get ttlMs(): number {
    return Config.get('jobs.authoring-claim.ttl-ms');
  }

  /** Holds the claim for a job that is enqueued but not yet started, inside the caller's enqueue transaction. */
  async reserve(db: DbExecutor, projectId: bigint, jobId: string, kind: Job.Kind): Promise<boolean> {
    const rows = await acquireAuthoringClaim(db, { projectId, jobId, kind, token: null }, this.ttlMs);
    return rows.length > 0;
  }

  async acquire(projectId: bigint, jobId: string | null, kind: Job.Kind): Promise<string | undefined> {
    const token = randomUUID();
    const rows = await acquireAuthoringClaim(this.db, { projectId, jobId, kind, token }, this.ttlMs);
    if (rows.length === 0) return undefined;
    this.logger.debug('authoring claim acquired', { projectId, jobId, kind });
    return token;
  }

  async heartbeat(projectId: bigint, token: string): Promise<boolean> {
    const rows = await heartbeatAuthoringClaim(this.db, projectId, token);
    return rows.length > 0;
  }

  async release(projectId: bigint, token: string): Promise<boolean> {
    const rows = await releaseAuthoringClaim(this.db, projectId, token);
    return rows.length > 0;
  }

  async releaseReservation(jobId: string): Promise<void> {
    await releaseAuthoringReservation(this.db, jobId);
  }

  async holder(projectId: bigint, db: DbExecutor = this.db): Promise<AuthoringClaimHolder | undefined> {
    const [row] = await readAuthoringClaim(db, projectId, this.ttlMs);
    return row;
  }

  /** Releases the claim and runs `write` in one transaction, or runs nothing and answers false when the token no longer holds the claim. */
  async settle(projectId: bigint, token: string, write: (tx: PrimaryTransaction) => Promise<void>): Promise<boolean> {
    return this.db.transaction(async tx => {
      const released = await releaseAuthoringClaim(tx, projectId, token);
      if (released.length === 0) return false;
      await write(tx);
      return true;
    });
  }

  /** Heartbeats until stopped; `onLost` fires once when the claim is found taken over, and heartbeating stops with it. */
  keepAlive(projectId: bigint, token: string, onLost: () => void): () => void {
    let stopped = false;
    const stop = (): void => {
      stopped = true;
      clearInterval(timer);
    };
    const beat = async (): Promise<void> => {
      const held = await this.heartbeat(projectId, token);
      if (held || stopped) return;
      stop();
      this.logger.warn('authoring claim lost to another worker', { projectId });
      onLost();
    };
    const timer = setInterval(() => void beat().catch(err => this.logger.warn('authoring claim heartbeat failed', { err, projectId })), this.ttlMs / HEARTBEATS_PER_TTL);
    timer.unref();
    return stop;
  }

  /** Runs a synchronous authoring action under a job-less claim, refusing with `conflict` while any other authoring work holds the project. */
  async runExclusive<T>(projectId: bigint, kind: Job.Kind, conflict: () => AppError, action: () => Promise<T>): Promise<T> {
    const token = await this.acquire(projectId, null, kind);
    if (!token) throw conflict();
    const stop = this.keepAlive(projectId, token, () => undefined);
    try {
      return await action();
    } finally {
      stop();
      await this.releaseAfterAction(projectId, token, kind);
    }
  }

  private async releaseAfterAction(projectId: bigint, token: string, kind: Job.Kind): Promise<void> {
    try {
      if (!(await this.release(projectId, token))) this.logger.warn('authoring claim was taken over before the action finished', { projectId, kind });
    } catch (err) {
      this.logger.warn('authoring claim release failed; it frees itself once stale', { err, projectId, kind });
    }
  }
}
