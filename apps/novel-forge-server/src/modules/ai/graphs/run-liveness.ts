import { type SQL, sql } from 'drizzle-orm';

import * as schema from '@server/database/schemas';

/** How often the replica running a run stamps it as alive. */
export const RUN_HEARTBEAT_MS = 5_000;

/** Six missed heartbeats: past this, the replica that was running the run is presumed gone. */
export const RUN_OWNER_SILENCE_MS = 30_000;

/** The run's last sign of life — its start, its latest heartbeat or its settling, whichever is latest. `greatest` skips nulls. */
export function runLastSeen(): SQL<Date> {
  const { heartbeatAt, startedAt, endedAt } = schema.workflowRuns;
  return sql<Date>`greatest(${heartbeatAt}, ${startedAt}::timestamptz, ${endedAt}::timestamptz)`;
}

/** Milliseconds since the run's last sign of life, by the database clock. */
export function runSilenceMs(): SQL<number> {
  return sql<number>`(extract(epoch from now() - ${runLastSeen()}) * 1000)::float8`.mapWith(Number);
}
