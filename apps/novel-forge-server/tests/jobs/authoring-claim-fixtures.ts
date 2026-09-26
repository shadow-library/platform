import { type AppError } from '@shadow-library/common';

import { type AuthoringClaimHolder } from '@server/common';
import { type Job } from '@server/database';

import { type AuthoringClaimService } from '@modules/jobs/authoring-claim.service';

interface StoredClaim {
  jobId: string | null;
  kind: Job.Kind;
  claimedBy: string | null;
  stale: boolean;
}

/** The claim table's contract in memory, shared by every worker a test builds; each operation reads and writes without awaiting, so it is atomic. */
export class FakeAuthoringClaims {
  readonly ttlMs = 60_000;
  readonly rows = new Map<bigint, StoredClaim>();
  private issued = 0;

  async reserve(_db: unknown, projectId: bigint, jobId: string, kind: Job.Kind): Promise<boolean> {
    return this.take(projectId, jobId, kind, null);
  }

  async acquire(projectId: bigint, jobId: string | null, kind: Job.Kind): Promise<string | undefined> {
    const token = `token-${++this.issued}`;
    return this.take(projectId, jobId, kind, token) ? token : undefined;
  }

  async heartbeat(projectId: bigint, token: string): Promise<boolean> {
    const row = this.rows.get(projectId);
    if (row?.claimedBy !== token) return false;
    row.stale = false;
    return true;
  }

  async release(projectId: bigint, token: string): Promise<boolean> {
    if (this.rows.get(projectId)?.claimedBy !== token) return false;
    this.rows.delete(projectId);
    return true;
  }

  async releaseReservation(jobId: string): Promise<void> {
    for (const [projectId, row] of this.rows) if (row.jobId === jobId && row.claimedBy === null) this.rows.delete(projectId);
  }

  async holder(projectId: bigint): Promise<AuthoringClaimHolder | undefined> {
    const row = this.rows.get(projectId);
    return row && { jobId: row.jobId, kind: row.kind, claimedBy: row.claimedBy, live: !row.stale };
  }

  async settle(projectId: bigint, token: string, write: (tx: never) => Promise<void>): Promise<boolean> {
    const row = this.rows.get(projectId);
    if (!(await this.release(projectId, token))) return false;
    try {
      await write(undefined as never);
      return true;
    } catch (error) {
      if (row) this.rows.set(projectId, row);
      throw error;
    }
  }

  keepAlive(): () => void {
    return () => undefined;
  }

  async runExclusive<T>(projectId: bigint, kind: Job.Kind, conflict: () => AppError, action: () => Promise<T>): Promise<T> {
    const token = await this.acquire(projectId, null, kind);
    if (!token) throw conflict();
    try {
      return await action();
    } finally {
      await this.release(projectId, token);
    }
  }

  /** What a holder that stopped heartbeating for longer than the TTL looks like to every other worker. */
  expire(projectId: bigint): void {
    const row = this.rows.get(projectId);
    if (row) row.stale = true;
  }

  asService(): AuthoringClaimService {
    return this as unknown as AuthoringClaimService;
  }

  private take(projectId: bigint, jobId: string | null, kind: Job.Kind, token: string | null): boolean {
    const row = this.rows.get(projectId);
    const ownReservation = row !== undefined && row.claimedBy === null && jobId !== null && row.jobId === jobId;
    if (row && !row.stale && !ownReservation) return false;
    this.rows.set(projectId, { jobId, kind, claimedBy: token, stale: false });
    return true;
  }
}
