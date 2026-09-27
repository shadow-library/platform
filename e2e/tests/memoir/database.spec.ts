/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

/**
 * Importing user defined packages
 */
import { memoirDb, pollUntil } from '../../lib';
import { expect, test } from './fixtures';
import { createDailyQuest, dailyQuestDraft, type DeltaPage, getAccount, memoirMutate, pullFullDelta, submitCommand, todayLocal, waitersBlockedBy } from './helpers';

/**
 * Defining types
 */

interface CheckCase {
  readonly label: string;
  readonly constraint: string;
  readonly column: string;
  readonly value: number;
}

interface OneRowPerKeyCase {
  readonly label: string;
  readonly constraint: string;
  readonly needsQuest: boolean;
  readonly insert: (accountId: string, questId: string, date: string) => Promise<unknown>;
}

/**
 * Declaring the constants
 *
 * Schema-level invariants verified directly against `apps/memoir-server/generated/drizzle/0000_abandoned_malcolm_colcord.sql`
 * (plus 0004's `reschedule_events` migration) via raw SQL on `memoirDb()`, asserting on constraint NAMES and SQLSTATEs rather
 * than application error codes — these guarantees hold independent of any handler that happens to sit in front of them.
 */

const CHECK_CASES: readonly CheckCase[] = [
  { label: 'level below 1', constraint: 'accounts_level_check', column: 'level', value: 0 },
  { label: 'negative total_xp', constraint: 'accounts_total_xp_check', column: 'total_xp', value: -1 },
  { label: 'negative coins', constraint: 'accounts_coins_check', column: 'coins', value: -1 },
  { label: 'negative stat_discipline', constraint: 'accounts_stat_discipline_check', column: 'stat_discipline', value: -1 },
  { label: 'negative stat_body', constraint: 'accounts_stat_body_check', column: 'stat_body', value: -1 },
  { label: 'negative stat_wealth', constraint: 'accounts_stat_wealth_check', column: 'stat_wealth', value: -1 },
  { label: 'negative stat_mind', constraint: 'accounts_stat_mind_check', column: 'stat_mind', value: -1 },
  { label: 'negative ocr_quota_count', constraint: 'accounts_ocr_quota_count_check', column: 'ocr_quota_count', value: -1 },
  { label: 'schedule_start_min above 1439', constraint: 'accounts_schedule_start_min_check', column: 'schedule_start_min', value: 1440 },
  { label: 'schedule_end_min below 0', constraint: 'accounts_schedule_end_min_check', column: 'schedule_end_min', value: -1 },
  { label: 'week_start above 6', constraint: 'accounts_week_start_check', column: 'week_start', value: 7 },
  { label: 'negative pending_returner_shields', constraint: 'accounts_pending_returner_shields_check', column: 'pending_returner_shields', value: -1 },
];

const ONE_ROW_PER_KEY_CASES: readonly OneRowPerKeyCase[] = [
  {
    label: 'recovery_quests one row per (account, date)',
    constraint: 'recovery_quests_account_id_date_unique',
    needsQuest: false,
    insert: (accountId, _questId, date) =>
      memoirDb()`INSERT INTO recovery_quests (account_id, date, source_quest_name, expires_at) VALUES (${accountId}, ${date}, 'E2E db-7 recovery', now() + interval '1 day')`,
  },
  {
    label: 'comeback_events one row per (account, date, kind)',
    constraint: 'comeback_events_account_id_date_kind_unique',
    needsQuest: false,
    insert: (accountId, _questId, date) =>
      memoirDb()`INSERT INTO comeback_events (account_id, date, kind, intensity_mode) VALUES (${accountId}, ${date}, 'armed'::comeback_event_kind, 'standard'::intensity_mode)`,
  },
  {
    label: 'returner_events one row per (account, date)',
    constraint: 'returner_events_account_id_date_unique',
    needsQuest: false,
    insert: (accountId, _questId, date) =>
      memoirDb()`INSERT INTO returner_events (account_id, date, return_date, days_absent, intensity_mode) VALUES (${accountId}, ${date}, ${date}, 5, 'standard'::intensity_mode)`,
  },
  {
    label: 'shield_consumptions one row per (account, quest, date)',
    constraint: 'shield_consumptions_account_id_quest_id_date_unique',
    needsQuest: true,
    insert: (accountId, questId, date) => memoirDb()`INSERT INTO shield_consumptions (account_id, quest_id, date) VALUES (${accountId}, ${questId}, ${date})`,
  },
  {
    label: 'achievements_earned one row per (account, achievement)',
    constraint: 'achievements_earned_account_id_achievement_id_unique',
    needsQuest: false,
    insert: accountId => memoirDb()`INSERT INTO achievements_earned (account_id, achievement_id) VALUES (${accountId}, 'e2e-db7-achievement')`,
  },
  {
    label: 'titles_earned one row per (account, title)',
    constraint: 'titles_earned_account_id_title_id_unique',
    needsQuest: false,
    insert: accountId => memoirDb()`INSERT INTO titles_earned (account_id, title_id) VALUES (${accountId}, 'e2e-db7-title')`,
  },
];

/** Turns a rejection into its resolved value, so a constraint violation can be asserted on rather than caught. */
async function captureError(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

/**
 * Sets `column` to a CHECK-violating `value` on an already fixture-tracked account via a dynamic column name — the
 * column always comes from {@link CHECK_CASES}, never from input. Updating a tracked row rather than inserting a
 * fresh one means a loosened constraint can never leak an untracked `accounts` row: the account is deleted by the
 * `memoir` fixture's teardown regardless of whether this update is rejected.
 */
async function violateAccountCheck(accountId: string, column: string, value: number): Promise<unknown> {
  return captureError(memoirDb().unsafe(`UPDATE accounts SET ${column} = $1 WHERE id = $2`, [value, accountId]));
}

/** A minimal `quests` row owned by `accountId`, for tests that need a real quest id to satisfy a foreign key. */
async function insertQuest(accountId: string, name: string): Promise<string> {
  const sql = memoirDb();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO quests (account_id, name, duration_min, stat_affinity, strictness, recurrence)
    VALUES (${accountId}, ${name}, 15, 'discipline'::stat_affinity, 'routine'::strictness, ${sql.json({})})
    RETURNING id::text
  `;
  if (!row) throw new Error(`quest insert for account ${accountId} returned no row`);
  return row.id;
}

function insertHeroEvent(accountId: string, dedupeKey: string, type: string, xpDelta: number, coinsDelta: number): Promise<unknown> {
  return memoirDb()`
    INSERT INTO hero_events (account_id, dedupe_key, type, date, ruleset_version, xp_delta, coins_delta)
    VALUES (${accountId}, ${dedupeKey}, ${type}::hero_event_type, ${todayLocal()}, 1, ${xpDelta}, ${coinsDelta})
  `;
}

function rowsOf(delta: DeltaPage, domain: string): Record<string, unknown>[] {
  return delta.domains[domain] ?? [];
}

/** Every table's `sync_seq` `column_default`, keyed by table name — the literal default text reveals whether two tables share one sequence object. */
async function syncSeqColumnDefaults(): Promise<Map<string, string | null>> {
  const rows = await memoirDb()<{ tableName: string; columnDefault: string | null }[]>`
    SELECT table_name AS "tableName", column_default AS "columnDefault"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'sync_seq'
  `;
  return new Map(rows.map(row => [row.tableName, row.columnDefault]));
}

test.describe('accounts defaults and constraints (memoir-db-2)', () => {
  test('should apply the documented defaults on a bare accounts insert', async ({ memoir }) => {
    const account = await memoir.disposableAccount('defaults');
    const [row] = await memoirDb()<Record<string, unknown>[]>`
      SELECT
        level, total_xp::text AS "totalXp", coins, stat_discipline AS "statDiscipline", stat_body AS "statBody",
        stat_wealth AS "statWealth", stat_mind AS "statMind", hp_today AS "hpToday", hp_start_today AS "hpStartToday",
        hp_max AS "hpMax", warmth_state::text AS "warmthState", ocr_quota_count AS "ocrQuotaCount",
        schedule_start_min AS "scheduleStartMin", schedule_end_min AS "scheduleEndMin", week_start AS "weekStart",
        intensity_mode::text AS "intensityMode", theme::text AS "theme", deletion_state::text AS "deletionState",
        pending_returner_shields AS "pendingReturnerShields", returner_threshold_days AS "returnerThresholdDays",
        feature_flags AS "featureFlags", notification_prefs AS "notificationPrefs"
      FROM accounts WHERE id = ${account.id}
    `;
    expect(row).toMatchObject({
      level: 1,
      totalXp: '0',
      coins: 0,
      statDiscipline: 0,
      statBody: 0,
      statWealth: 0,
      statMind: 0,
      hpToday: 0,
      hpStartToday: 0,
      hpMax: 0,
      warmthState: 'cold',
      ocrQuotaCount: 0,
      scheduleStartMin: 360,
      scheduleEndMin: 1380,
      weekStart: 1,
      intensityMode: 'standard',
      theme: 'system',
      deletionState: 'none',
      pendingReturnerShields: 0,
      returnerThresholdDays: 7,
      featureFlags: {},
      notificationPrefs: {},
    });
  });

  test('should reject a duplicate identity_sub via accounts_identity_sub_unique', async ({ memoir }) => {
    const account = await memoir.disposableAccount('dup-sub');
    const duplicate = await captureError(
      memoirDb()`INSERT INTO accounts (identity_sub, auth_provider, default_currency, enabled_currencies, timezone) VALUES (${account.identitySub}, 'google', 'USD', ARRAY['USD']::char(3)[], 'UTC')`,
    );
    expect(duplicate).toMatchObject({ code: '23505', constraint_name: 'accounts_identity_sub_unique' });
    const rows = await memoirDb()`SELECT count(*)::int AS count FROM accounts WHERE identity_sub = ${account.identitySub}`;
    expect(rows[0]?.['count']).toBe(1);
  });

  for (const check of CHECK_CASES) {
    test(`should reject accounts.${check.column} via ${check.constraint} (${check.label})`, async ({ memoir }) => {
      const account = await memoir.disposableAccount('check-violation');
      const violation = await violateAccountCheck(account.id, check.column, check.value);
      expect(violation, `expected a CHECK violation for ${check.label}`).toMatchObject({ code: '23514', constraint_name: check.constraint });
    });
  }
});

test.describe('hero_events invariants (memoir-db-3)', () => {
  test('should reject a replayed dedupe key via hero_events_account_id_dedupe_key_unique', async ({ memoir }) => {
    const account = await memoir.disposableAccount('hero-dedupe');
    const dedupeKey = `e2e-dedupe-${randomUUID()}`;
    await insertHeroEvent(account.id, dedupeKey, 'quest_complete', 10, 5);
    const duplicate = await captureError(insertHeroEvent(account.id, dedupeKey, 'quest_complete', 10, 5));
    expect(duplicate).toMatchObject({ code: '23505', constraint_name: 'hero_events_account_id_dedupe_key_unique' });
    const rows = await memoirDb()`SELECT count(*)::int AS count FROM hero_events WHERE account_id = ${account.id} AND dedupe_key = ${dedupeKey}`;
    expect(rows[0]?.['count']).toBe(1);
  });

  test('should reject a negative coins_delta unless the event type is coin_spend', async ({ memoir }) => {
    const account = await memoir.disposableAccount('hero-coins-check');
    const rejected = await captureError(insertHeroEvent(account.id, `e2e-coins-${randomUUID()}`, 'quest_complete', 0, -5));
    expect(rejected).toMatchObject({ code: '23514', constraint_name: 'hero_events_coins_delta_check' });

    const spendKey = `e2e-coins-spend-${randomUUID()}`;
    await insertHeroEvent(account.id, spendKey, 'coin_spend', 0, -5);
    const rows = await memoirDb()`SELECT coins_delta AS "coinsDelta" FROM hero_events WHERE account_id = ${account.id} AND dedupe_key = ${spendKey}`;
    expect(rows[0]).toMatchObject({ coinsDelta: -5 });
  });

  test('should always reject a negative xp_delta, even for coin_spend', async ({ memoir }) => {
    const account = await memoir.disposableAccount('hero-xp-check');
    const rejected = await captureError(insertHeroEvent(account.id, `e2e-xp-${randomUUID()}`, 'coin_spend', -1, -5));
    expect(rejected).toMatchObject({ code: '23514', constraint_name: 'hero_events_xp_delta_check' });
  });
});

test.describe('quest_logs duplicate occurrence (memoir-db-4)', () => {
  test('should raise a raw violation for a duplicate (account, quest, date) with no conflict handling', async ({ memoir }) => {
    const account = await memoir.disposableAccount('quest-log-dup');
    const questId = await insertQuest(account.id, 'E2E db-4 quest');
    const date = todayLocal();
    const insert = () => memoirDb()`
      INSERT INTO quest_logs (account_id, quest_id, date, state, stat_affinity, strictness, intensity_mode_at_log, crown_slice_weight, ruleset_version)
      VALUES (${account.id}, ${questId}, ${date}, 'completed'::quest_log_state, 'discipline'::stat_affinity, 'routine'::strictness, 'standard'::intensity_mode, 1.00, 1)
    `;
    await insert();
    const duplicate = await captureError(insert());
    expect(duplicate).toMatchObject({ code: '23505', constraint_name: 'quest_logs_account_id_quest_id_date_unique' });
  });
});

test.describe('daily_states concurrent insert (memoir-db-5)', () => {
  /**
   * The overlap is proven, not assumed: the first insert is held open on a reserved connection until the racing
   * insert is observably queued behind it (`pg_blocking_pids`), only then does the first commit — at which point
   * the racer, having genuinely waited on the uncommitted row, resolves into a primary-key violation.
   */
  test('should let exactly one of two overlapping raw inserts for the same (account, date) survive', async ({ memoir }) => {
    const account = await memoir.disposableAccount('daily-states-race');
    const sql = memoirDb();
    const date = todayLocal();
    const blocker = await sql.reserve();
    let committed = false;
    let racer: Promise<unknown> | undefined;
    try {
      await blocker`BEGIN`;
      const [backend] = await blocker<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      if (!backend) throw new Error('pg_backend_pid() returned no row');
      await blocker`
        INSERT INTO daily_states (account_id, date, intensity_mode, hp_start, hp_end, hp_max, crown_period_start, ruleset_version)
        VALUES (${account.id}, ${date}, 'standard'::intensity_mode, 0, 0, 0, ${date}, 1)
      `;
      racer = captureError(sql`
        INSERT INTO daily_states (account_id, date, intensity_mode, hp_start, hp_end, hp_max, crown_period_start, ruleset_version)
        VALUES (${account.id}, ${date}, 'standard'::intensity_mode, 0, 0, 0, ${date}, 1)
      `);
      const waiting = await pollUntil(
        () => waitersBlockedBy(backend.pid),
        waiters => waiters >= 1,
        { timeoutMs: 10_000, intervalMs: 50 },
      );
      expect(waiting, 'the racing insert must queue behind the uncommitted row before either resolves').toBe(1);
      await blocker`COMMIT`;
      committed = true;
    } finally {
      if (!committed) await blocker`ROLLBACK`.catch(() => undefined);
      blocker.release();
    }

    const raceResult = await racer;
    expect(raceResult).toMatchObject({ code: '23505', constraint_name: 'daily_states_account_id_date_pk' });
    const rows = await sql`SELECT count(*)::int AS count FROM daily_states WHERE account_id = ${account.id} AND date = ${date}`;
    expect(rows[0]?.['count']).toBe(1);
  });
});

test.describe('game-schema constraints (memoir-db-6)', () => {
  test('should reject a duplicate reschedule_events row via reschedule_events_account_id_quest_id_date_unique', async ({ memoir }) => {
    const account = await memoir.disposableAccount('reschedule-dup');
    const questId = await insertQuest(account.id, 'E2E db-6 reschedule quest');
    const date = todayLocal();
    const insert = () => memoirDb()`INSERT INTO reschedule_events (account_id, quest_id, date, to_min) VALUES (${account.id}, ${questId}, ${date}, 600)`;
    await insert();
    const duplicate = await captureError(insert());
    expect(duplicate).toMatchObject({ code: '23505', constraint_name: 'reschedule_events_account_id_quest_id_date_unique' });
  });

  test('should reject reschedule_events.from_min outside 0-1439 via reschedule_events_from_min_check', async ({ memoir }) => {
    const account = await memoir.disposableAccount('reschedule-from-check');
    const questId = await insertQuest(account.id, 'E2E db-6 reschedule from-min quest');
    const violation = await captureError(
      memoirDb()`INSERT INTO reschedule_events (account_id, quest_id, date, from_min, to_min) VALUES (${account.id}, ${questId}, ${todayLocal()}, 1440, 600)`,
    );
    expect(violation).toMatchObject({ code: '23514', constraint_name: 'reschedule_events_from_min_check' });
  });

  test('should reject reschedule_events.to_min outside 0-1439 via reschedule_events_to_min_check', async ({ memoir }) => {
    const account = await memoir.disposableAccount('reschedule-to-check');
    const questId = await insertQuest(account.id, 'E2E db-6 reschedule to-min quest');
    const violation = await captureError(
      memoirDb()`INSERT INTO reschedule_events (account_id, quest_id, date, from_min, to_min) VALUES (${account.id}, ${questId}, ${todayLocal()}, 480, -1)`,
    );
    expect(violation).toMatchObject({ code: '23514', constraint_name: 'reschedule_events_to_min_check' });
  });

  test('should accept a reschedule_events row with from_min/to_min inside the valid 0-1439 range', async ({ memoir }) => {
    const account = await memoir.disposableAccount('reschedule-valid');
    const questId = await insertQuest(account.id, 'E2E db-6 reschedule valid quest');
    const rows = await memoirDb()<{ fromMin: number | null; toMin: number }[]>`
      INSERT INTO reschedule_events (account_id, quest_id, date, from_min, to_min) VALUES (${account.id}, ${questId}, ${todayLocal()}, 480, 600)
      RETURNING from_min AS "fromMin", to_min AS "toMin"
    `;
    expect(rows[0]).toEqual({ fromMin: 480, toMin: 600 });
  });

  test('should reject a repeat cosmetic purchase via cosmetic_unlocks_account_id_cosmetic_id_unique', async ({ memoir }) => {
    const account = await memoir.disposableAccount('cosmetic-dup');
    const cosmeticId = `e2e-cosmetic-${randomUUID()}`;
    const insert = () => memoirDb()`INSERT INTO cosmetic_unlocks (account_id, cosmetic_id, kind, source) VALUES (${account.id}, ${cosmeticId}, 'hat', 'coin'::cosmetic_source)`;
    await insert();
    const duplicate = await captureError(insert());
    expect(duplicate).toMatchObject({ code: '23505', constraint_name: 'cosmetic_unlocks_account_id_cosmetic_id_unique' });
  });

  test('should reject a second quest_streaks row for the same (account, quest) via its composite primary key', async ({ memoir }) => {
    const account = await memoir.disposableAccount('streak-dup');
    const questId = await insertQuest(account.id, 'E2E db-6 streak quest');
    const insert = () => memoirDb()`INSERT INTO quest_streaks (account_id, quest_id) VALUES (${account.id}, ${questId})`;
    await insert();
    const duplicate = await captureError(insert());
    expect(duplicate).toMatchObject({ code: '23505', constraint_name: 'quest_streaks_account_id_quest_id_pk' });
  });

  test('should reject quest_streaks.shields_available above its per-quest cap via quest_streaks_shields_available_check', async ({ memoir }) => {
    const account = await memoir.disposableAccount('streak-cap');
    const questId = await insertQuest(account.id, 'E2E db-6 streak cap quest');
    const violation = await captureError(memoirDb()`INSERT INTO quest_streaks (account_id, quest_id, shields_available) VALUES (${account.id}, ${questId}, 3)`);
    expect(violation).toMatchObject({ code: '23514', constraint_name: 'quest_streaks_shields_available_check' });
  });
});

test.describe('one-row-per-key uniqueness (memoir-db-7)', () => {
  for (const testCase of ONE_ROW_PER_KEY_CASES) {
    test(`should enforce ${testCase.label} via ${testCase.constraint}`, async ({ memoir }) => {
      const account = await memoir.disposableAccount('one-row-per-key');
      const questId = testCase.needsQuest ? await insertQuest(account.id, `E2E db-7 ${testCase.constraint} quest`) : '';
      const date = todayLocal();
      await testCase.insert(account.id, questId, date);
      const duplicate = await captureError(testCase.insert(account.id, questId, date));
      expect(duplicate, testCase.label).toMatchObject({ code: '23505', constraint_name: testCase.constraint });
    });
  }
});

test.describe('shared sync_seq sequence (memoir-db-8)', () => {
  /**
   * Two proofs, not one: `information_schema.columns` first confirms `daily_states`, `quests`, `quest_logs`,
   * `hero_events` and `deleted_records` all default `sync_seq` from the literal same sequence object
   * (`nextval('sync_seq'::regclass)`) — that is the sharing itself. The API-driven ordering check below then shows
   * that shared default is load-bearing at runtime: touching four different tables in a fixed order and observing
   * their sync_seq values increase in that same cross-table order, which independent per-table counters could not
   * guarantee even if each happened to be named the same.
   */
  test("should draw every syncable domain's sync_seq, and deleted_records' tombstone sync_seq, from one shared increasing sequence", async ({ memoir }) => {
    const SYNC_SEQ_TABLES = ['daily_states', 'quests', 'quest_logs', 'hero_events', 'deleted_records'] as const;
    const columnDefaults = await syncSeqColumnDefaults();
    for (const table of SYNC_SEQ_TABLES) expect(columnDefaults.get(table), `${table}.sync_seq must default from the shared sequence`).toBe("nextval('sync_seq'::regclass)");

    const persona = await memoir.persona({ label: 'sync-seq', onboard: true });
    const today = todayLocal();

    const initialDelta = await pullFullDelta(persona.ctx);
    const dailyStateRow = rowsOf(initialDelta, 'daily_states')[0];
    expect(dailyStateRow, "today's daily_states row must exist after the account's first delta pull").toBeDefined();
    const dailyStateSeq = BigInt(String(dailyStateRow?.['syncSeq']));
    expect(dailyStateSeq).toBeGreaterThan(0n);

    const { questId } = await createDailyQuest(persona.ctx, `E2E db-8 quest ${randomUUID()}`);
    const completion = await submitCommand(persona.ctx, 'quest.complete', { occurrenceId: `${questId}:${today}` });
    expect(completion.status).toBe('applied');

    const deviceId = randomUUID();
    expect((await memoirMutate(persona.ctx, 'put', `/api/v1/account/devices/${deviceId}`, { data: { userAgent: 'e2e-db8', pushOptIn: false } })).status()).toBe(200);
    expect((await memoirMutate(persona.ctx, 'delete', `/api/v1/account/devices/${deviceId}`)).status()).toBe(204);

    const delta = await pullFullDelta(persona.ctx);
    const questRow = rowsOf(delta, 'quests').find(row => String(row['id']) === questId);
    const questLogSeqs = rowsOf(delta, 'quest_logs')
      .filter(row => String(row['questId']) === questId)
      .map(row => BigInt(String(row['syncSeq'])));
    const heroSeqs = rowsOf(delta, 'hero_events')
      .filter(row => String(row['questId']) === questId)
      .map(row => BigInt(String(row['syncSeq'])));
    const tombstone = delta.tombstones.find(t => t.domain === 'devices' && t.recordId === deviceId);

    expect(questRow, 'the created quest must appear in the delta').toBeDefined();
    const questSeq = BigInt(String(questRow?.['syncSeq']));
    expect(questSeq).toBeGreaterThan(0n);
    expect(questLogSeqs.length, 'the completion must have produced a quest_logs row').toBeGreaterThan(0);
    expect(heroSeqs.length, 'the completion must have produced at least one hero_events row').toBeGreaterThan(0);
    expect(tombstone, 'the device delete must have produced a tombstone').toBeDefined();

    expect(dailyStateSeq, "today's rollover row, created first, must carry a lower sync_seq than the quest created after it").toBeLessThan(questSeq);
    for (const seq of [...questLogSeqs, ...heroSeqs]) expect(seq, 'the completion rows must carry a higher sync_seq than the quest they belong to').toBeGreaterThan(questSeq);
    const latestCompletionSeq = [...questLogSeqs, ...heroSeqs].reduce((max, seq) => (seq > max ? seq : max));
    expect(BigInt(String(tombstone?.syncSeq)), 'the tombstone, created last, must carry the highest sync_seq of the whole flow').toBeGreaterThan(latestCompletionSeq);
  });
});

test.describe('accounts cascade delete (memoir-db-9)', () => {
  /** The account under test uploads nothing (only a device + a command), so its raw removal cannot orphan a storage object. */
  test('should cascade-delete devices and command_log rows when the owning accounts row is removed', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'cascade', onboard: true });
    const account = await getAccount(persona.ctx);
    const deviceId = randomUUID();
    expect((await memoirMutate(persona.ctx, 'put', `/api/v1/account/devices/${deviceId}`, { data: { userAgent: 'e2e-db9', pushOptIn: false } })).status()).toBe(200);
    const outcome = await submitCommand(persona.ctx, 'quest.create', dailyQuestDraft('E2E db-9 quest'));
    expect(outcome.status).toBe('applied');

    const sql = memoirDb();
    const before = await sql<{ devices: number; commands: number }[]>`
      SELECT
        (SELECT count(*)::int FROM devices WHERE account_id = ${account.id}) AS devices,
        (SELECT count(*)::int FROM command_log WHERE account_id = ${account.id}) AS commands
    `;
    expect(before[0]).toEqual({ devices: 1, commands: 1 });

    await sql`DELETE FROM accounts WHERE id = ${account.id}`;

    const after = await sql<{ accounts: number; devices: number; commands: number }[]>`
      SELECT
        (SELECT count(*)::int FROM accounts WHERE id = ${account.id}) AS accounts,
        (SELECT count(*)::int FROM devices WHERE account_id = ${account.id}) AS devices,
        (SELECT count(*)::int FROM command_log WHERE account_id = ${account.id}) AS commands
    `;
    expect(after[0]).toEqual({ accounts: 0, devices: 0, commands: 0 });
  });
});
