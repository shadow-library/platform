import { describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';

import { acquireAuthoringClaim, heartbeatAuthoringClaim, isAuthoringJob, jobHoldsLiveClaim, releaseAuthoringClaim, releaseAuthoringReservation } from '@server/common';
import { schema } from '@server/database';

const db = drizzle.mock({ schema });
const CLOCK = `timezone('utc', now())`;

describe('authoring claim statements', () => {
  it('should take a project only when no claim exists, the holder has gone stale, or the row is this job’s own unstarted reservation', () => {
    const { sql, params } = acquireAuthoringClaim(db, { projectId: 7n, jobId: 'job-1', kind: 'generate', token: 'token-1' }, 90_000).toSQL();

    expect(sql).toContain('on conflict ("project_id") do update set "job_id" = excluded.job_id, "kind" = excluded.kind, "claimed_by" = excluded.claimed_by');
    expect(sql).toContain(
      `where ("authoring_claims"."heartbeat_at" < ${CLOCK} - make_interval(secs => $5) or ("authoring_claims"."claimed_by" is null and "authoring_claims"."job_id" = excluded.job_id))`,
    );
    expect(sql).toEndWith('returning "project_id"');
    expect(params).toEqual([7n, 'job-1', 'generate', 'token-1', 90]);
  });

  it('should stamp claim times from the database clock in UTC, so neither replica clocks nor session time zones move staleness', () => {
    const { sql } = acquireAuthoringClaim(db, { projectId: 7n, jobId: null, kind: 'finalize', token: 'token-1' }, 90_000).toSQL();

    expect(sql).toContain(`values ($1, $2, $3, $4, ${CLOCK}, ${CLOCK})`);
  });

  it('should let only the token holder heartbeat or release a claim', () => {
    const heartbeat = heartbeatAuthoringClaim(db, 7n, 'token-1').toSQL();
    const release = releaseAuthoringClaim(db, 7n, 'token-1').toSQL();

    expect(heartbeat.sql).toBe(
      `update "authoring_claims" set "heartbeat_at" = ${CLOCK} where ("authoring_claims"."project_id" = $1 and "authoring_claims"."claimed_by" = $2) returning "project_id"`,
    );
    expect(release.sql).toBe('delete from "authoring_claims" where ("authoring_claims"."project_id" = $1 and "authoring_claims"."claimed_by" = $2) returning "project_id"');
    expect([heartbeat.params, release.params]).toEqual([
      [7n, 'token-1'],
      [7n, 'token-1'],
    ]);
  });

  it('should free a reservation only while no worker has started the job', () => {
    expect(releaseAuthoringReservation(db, 'job-1').toSQL().sql).toBe(
      'delete from "authoring_claims" where ("authoring_claims"."job_id" = $1 and "authoring_claims"."claimed_by" is null)',
    );
  });

  it('should count only a started, live claim as a job still running, and any live claim as a job being dispatched', () => {
    const started = db.select().from(schema.jobs).where(jobHoldsLiveClaim(90_000, true)).toSQL().sql;
    const any = db.select().from(schema.jobs).where(jobHoldsLiveClaim(90_000, false)).toSQL().sql;

    expect(started).toContain(
      `exists (select 1 from "authoring_claims" where "authoring_claims"."job_id" = "jobs"."id" and "authoring_claims"."claimed_by" is not null and not ("authoring_claims"."heartbeat_at" < ${CLOCK}`,
    );
    expect(any).toContain(`exists (select 1 from "authoring_claims" where "authoring_claims"."job_id" = "jobs"."id" and not ("authoring_claims"."heartbeat_at" < ${CLOCK}`);
  });
});

describe('isAuthoringJob', () => {
  it('should treat every job that writes prose or plans as authoring, and publishing and reindexing as not', () => {
    expect((['generate', 'finalize', 'import', 'organise', 'plan'] as const).every(isAuthoringJob)).toBe(true);
    expect(isAuthoringJob('publish')).toBe(false);
    expect(isAuthoringJob('backfill')).toBe(false);
  });
});
