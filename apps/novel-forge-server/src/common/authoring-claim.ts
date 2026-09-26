import { and, eq, isNull, or, type SQL, sql } from 'drizzle-orm';

import { type DbExecutor, type Job, schema } from '@server/database';

export interface AuthoringClaimRequest {
  projectId: bigint;
  jobId: string | null;
  kind: Job.Kind;
  /** Null reserves the claim for a job that has not started yet; the job's own dispatch then takes it over with a token. */
  token: string | null;
}

export interface ClaimStatement<T> extends PromiseLike<T> {
  toSQL(): { sql: string; params: unknown[] };
}

interface ClaimKey {
  projectId: bigint;
}

export interface AuthoringClaimHolder {
  jobId: string | null;
  kind: Job.Kind;
  claimedBy: string | null;
  live: boolean;
}

export const AUTHORING_JOB_KINDS: readonly Job.Kind[] = ['generate', 'finalize', 'import', 'organise', 'plan'];

const claims = schema.authoringClaims;

export function isAuthoringJob(kind: Job.Kind): boolean {
  return AUTHORING_JOB_KINDS.includes(kind);
}

/** The claim columns are `timestamp` without a zone: stamping and comparing in UTC keeps every session and replica on one clock. */
export function authoringClaimClock(): SQL {
  return sql`timezone('utc', now())`;
}

export function authoringClaimIsStale(ttlMs: number): SQL {
  return sql`${claims.heartbeatAt} < ${authoringClaimClock()} - make_interval(secs => ${ttlMs / 1000})`;
}

/** Whether a live claim names the outer `jobs` row; `tokened` excludes reservations no worker has started. */
export function jobHoldsLiveClaim(ttlMs: number, tokened: boolean): SQL {
  const started = tokened ? sql` and ${claims.claimedBy} is not null` : sql``;
  return sql`exists (select 1 from ${claims} where ${claims.jobId} = ${schema.jobs.id}${started} and not (${authoringClaimIsStale(ttlMs)}))`;
}

/** Race-free across replicas: the loser's upsert conflicts and its update is skipped unless the holder is stale or it is this job's own reservation. */
export function acquireAuthoringClaim(db: DbExecutor, request: AuthoringClaimRequest, ttlMs: number): ClaimStatement<ClaimKey[]> {
  const { projectId, jobId, kind, token } = request;
  return db
    .insert(claims)
    .values({ projectId, jobId, kind, claimedBy: token, claimedAt: authoringClaimClock(), heartbeatAt: authoringClaimClock() })
    .onConflictDoUpdate({
      target: claims.projectId,
      set: { jobId: sql`excluded.job_id`, kind: sql`excluded.kind`, claimedBy: sql`excluded.claimed_by`, claimedAt: authoringClaimClock(), heartbeatAt: authoringClaimClock() },
      setWhere: or(authoringClaimIsStale(ttlMs), and(isNull(claims.claimedBy), eq(claims.jobId, sql`excluded.job_id`))),
    })
    .returning({ projectId: claims.projectId });
}

export function heartbeatAuthoringClaim(db: DbExecutor, projectId: bigint, token: string): ClaimStatement<ClaimKey[]> {
  return db
    .update(claims)
    .set({ heartbeatAt: authoringClaimClock() })
    .where(and(eq(claims.projectId, projectId), eq(claims.claimedBy, token)))
    .returning({ projectId: claims.projectId });
}

export function releaseAuthoringClaim(db: DbExecutor, projectId: bigint, token: string): ClaimStatement<ClaimKey[]> {
  return db
    .delete(claims)
    .where(and(eq(claims.projectId, projectId), eq(claims.claimedBy, token)))
    .returning({ projectId: claims.projectId });
}

export function releaseAuthoringReservation(db: DbExecutor, jobId: string): ClaimStatement<unknown> {
  return db.delete(claims).where(and(eq(claims.jobId, jobId), isNull(claims.claimedBy)));
}

export function readAuthoringClaim(db: DbExecutor, projectId: bigint, ttlMs: number): ClaimStatement<AuthoringClaimHolder[]> {
  return db
    .select({ jobId: claims.jobId, kind: claims.kind, claimedBy: claims.claimedBy, live: sql<boolean>`not (${authoringClaimIsStale(ttlMs)})` })
    .from(claims)
    .where(eq(claims.projectId, projectId));
}
