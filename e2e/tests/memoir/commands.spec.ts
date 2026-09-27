/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { type APIResponse } from '@playwright/test';
import { type ReservedSql } from 'postgres';

/**
 * Importing user defined packages
 */
import { memoirDb, pollUntil } from '../../lib';
import { expect, type MemoirPersona, test } from './fixtures';
import {
  commandEnvelope,
  type CommandEnvelopeInput,
  type CommandOutcome,
  commandOutcomesOf,
  dailyQuestDraft,
  getAccount,
  memoirCsrfHeaders,
  postCommands,
  pullDelta,
  pullFullDelta,
  submitCommand,
  submitCommands,
  todayLocal,
  waitersBlockedBy,
} from './helpers';

/**
 * Defining types
 */

interface Mirrors {
  totalXp: string;
  coins: number;
  discipline: number;
  body: number;
  wealth: number;
  mind: number;
}

interface AccountMirrors extends Mirrors {
  level: number;
}

interface HeroEventRow {
  id: string;
  dedupeKey: string;
  type: string;
  xpDelta: number;
  coinsDelta: number;
  statAffinity: string | null;
  statDelta: number;
  levelAfter: number | null;
  questId: string | null;
  questLogId: string | null;
  date: string;
  rulesetVersion: number;
}

interface HeldLock<T> {
  /** Takes the lock inside the blocker's open transaction. */
  take: (blocker: ReservedSql) => Promise<unknown>;
  /** Fires the request(s) that must queue behind the lock. */
  fire: () => Promise<T>;
  /** Runs while the lock is still held and the fired work is known to be waiting on it. */
  whileHeld: (blockerPid: number) => Promise<void>;
}

/**
 * Declaring the constants
 *
 * The command bus and the hero ledger, driven through `POST /api/v1/sync/commands` on fresh personas. Where a property is about
 * what happens *while* a command is inside its transaction, a reserved `memoirDb()` connection holds a lock the command needs, so
 * the test can observe it mid-flight (`pg_locks`) instead of hoping the timing lines up.
 */

/** `CURRENT_RULESET_VERSION` in apps/memoir-server/src/modules/rules/ruleset.ts. */
const ACTIVE_RULESET_VERSION = 1;

/** level.ts: level 2 costs `round(curveCoefficient * 1^curveExponent)` = 100 XP under ruleset v1's curve (ruleset.ts `level`). */
const LEVEL_TWO_XP = 100;

/** A routine on-time completion earns 10 XP (ruleset.ts `baseXp.routine.on_time`), so 12 cross level 2 with two to spare after it. */
const LEVEL_UP_COMPLETIONS = 12;

/**
 * Memoir-server's pool is 10 connections and every request queued on the advisory lock pins one inside its open transaction. Two
 * copies of this test (two workers) at five waiters each exhausted it outright, starving the other account's command; three each
 * (two racing resends and one distinct command) leave room for that command and for other concurrent memoir traffic.
 */
const SERIALIZED_BURST = 3;

/**
 * A blocker still holding its lock at the 30 s test timeout would outlive the abandoned test body and stall the fixture's account
 * delete behind it, so every hold is released well before then.
 */
const HOLD_DEADLINE_MS = 15_000;

class LockHoldTimeoutError extends Error {
  override readonly name = 'LockHoldTimeoutError';
}
const RACED_RESENDS = 2;

async function mirrorsOf(accountId: string): Promise<AccountMirrors> {
  const [row] = await memoirDb()<AccountMirrors[]>`
    SELECT level, total_xp::text AS "totalXp", coins, stat_discipline AS discipline, stat_body AS body, stat_wealth AS wealth, stat_mind AS mind
    FROM accounts WHERE id = ${accountId}
  `;
  if (!row) throw new Error(`account ${accountId} has no row`);
  return row;
}

/** What the account's `hero_events` add up to — the authoritative source every mirror must equal. */
async function ledgerTotalsOf(accountId: string): Promise<Mirrors> {
  const [row] = await memoirDb()<Mirrors[]>`
    SELECT
      coalesce(sum(xp_delta), 0)::text AS "totalXp",
      coalesce(sum(coins_delta), 0)::int AS coins,
      coalesce(sum(stat_delta) FILTER (WHERE stat_affinity = 'discipline'), 0)::int AS discipline,
      coalesce(sum(stat_delta) FILTER (WHERE stat_affinity = 'body'), 0)::int AS body,
      coalesce(sum(stat_delta) FILTER (WHERE stat_affinity = 'wealth'), 0)::int AS wealth,
      coalesce(sum(stat_delta) FILTER (WHERE stat_affinity = 'mind'), 0)::int AS mind
    FROM hero_events WHERE account_id = ${accountId}
  `;
  if (!row) throw new Error(`hero_events totals for ${accountId} returned no row`);
  return row;
}

async function expectMirrorsMatchLedger(accountId: string): Promise<void> {
  const { level: _level, ...mirrors } = await mirrorsOf(accountId);
  expect(mirrors, 'every account mirror must equal the sum of its hero_events').toEqual(await ledgerTotalsOf(accountId));
}

async function heroEventsOf(accountId: string): Promise<HeroEventRow[]> {
  return memoirDb()<HeroEventRow[]>`
    SELECT
      id::text, dedupe_key AS "dedupeKey", type::text, xp_delta AS "xpDelta", coins_delta AS "coinsDelta", stat_affinity::text AS "statAffinity",
      stat_delta AS "statDelta", level_after AS "levelAfter", quest_id::text AS "questId", quest_log_id::text AS "questLogId", date::text,
      ruleset_version AS "rulesetVersion"
    FROM hero_events WHERE account_id = ${accountId} ORDER BY id
  `;
}

async function commandLogOf(accountId: string, commandId: string): Promise<{ type: string; status: string }[]> {
  return memoirDb()<{ type: string; status: string }[]>`SELECT type, status::text FROM command_log WHERE account_id = ${accountId} AND command_id = ${commandId}`;
}

async function questLogIdsOf(accountId: string, questId: string): Promise<string[]> {
  const rows = await memoirDb()<{ id: string }[]>`SELECT id::text FROM quest_logs WHERE account_id = ${accountId} AND quest_id = ${questId}`;
  return rows.map(row => row.id);
}

async function countsOf(accountId: string): Promise<{ commands: number; events: number; questLogs: number; unlocks: number }> {
  const [row] = await memoirDb()<{ commands: number; events: number; questLogs: number; unlocks: number }[]>`
    SELECT
      (SELECT count(*)::int FROM command_log WHERE account_id = ${accountId}) AS commands,
      (SELECT count(*)::int FROM hero_events WHERE account_id = ${accountId}) AS events,
      (SELECT count(*)::int FROM quest_logs WHERE account_id = ${accountId}) AS "questLogs",
      (SELECT count(*)::int FROM cosmetic_unlocks WHERE account_id = ${accountId}) AS unlocks
  `;
  if (!row) throw new Error(`row counts for ${accountId} returned no row`);
  return row;
}

/** The single backend queued behind `blockerPid`, which by construction is the command the test fired. */
async function soleWaiterOf(blockerPid: number): Promise<number> {
  const waiters = await memoirDb()<{ pid: number }[]>`SELECT pid FROM pg_stat_activity WHERE ${blockerPid}::int = ANY(pg_blocking_pids(pid))`;
  expect(waiters, 'exactly the fired command must be queued behind the blocker').toHaveLength(1);
  const [waiter] = waiters;
  if (!waiter) throw new Error(`no backend is queued behind ${blockerPid}`);
  return waiter.pid;
}

/** The tables `pid` has written in its still-open transaction: a `RowExclusiveLock` is taken by INSERT/UPDATE/DELETE and held to commit. */
async function tablesWrittenBy(pid: number): Promise<string[]> {
  const rows = await memoirDb()<{ relation: string }[]>`
    SELECT relation::regclass::text AS relation FROM pg_locks WHERE pid = ${pid} AND locktype = 'relation' AND mode = 'RowExclusiveLock' AND granted
  `;
  return rows.map(row => row.relation);
}

/**
 * The per-account advisory lock as `pg_locks` reports it. A one-bigint key is split into `classid` (high 32 bits) and `objid` (low 32
 * bits) with `objsubid = 1`, so reassembling them and comparing to the account id checks the key derivation, not just "some lock".
 */
async function accountLockHolders(accountId: string): Promise<{ pid: number; granted: boolean }[]> {
  return memoirDb()<{ pid: number; granted: boolean }[]>`
    SELECT pid, granted FROM pg_locks
    WHERE locktype = 'advisory' AND objsubid = 1 AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND ((classid::bigint << 32) | objid::bigint) = ${accountId}::bigint
  `;
}

async function xminOf(table: 'accounts' | 'hero_events' | 'quest_logs', id: string): Promise<string> {
  const [row] = await memoirDb()<{ xmin: string }[]>`SELECT xmin::text FROM ${memoirDb()(table)} WHERE id = ${id}`;
  if (!row) throw new Error(`${table} ${id} has no row`);
  return row.xmin;
}

async function commandLogXmin(accountId: string, commandId: string): Promise<string> {
  const [row] = await memoirDb()<{ xmin: string }[]>`SELECT xmin::text FROM command_log WHERE account_id = ${accountId} AND command_id = ${commandId}`;
  if (!row) throw new Error(`command_log has no row for ${commandId}`);
  return row.xmin;
}

/** Rejects when `work` outlives the hold deadline; the work itself keeps running, but nothing waits on it any more. */
async function withinHoldDeadline(work: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LockHoldTimeoutError(`the blocker was held past ${HOLD_DEADLINE_MS}ms; released to keep teardown unblocked`)), HOLD_DEADLINE_MS);
  });
  work.catch(() => undefined);
  try {
    await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Holds a lock on a reserved connection, fires work that must queue behind it, runs `whileHeld`, then rolls the blocker back and
 * returns the fired work's result. The rollback and the drain run even when an assertion inside fails or `whileHeld` stalls past
 * the hold deadline, so nothing stays locked into the fixture's teardown.
 */
async function underHeldLock<T>({ take, fire, whileHeld }: HeldLock<T>): Promise<T> {
  const blocker = await memoirDb().reserve();
  let fired: Promise<T> | undefined;
  try {
    await blocker`BEGIN`;
    const [backend] = await blocker<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    if (!backend) throw new Error('pg_backend_pid() returned no row');
    await take(blocker);
    fired = fire();
    fired.catch(() => undefined);
    await withinHoldDeadline(whileHeld(backend.pid));
  } finally {
    await blocker`ROLLBACK`.catch(() => undefined);
    blocker.release();
    await fired?.catch(() => undefined);
  }
  return fired;
}

async function waitForWaiters(blockerPid: number, expected: number): Promise<void> {
  const waiting = await pollUntil(
    () => waitersBlockedBy(blockerPid),
    waiters => waiters >= expected,
    { timeoutMs: 10_000, intervalMs: 50 },
  );
  expect(waiting, `${expected} backend(s) must be queued behind the blocker before it is released`).toBe(expected);
}

function accountIdOf(persona: MemoirPersona): string {
  if (!persona.account) throw new Error('the persona must be onboarded');
  return persona.account.id;
}

async function createQuests(persona: MemoirPersona, count: number, label: string): Promise<string[]> {
  const outcomes = await submitCommands(
    persona.ctx,
    Array.from({ length: count }, (_, index) => commandEnvelope('quest.create', dailyQuestDraft(`E2E ${label} ${index} ${randomUUID()}`))),
  );
  expect(outcomes.map(outcome => outcome.status)).toEqual(Array.from({ length: count }, () => 'applied'));
  return outcomes.map(outcome => String(outcome.result['id']));
}

function completion(questId: string): CommandEnvelopeInput {
  return commandEnvelope('quest.complete', { occurrenceId: `${questId}:${todayLocal()}` });
}

async function soleOutcome(response: APIResponse): Promise<CommandOutcome> {
  const outcomes = await commandOutcomesOf(response);
  expect(outcomes).toHaveLength(1);
  const [outcome] = outcomes;
  if (!outcome) throw new Error('the batch returned no outcome');
  return outcome;
}

/** The index of the completion whose award first brings the running XP total to `threshold`, or -1 if none does. */
function crossingIndexOf(outcomes: CommandOutcome[], threshold: number): number {
  let cumulative = 0;
  for (const [index, outcome] of outcomes.entries()) {
    cumulative += Number(outcome.result['xpAwarded']);
    if (cumulative >= threshold) return index;
  }
  return -1;
}

function eventFor(events: HeroEventRow[], logId: unknown): HeroEventRow | undefined {
  return events.find(event => event.dedupeKey === `${String(logId)}_xp`);
}

test.describe('memoir command replay', () => {
  test('should answer a resent committed command with its recorded outcome and replayed:true, never re-running it whatever the resend carries', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'cmd-replay', onboard: true });
    const accountId = accountIdOf(persona);
    const create = commandEnvelope('quest.create', dailyQuestDraft(`E2E replay ${randomUUID()}`));
    const [created] = await submitCommands(persona.ctx, [create]);
    const questId = String(created?.result['id']);
    const complete = completion(questId);
    const [completed] = await submitCommands(persona.ctx, [complete]);
    expect(completed).toMatchObject({ status: 'applied', replayed: false });
    expect(completed?.result['xpAwarded'], 'the completion must have moved the ledger for a re-run to be visible').toBeGreaterThan(0);

    const mirrorsBefore = await mirrorsOf(accountId);
    const eventsBefore = await heroEventsOf(accountId);
    const logsBefore = await questLogIdsOf(accountId, questId);

    const [resent] = await submitCommands(persona.ctx, [complete]);
    expect(resent).toEqual({ commandId: complete.commandId, status: completed?.status, result: completed?.result, replayed: true });

    const [relabelled] = await submitCommands(persona.ctx, [{ ...complete, type: 'quest.delete', payload: { questId } }]);
    expect(relabelled, 'the id alone keys the replay, so a different body under it reads back the recorded completion').toEqual({
      commandId: complete.commandId,
      status: completed?.status,
      result: completed?.result,
      replayed: true,
    });

    const [recreated] = await submitCommands(persona.ctx, [create]);
    expect(recreated).toMatchObject({ status: 'applied', replayed: true, result: { id: questId } });

    expect(await mirrorsOf(accountId)).toEqual(mirrorsBefore);
    expect(await heroEventsOf(accountId)).toEqual(eventsBefore);
    expect(await questLogIdsOf(accountId, questId)).toEqual(logsBefore);
    expect(await commandLogOf(accountId, complete.commandId)).toEqual([{ type: 'quest.complete', status: 'applied' }]);
    const [quest] = await memoirDb()<{ active: boolean }[]>`SELECT active FROM quests WHERE id = ${questId}`;
    expect(quest, 'the relabelled resend must not have deleted the quest').toEqual({ active: true });

    const renamed = await submitCommand(persona.ctx, 'quest.update', { questId, patch: { name: `E2E replay renamed ${randomUUID()}` } });
    expect(renamed, 'a fresh id for a new action still applies').toMatchObject({ status: 'applied', replayed: false });
  });
});

test.describe('memoir per-account command serialization', () => {
  /**
   * The account's advisory lock is taken first from a reserved connection, so every request's transaction queues on it and the race is
   * certain rather than timing-dependent. Released, the queue drains one transaction at a time: the first K to commit claims the id and
   * every later K reads that claim back.
   */
  test('should serialize racing resends and a distinct command for one account behind its advisory lock while another account proceeds', async ({ memoir }) => {
    const [alice, bob] = await Promise.all([memoir.persona({ label: 'cmd-serial-a', onboard: true }), memoir.persona({ label: 'cmd-serial-b', onboard: true })]);
    const accountId = accountIdOf(alice);
    const [racedQuest, distinctQuest] = await createQuests(alice, 2, 'serialize');
    if (!racedQuest || !distinctQuest) throw new Error('quest.create returned too few ids');
    const raced = completion(racedQuest);
    const distinct = completion(distinctQuest);
    const burst = [...Array.from({ length: RACED_RESENDS }, () => raced), distinct];
    const mirrorsBefore = await mirrorsOf(accountId);
    const csrfHeaders = await memoirCsrfHeaders(alice.ctx);

    const responses = await underHeldLock({
      take: blocker => blocker`SELECT pg_advisory_xact_lock(${accountId}::bigint)`,
      fire: () => Promise.all(burst.map(envelope => postCommands(alice.ctx, [envelope], csrfHeaders))),
      whileHeld: async blockerPid => {
        await waitForWaiters(blockerPid, SERIALIZED_BURST);
        const holders = await accountLockHolders(accountId);
        expect(
          holders.filter(holder => holder.granted).map(holder => holder.pid),
          "the blocker alone holds the account's lock, keyed by its id",
        ).toEqual([blockerPid]);
        expect(
          holders.filter(holder => !holder.granted),
          'every burst request waits on that same key',
        ).toHaveLength(SERIALIZED_BURST);

        const elsewhere = await submitCommand(bob.ctx, 'quest.create', dailyQuestDraft(`E2E serialize other ${randomUUID()}`));
        expect(elsewhere, "another account's command is not queued behind this account's lock").toMatchObject({ status: 'applied', replayed: false });
        expect(await waitersBlockedBy(blockerPid), 'the burst is still queued while the other account commits').toBe(SERIALIZED_BURST);
      },
    });

    const outcomes = await Promise.all(responses.map(soleOutcome));
    const racedOutcomes = outcomes.slice(0, RACED_RESENDS);
    for (const outcome of racedOutcomes) expect(outcome.status).toBe('applied');
    expect(
      racedOutcomes.filter(outcome => !outcome.replayed),
      'exactly one racing resend runs the handler',
    ).toHaveLength(1);
    for (const outcome of racedOutcomes) expect(outcome.result, "every loser reads back the winner's recorded result").toEqual(racedOutcomes[0]?.result);
    expect(outcomes[RACED_RESENDS], 'the distinct command applies on its own turn').toMatchObject({ status: 'applied', replayed: false });

    for (const envelope of [raced, distinct]) expect(await commandLogOf(accountId, envelope.commandId)).toEqual([{ type: 'quest.complete', status: 'applied' }]);
    const events = await heroEventsOf(accountId);
    for (const questId of [racedQuest, distinctQuest]) {
      const logIds = await questLogIdsOf(accountId, questId);
      expect(logIds, `quest ${questId} is completed exactly once`).toHaveLength(1);
      expect(events.filter(event => event.questLogId === logIds[0])).toHaveLength(1);
    }

    const awarded = [racedOutcomes.find(outcome => !outcome.replayed), outcomes[RACED_RESENDS]].reduce((sum, outcome) => sum + Number(outcome?.result['xpAwarded']), 0);
    expect(BigInt((await mirrorsOf(accountId)).totalXp) - BigInt(mirrorsBefore.totalXp), 'no grant was lost or doubled by the race').toBe(BigInt(awarded));
    await expectMirrorsMatchLedger(accountId);
  });
});

test.describe('memoir command rollback', () => {
  test('should leave no command-log claim or ledger effect when a handler refuses, and commit a fresh command afterwards', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'cmd-refused', onboard: true });
    const accountId = accountIdOf(persona);
    // The day-opening rollover writes the account row before the claim, and the blocker would stall it there; a pull opens the day first.
    await pullDelta(persona.ctx);
    const mirrorsBefore = await mirrorsOf(accountId);
    const countsBefore = await countsOf(accountId);
    const purchase = commandEnvelope('cosmetic.purchase', { cosmeticId: 'badge_silver' });

    // The grant reads the account FOR UPDATE after the bus has claimed the id, so holding that row pauses the command between the two.
    // NO KEY UPDATE, because the claim's foreign-key check takes KEY SHARE on the same row and must not be the thing that waits.
    const response = await underHeldLock({
      take: blocker => blocker`SELECT id FROM accounts WHERE id = ${accountId} FOR NO KEY UPDATE`,
      fire: () => postCommands(persona.ctx, [purchase]),
      whileHeld: async blockerPid => {
        await waitForWaiters(blockerPid, 1);
        expect(await tablesWrittenBy(await soleWaiterOf(blockerPid)), 'the claim row is written before the handler refuses').toContain('command_log');
      },
    });

    const refused = await soleOutcome(response);
    expect(refused, "a 150-coin badge exceeds a fresh account's balance").toMatchObject({ commandId: purchase.commandId, status: 'failed', replayed: false });
    expect(refused.error?.code).toBe('HRO_001');
    expect(await commandLogOf(accountId, purchase.commandId), 'the claim rolled back with the refused command').toEqual([]);
    expect(await countsOf(accountId)).toEqual(countsBefore);
    expect(await mirrorsOf(accountId)).toEqual(mirrorsBefore);

    const [again] = await submitCommands(persona.ctx, [purchase]);
    expect(again, 'nothing was recorded, so the resend runs and is refused again rather than replayed').toMatchObject({ status: 'failed', replayed: false });
    expect(again?.error?.code).toBe('HRO_001');

    const fresh = commandEnvelope('quest.create', dailyQuestDraft(`E2E after refusal ${randomUUID()}`));
    const [created] = await submitCommands(persona.ctx, [fresh]);
    expect(created).toMatchObject({ status: 'applied', replayed: false });
    expect(await commandLogOf(accountId, fresh.commandId)).toEqual([{ type: 'quest.create', status: 'applied' }]);
  });

  /**
   * `progress_counters` is first touched after the completion's grant, so holding its row pauses the command with the event row and
   * the mirror update written but uncommitted. Cancelling that statement aborts the transaction the grant ran in.
   */
  test('should roll back an applied grant with its enclosing transaction, leaving no event row and unmoved mirrors', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'cmd-rollback', onboard: true });
    const accountId = accountIdOf(persona);
    const [warmupQuest, questId] = await createQuests(persona, 2, 'rollback');
    if (!warmupQuest || !questId) throw new Error('quest.create returned too few ids');
    expect(await submitCommands(persona.ctx, [completion(warmupQuest)])).toMatchObject([{ status: 'applied' }]);

    const mirrorsBefore = await mirrorsOf(accountId);
    const countsBefore = await countsOf(accountId);
    const complete = completion(questId);

    const response = await underHeldLock({
      take: async blocker => expect(await blocker`SELECT account_id FROM progress_counters WHERE account_id = ${accountId} FOR UPDATE`).toHaveLength(1),
      fire: () => postCommands(persona.ctx, [complete]),
      whileHeld: async blockerPid => {
        await waitForWaiters(blockerPid, 1);
        const waiter = await soleWaiterOf(blockerPid);
        expect(await tablesWrittenBy(waiter), 'the grant has appended its event and moved the mirrors inside the open transaction').toEqual(
          expect.arrayContaining(['command_log', 'quest_logs', 'hero_events', 'accounts']),
        );
        const [cancel] = await memoirDb()<{ cancelled: boolean }[]>`SELECT pg_cancel_backend(${waiter}::int) AS cancelled`;
        expect(cancel?.cancelled).toBe(true);
      },
    });

    expect(response.status(), `a statement cancelled mid-transaction surfaces as an internal error — ${await response.text()}`).toBe(500);
    expect(await commandLogOf(accountId, complete.commandId)).toEqual([]);
    expect(await questLogIdsOf(accountId, questId)).toEqual([]);
    expect(await countsOf(accountId), 'no event row outlived the rollback').toEqual(countsBefore);
    expect(await mirrorsOf(accountId), 'the mirrors are exactly where they were').toEqual(mirrorsBefore);

    const [retried] = await submitCommands(persona.ctx, [complete]);
    expect(retried, 'the aborted id was never claimed, so it applies afresh').toMatchObject({ status: 'applied', replayed: false });
    const event = eventFor(await heroEventsOf(accountId), retried?.result['logId']);
    expect(event?.xpDelta).toBe(retried?.result['xpAwarded']);
    expect(BigInt((await mirrorsOf(accountId)).totalXp)).toBe(BigInt(mirrorsBefore.totalXp) + BigInt(event?.xpDelta ?? 0));
    await expectMirrorsMatchLedger(accountId);
  });
});

test.describe('memoir hero ledger', () => {
  test('should append the event row and move the stat mirrors in one transaction, stamped with the active ruleset version', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'ledger-atomic', onboard: true });
    const accountId = accountIdOf(persona);
    const [questId] = await createQuests(persona, 1, 'ledger');
    if (!questId) throw new Error('quest.create returned no id');
    const before = await mirrorsOf(accountId);
    const complete = completion(questId);

    const [outcome] = await submitCommands(persona.ctx, [complete]);
    expect(outcome).toMatchObject({ status: 'applied', replayed: false });
    const result = outcome?.result ?? {};
    const logId = String(result['logId']);

    const event = eventFor(await heroEventsOf(accountId), logId);
    expect(event).toEqual({
      id: expect.any(String),
      dedupeKey: `${logId}_xp`,
      type: result['band'] === 'on_time' ? 'quest_complete' : 'quest_late',
      xpDelta: result['xpAwarded'],
      coinsDelta: result['coinsAwarded'],
      statAffinity: 'discipline',
      statDelta: expect.any(Number),
      levelAfter: result['levelAfter'],
      questId,
      questLogId: logId,
      date: todayLocal(),
      rulesetVersion: ACTIVE_RULESET_VERSION,
    });
    if (!event) throw new Error('no hero event for the completion');
    expect(event.xpDelta, 'the grant must move something for the mirror check to mean anything').toBeGreaterThan(0);
    expect(event.statDelta).toBeGreaterThan(0);

    const [questLog] = await memoirDb()<{ rulesetVersion: number }[]>`SELECT ruleset_version AS "rulesetVersion" FROM quest_logs WHERE id = ${logId}`;
    expect(questLog?.rulesetVersion).toBe(ACTIVE_RULESET_VERSION);

    const after = await mirrorsOf(accountId);
    expect(after).toEqual({
      ...before,
      totalXp: String(BigInt(before.totalXp) + BigInt(event.xpDelta)),
      coins: before.coins + event.coinsDelta,
      discipline: before.discipline + event.statDelta,
      level: event.levelAfter,
    });
    await expectMirrorsMatchLedger(accountId);

    const transaction = await xminOf('hero_events', event.id);
    expect(
      {
        accounts: await xminOf('accounts', accountId),
        questLog: await xminOf('quest_logs', logId),
        commandLog: await commandLogXmin(accountId, complete.commandId),
      },
      'the event row, the mirror update, the quest log and the command record were written by one transaction',
    ).toEqual({ accounts: transaction, questLog: transaction, commandLog: transaction });

    const wire = (await pullFullDelta(persona.ctx)).domains['hero_events']?.find(row => String(row['id']) === event.id);
    expect(wire).toMatchObject({ dedupeKey: event.dedupeKey, xpDelta: event.xpDelta, coinsDelta: event.coinsDelta, statDelta: event.statDelta });
    expect(await getAccount(persona.ctx)).toMatchObject({ totalXp: after.totalXp, coins: after.coins, level: after.level });
  });

  test('should append exactly one level_up right after the grant that crosses level 2, and not duplicate an already-recorded level-up', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'ledger-levelup', onboard: true });
    const accountId = accountIdOf(persona);
    expect(await mirrorsOf(accountId)).toMatchObject({ level: 1, totalXp: '0' });
    const questIds = await createQuests(persona, LEVEL_UP_COMPLETIONS + 1, 'level');
    const replayQuest = questIds.pop();
    if (!replayQuest) throw new Error('quest.create returned no ids');

    const outcomes = await submitCommands(
      persona.ctx,
      questIds.map(questId => completion(questId)),
    );
    expect(outcomes.map(outcome => outcome.status)).toEqual(questIds.map(() => 'applied'));

    const crossing = crossingIndexOf(outcomes, LEVEL_TWO_XP);
    expect(crossing, `${LEVEL_UP_COMPLETIONS} completions must reach ${LEVEL_TWO_XP} XP`).toBeGreaterThan(0);
    expect(outcomes.map(outcome => outcome.result['leveledUp'])).toEqual(outcomes.map((_, index) => index === crossing));
    expect(outcomes.map(outcome => outcome.result['levelAfter'])).toEqual(outcomes.map((_, index) => (index < crossing ? 1 : 2)));

    const events = await heroEventsOf(accountId);
    const levelUps = events.filter(event => event.type === 'level_up');
    expect(levelUps).toEqual([
      {
        id: expect.any(String),
        dedupeKey: 'levelup_2',
        type: 'level_up',
        xpDelta: 0,
        coinsDelta: 0,
        statAffinity: null,
        statDelta: 0,
        levelAfter: 2,
        questId: null,
        questLogId: null,
        date: todayLocal(),
        rulesetVersion: ACTIVE_RULESET_VERSION,
      },
    ]);
    const [levelUp] = levelUps;
    if (!levelUp) throw new Error('no level_up event');
    const crossingEvent = eventFor(events, outcomes[crossing]?.result['logId']);
    expect(crossingEvent?.levelAfter).toBe(2);
    expect(events[events.indexOf(levelUp) - 1], 'the level-up is appended directly after the grant that crossed the threshold').toEqual(crossingEvent);
    expect(await xminOf('hero_events', levelUp.id), 'in the same transaction as that grant').toBe(await xminOf('hero_events', crossingEvent?.id ?? '0'));
    expect((await mirrorsOf(accountId)).level).toBe(2);

    // Rewinding only the level mirror makes the next grant re-derive the crossing to level 2, whose event is already recorded.
    await memoirDb()`UPDATE accounts SET level = 1 WHERE id = ${accountId}`;
    const [rederived] = await submitCommands(persona.ctx, [completion(replayQuest)]);
    expect(rederived).toMatchObject({ status: 'applied', result: { levelAfter: 2 } });

    const eventsAfter = await heroEventsOf(accountId);
    expect(
      eventsAfter.filter(event => event.type === 'level_up'),
      'the re-derived level-up converges on the recorded one',
    ).toEqual([levelUp]);
    expect(eventFor(eventsAfter, rederived?.result['logId'])?.levelAfter).toBe(2);
    expect((await mirrorsOf(accountId)).level).toBe(2);
    await expectMirrorsMatchLedger(accountId);
  });
});
