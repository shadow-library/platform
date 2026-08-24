import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { Module, ShadowApplication } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { accounts, DatastoreModule, heroEvents, type PrimaryDatabase, quests } from '@server/database';
import { TEST_ROLE_PASSWORD } from '@tests/fixtures/seed';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

@Module({ imports: [DatastoreModule] })
class RoleGrantsTestModule {}

const INSUFFICIENT_PRIVILEGE = '42501';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_role_grants_spec`;

/** The template-seed hook (`tests/fixtures/seed.ts`) sets this fixed test-only password; each real environment's password lives in its own SOPS secret, applied out of band (T-04). */
function roleUrl(role: string, database = databaseName): string {
  const { protocol, hostname, port } = new URL(baseConnectionString);
  return `${protocol}//${role}:${TEST_ROLE_PASSWORD}@${hostname}:${port}/${database}`;
}

async function expectDenied(query: Promise<unknown>): Promise<void> {
  let thrown: unknown;
  await query.catch(error => (thrown = error));
  expect(thrown).toBeDefined();
  expect((thrown as { errno?: string }).errno).toBe(INSUFFICIENT_PRIVILEGE);
}

describe('DB roles & grants (T-14, ARCHITECTURE §5.4/§10.4/§28.4)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let databaseService: DatabaseService;
  let db: PrimaryDatabase;
  let accountId: bigint;
  let questId: bigint;

  const apiSql = new SQL(roleUrl('memoir_api'));
  const aiSql = new SQL(roleUrl('memoir_ai'));
  const billingSql = new SQL(roleUrl('memoir_billing'));
  const deleterSql = new SQL(roleUrl('memoir_deleter'));

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = new ShadowApplication(RoleGrantsTestModule);
    await app.init();
    databaseService = app.get(DatabaseService);
    db = databaseService.getPostgresClient() as PrimaryDatabase;

    const [account] = await databaseService.run(() =>
      db
        .insert(accounts)
        .values({ identitySub: 'sub-role-grants', authProvider: 'google', defaultCurrency: 'USD', enabledCurrencies: ['USD'], timezone: 'UTC' })
        .returning(),
    );
    if (!account) throw new Error('account insert failed');
    accountId = account.id;

    const [quest] = await databaseService.run(() =>
      db.insert(quests).values({ accountId, name: 'Morning run', durationMin: 30, statAffinity: 'body', strictness: 'routine', recurrence: {} }).returning(),
    );
    if (!quest) throw new Error('quest insert failed');
    questId = quest.id;
  });

  afterAll(async () => {
    await Promise.all([apiSql.close(), aiSql.close(), billingSql.close(), deleterSql.close()]);
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should let memoir_api perform normal CRUD on a mutable user-facing table (quests)', async () => {
    const [inserted] =
      await apiSql`INSERT INTO quests (account_id, name, duration_min, stat_affinity, strictness, recurrence) VALUES (${accountId}, 'Evening walk', 20, 'body', 'routine', '{}') RETURNING id`;
    expect(inserted).toBeDefined();

    const updated = await apiSql`UPDATE quests SET name = 'Evening walk (renamed)' WHERE id = ${inserted.id} RETURNING id`;
    expect(updated).toHaveLength(1);

    const deleted = await apiSql`DELETE FROM quests WHERE id = ${inserted.id} RETURNING id`;
    expect(deleted).toHaveLength(1);
  });

  it('should deny memoir_api UPDATE on every append-only table', async () => {
    await expectDenied(apiSql`UPDATE hero_events SET note = 'x' WHERE account_id = ${accountId}`);
    await expectDenied(apiSql`UPDATE reschedule_events SET to_min = 0 WHERE account_id = ${accountId}`);
    await expectDenied(apiSql`UPDATE comeback_events SET xp_bonus = 0 WHERE account_id = ${accountId}`);
    await expectDenied(apiSql`UPDATE returner_events SET days_absent = 0 WHERE account_id = ${accountId}`);
    await expectDenied(apiSql`UPDATE shield_consumptions SET date = now() WHERE account_id = ${accountId}`);
    await expectDenied(apiSql`UPDATE achievements_earned SET earned_at = now() WHERE account_id = ${accountId}`);
    await expectDenied(apiSql`UPDATE titles_earned SET earned_at = now() WHERE account_id = ${accountId}`);
    await expectDenied(apiSql`UPDATE cosmetic_unlocks SET source = 'coin' WHERE account_id = ${accountId}`);
  });

  it('should deny memoir_api DELETE on every append-only table', async () => {
    await expectDenied(apiSql`DELETE FROM hero_events WHERE account_id = ${accountId}`);
    await expectDenied(apiSql`DELETE FROM reschedule_events WHERE account_id = ${accountId}`);
    await expectDenied(apiSql`DELETE FROM comeback_events WHERE account_id = ${accountId}`);
    await expectDenied(apiSql`DELETE FROM returner_events WHERE account_id = ${accountId}`);
    await expectDenied(apiSql`DELETE FROM shield_consumptions WHERE account_id = ${accountId}`);
    await expectDenied(apiSql`DELETE FROM achievements_earned WHERE account_id = ${accountId}`);
    await expectDenied(apiSql`DELETE FROM titles_earned WHERE account_id = ${accountId}`);
    await expectDenied(apiSql`DELETE FROM cosmetic_unlocks WHERE account_id = ${accountId}`);
  });

  it('should let memoir_api INSERT + SELECT hero_events (append-only, worker-writes-hero-state stays impossible only for writes it never gets)', async () => {
    const inserted =
      await apiSql`INSERT INTO hero_events (account_id, dedupe_key, type, xp_delta, coins_delta, date, note, ruleset_version) VALUES (${accountId}, 'dk-1', 'quest_complete', 10, 5, now(), '', 1) RETURNING id`;
    expect(inserted).toHaveLength(1);
    const selected = await apiSql`SELECT id FROM hero_events WHERE account_id = ${accountId}`;
    expect(selected.length).toBeGreaterThan(0);
  });

  it('should deny memoir_ai from writing hero state at the SQL layer (worker-writes-hero-state stays impossible)', async () => {
    await expectDenied(
      aiSql`INSERT INTO hero_events (account_id, dedupe_key, type, xp_delta, coins_delta, date, note, ruleset_version) VALUES (${accountId}, 'dk-ai', 'quest_complete', 10, 5, now(), '', 1)`,
    );
    await expectDenied(aiSql`UPDATE hero_events SET note = 'tampered' WHERE account_id = ${accountId}`);
  });

  it('should deny memoir_ai any write to accounts Hero mirror columns', async () => {
    await expectDenied(aiSql`UPDATE accounts SET total_xp = 999 WHERE id = ${accountId}`);
    await expectDenied(aiSql`UPDATE accounts SET level = 99 WHERE id = ${accountId}`);
  });

  it('should deny memoir_ai from reading accounts Hero mirror columns even via SELECT', async () => {
    await expectDenied(aiSql`SELECT total_xp FROM accounts WHERE id = ${accountId}`);
  });

  it('should let memoir_ai read its documented §15.5 scope (profile columns on accounts, full rows on quests)', async () => {
    const account = await aiSql`SELECT id, email, timezone FROM accounts WHERE id = ${accountId}`;
    expect(account).toHaveLength(1);
    const quest = await aiSql`SELECT id, name FROM quests WHERE id = ${questId}`;
    expect(quest).toHaveLength(1);
  });

  it('should deny memoir_billing writing anything outside its entitlement scope (user-role-writes-entitlements stays impossible)', async () => {
    await expectDenied(
      billingSql`INSERT INTO quests (account_id, name, duration_min, stat_affinity, strictness, recurrence) VALUES (${accountId}, 'billing quest', 10, 'body', 'routine', '{}')`,
    );
    await expectDenied(billingSql`UPDATE accounts SET coins = 999 WHERE id = ${accountId}`);
    await expectDenied(billingSql`DELETE FROM quests WHERE id = ${questId}`);
  });

  it('should deny billing role writing quests (billing-writes-quests stays impossible) while limiting its accounts read to (id, identity_sub)', async () => {
    await expectDenied(
      billingSql`INSERT INTO quests (account_id, name, duration_min, stat_affinity, strictness, recurrence) VALUES (${accountId}, 'x', 10, 'body', 'routine', '{}')`,
    );
    await expectDenied(billingSql`SELECT email FROM accounts WHERE id = ${accountId}`);
    const scoped = await billingSql`SELECT id, identity_sub FROM accounts WHERE id = ${accountId}`;
    expect(scoped).toHaveLength(1);
  });

  it('should let memoir_billing write entitlements and append billing_events — the surfaces §5.4 gives it and no others', async () => {
    await billingSql`INSERT INTO entitlements (account_id) VALUES (${accountId}) ON CONFLICT DO NOTHING`;
    const updated = await billingSql`UPDATE entitlements SET tier = 'paid', state = 'active' WHERE account_id = ${accountId} RETURNING account_id`;
    expect(updated).toHaveLength(1);

    const event =
      await billingSql`INSERT INTO billing_events (provider, provider_event_id, account_id, type, payload, occurred_at) VALUES ('generic-hmac', 'evt-grants-1', ${accountId}, 'subscription.activated', '{}', now()) RETURNING id`;
    expect(event).toHaveLength(1);

    const matched = await billingSql`UPDATE billing_events SET processed = true, quarantined = false WHERE id = ${event[0].id} RETURNING id`;
    expect(matched).toHaveLength(1);
  });

  it('should deny memoir_billing every write outside the entitlement tables (billing-writes-quests stays impossible with the tables in place)', async () => {
    await expectDenied(billingSql`UPDATE quests SET name = 'billing tampered' WHERE id = ${questId}`);
    await expectDenied(billingSql`INSERT INTO quest_logs (account_id, quest_id, date, state, ruleset_version) VALUES (${accountId}, ${questId}, now(), 'completed', 1)`);
    await expectDenied(
      billingSql`INSERT INTO hero_events (account_id, dedupe_key, type, xp_delta, coins_delta, date, ruleset_version) VALUES (${accountId}, 'dk-billing', 'quest_complete', 10, 5, now(), 1)`,
    );
    await expectDenied(billingSql`DELETE FROM billing_events WHERE account_id = ${accountId}`);
    await expectDenied(billingSql`UPDATE billing_events SET payload = '{"tampered":true}' WHERE account_id = ${accountId}`);
  });

  it('should deny memoir_api any write to entitlements or billing_events (user-role-writes-entitlements stays impossible)', async () => {
    await expectDenied(apiSql`UPDATE entitlements SET tier = 'paid' WHERE account_id = ${accountId}`);
    await expectDenied(apiSql`INSERT INTO entitlements (account_id, tier, state) VALUES (${accountId}, 'paid', 'active')`);
    await expectDenied(apiSql`DELETE FROM entitlements WHERE account_id = ${accountId}`);
    await expectDenied(
      apiSql`INSERT INTO billing_events (provider, provider_event_id, type, payload, occurred_at) VALUES ('generic-hmac', 'evt-api-forged', 'subscription.activated', '{}', now())`,
    );

    const readable = await apiSql`SELECT tier, state FROM entitlements WHERE account_id = ${accountId}`;
    expect(readable).toHaveLength(1);
  });

  it('should deny memoir_ai any access to entitlements — §5.4 grants it zero privileges there', async () => {
    await expectDenied(aiSql`SELECT tier FROM entitlements WHERE account_id = ${accountId}`);
    await expectDenied(aiSql`UPDATE entitlements SET tier = 'paid' WHERE account_id = ${accountId}`);
  });

  it('should limit the billing role read of accounts to (id, identity_sub, purchase_token)', async () => {
    const scoped = await billingSql`SELECT id, identity_sub, purchase_token FROM accounts WHERE id = ${accountId}`;
    expect(scoped).toHaveLength(1);
    await expectDenied(billingSql`SELECT display_name FROM accounts WHERE id = ${accountId}`);
  });

  it('should let memoir_deleter delete rows across user-owned and append-only tables alike', async () => {
    const [account] = await databaseService.run(() =>
      db
        .insert(accounts)
        .values({ identitySub: 'sub-deleter-target', authProvider: 'google', defaultCurrency: 'USD', enabledCurrencies: ['USD'], timezone: 'UTC' })
        .returning(),
    );
    if (!account) throw new Error('account insert failed');
    await databaseService.run(() =>
      db.insert(heroEvents).values({
        accountId: account.id,
        dedupeKey: 'dk-deleter',
        type: 'quest_complete',
        xpDelta: 10,
        coinsDelta: 5,
        date: new Date().toISOString().slice(0, 10),
        rulesetVersion: 1,
      }),
    );

    const deletedEvents = await deleterSql`DELETE FROM hero_events WHERE account_id = ${account.id} RETURNING id`;
    expect(deletedEvents.length).toBeGreaterThan(0);

    const deletedAccount = await deleterSql`DELETE FROM accounts WHERE id = ${account.id} RETURNING id`;
    expect(deletedAccount).toHaveLength(1);
  });

  it('should preserve every role grant across a template-DB clone', async () => {
    const clonedName = `${databaseName}_clone`;
    await createDatabaseFromTemplate(clonedName);
    const cloneSql = new SQL(roleUrl('memoir_ai', clonedName));
    try {
      await expectDenied(cloneSql`UPDATE accounts SET total_xp = 1 WHERE id = ${accountId}`);
    } finally {
      await cloneSql.close();
      await dropDatabase(clonedName);
    }
  });
});
