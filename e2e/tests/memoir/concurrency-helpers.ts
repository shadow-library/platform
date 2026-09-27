/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { type APIRequestContext, expect } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { memoirDb, pollUntil } from '../../lib';
import { type CommandEnvelopeInput, type CommandOutcome, todayLocal } from './helpers';

/**
 * `CommandBus.execute` serializes every command for an account behind `pg_advisory_xact_lock(accountId)`
 * (`command-log.repository.ts`'s `runSerialized`), so two commands submitted for one account never race at the
 * Postgres row level — the second's transaction blocks on the lock until the first's commits or rolls back.
 * `withAccountLockHeld` proves that queueing happens (mirroring `security-core.spec.ts`'s blocker-row +
 * `pg_blocking_pids` proof) instead of trusting two `Promise.all` calls to overlap in time; `submitCommandWithHeaders`
 * and `expectApplied` are the plumbing finance.spec.ts and metrics.spec.ts share to fire a burst under it.
 */

async function waitersBlockedBy(pid: number): Promise<number> {
  const [row] = await memoirDb()<{ waiters: number }[]>`SELECT count(*)::int AS waiters FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
  return row?.waiters ?? 0;
}

/**
 * Holds `accountId`'s own advisory lock open, starts `fire()` (which is expected to submit `waiterCount` commands
 * for that account), waits until all of them are genuinely queued behind the held lock, then releases it and
 * returns `fire()`'s settled result. Throws if fewer than `waiterCount` callers ever queued — a flaky call is a
 * failed proof, not a passed one.
 */
export async function withAccountLockHeld<T>(accountId: string, waiterCount: number, fire: () => Promise<T>): Promise<T> {
  const blocker = await memoirDb().reserve();
  let result: Promise<T> | undefined;
  try {
    await blocker`BEGIN`;
    const [backend] = await blocker<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    if (!backend) throw new Error('pg_backend_pid() returned no row');
    await blocker`SELECT pg_advisory_xact_lock(${accountId}::bigint)`;

    result = fire();
    const waiting = await pollUntil(
      () => waitersBlockedBy(backend.pid),
      waiters => waiters >= waiterCount,
      { timeoutMs: 10_000, intervalMs: 50 },
    );
    if (waiting < waiterCount) {
      result.catch(() => undefined);
      throw new Error(`only ${waiting}/${waiterCount} callers queued behind account ${accountId}'s advisory lock before the poll budget ran out`);
    }
  } finally {
    await blocker`ROLLBACK`.catch(() => undefined);
    blocker.release();
  }
  return result;
}

/**
 * Submits one sync command reusing pre-fetched CSRF headers rather than `memoirMutate`'s per-call reseed, which
 * rotates the `csrf-token` cookie and fails an earlier in-flight POST of a concurrent burst with `403 S010`. Fetch
 * `headers` once via `csrfHeaders(ctx)` and share it across every call in the burst.
 */
export async function submitCommandWithHeaders(
  ctx: APIRequestContext,
  headers: Record<string, string>,
  type: string,
  payload: Record<string, unknown>,
  overrides: Partial<CommandEnvelopeInput> = {},
): Promise<CommandOutcome> {
  const envelope: CommandEnvelopeInput = { commandId: randomUUID(), type, payload, localDate: todayLocal(), ...overrides };
  const response = await ctx.post('/api/v1/sync/commands', { headers, data: { commands: [envelope] } });
  if (!response.ok()) throw new Error(`sync/commands failed: ${response.status()} ${await response.text()}`);
  const body = (await response.json()) as { outcomes: CommandOutcome[] };
  const outcome = body.outcomes[0];
  if (!outcome) throw new Error('sync/commands returned no outcome for the submitted command');
  return outcome;
}

export function expectApplied(outcome: CommandOutcome): void {
  expect(outcome.status, JSON.stringify(outcome)).toBe('applied');
}
