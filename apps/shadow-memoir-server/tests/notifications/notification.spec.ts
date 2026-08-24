import '@server/bootstrap';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Injectable, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import {
  BillingReminderSweepService,
  NotificationClient,
  NotificationOutboxRepository,
  NotificationSenderService,
  NotificationsModule,
  type PulseNotificationRequest,
  type PulseSendOutcome,
  PulseTransport,
  WeeklyDigestSweepService,
} from '@modules/notifications';
import { type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, NotificationsModule], host: 'localhost', port: 0 });

@Module({ imports: [TestHttpModule] })
class TestAppModule {}

let recorded: PulseNotificationRequest[] = [];
let scriptedOutcome: PulseSendOutcome = 'sent';

@Injectable()
class FakePulseTransport extends PulseTransport {
  async send(request: PulseNotificationRequest): Promise<PulseSendOutcome> {
    recorded.push(request);
    return scriptedOutcome;
  }
}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_notifications_spec`;

describe('Notifications via pulse (T-34, ARCHITECTURE §17/§4.5)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  const originalMaxAttempts = Config.get('notifications.sender-max-attempts');

  let app: ShadowApplication;
  let db: PrimaryDatabase;
  let client: NotificationClient;
  let sender: NotificationSenderService;
  let outbox: NotificationOutboxRepository;
  let billingSweep: BillingReminderSweepService;
  let digestSweep: WeeklyDigestSweepService;
  let subject = 0;

  async function createAccount(overrides: Partial<typeof schema.accounts.$inferInsert> = {}): Promise<bigint> {
    subject += 1;
    const [account] = await db
      .insert(schema.accounts)
      .values({
        identitySub: `notifications-${subject}`,
        authProvider: 'google',
        email: `notify-${subject}@example.com`,
        defaultCurrency: 'USD',
        enabledCurrencies: ['USD'],
        timezone: 'UTC',
        ...overrides,
      })
      .returning();
    return account!.id;
  }

  async function setPrefs(accountId: bigint, prefs: Record<string, boolean>): Promise<void> {
    await db.update(schema.accounts).set({ notificationPrefs: prefs }).where(eq(schema.accounts.id, accountId));
  }

  async function outboxRows(accountId: bigint) {
    return db.select().from(schema.notificationOutbox).where(eq(schema.notificationOutbox.accountId, accountId));
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);

    app = await ShadowFactory.create(TestAppModule, { overrides: [{ token: PulseTransport, useClass: FakePulseTransport }] });
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
    client = app.get(NotificationClient);
    sender = app.get(NotificationSenderService);
    outbox = app.get(NotificationOutboxRepository);
    billingSweep = app.get(BillingReminderSweepService);
    digestSweep = app.get(WeeklyDigestSweepService);
  });

  afterEach(() => {
    recorded = [];
    scriptedOutcome = 'sent';
    Config['cache'].set('notifications.sender-max-attempts', originalMaxAttempts);
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  describe('opt-out default (NotificationClient.enqueue)', () => {
    it('should enqueue nothing when notification_prefs has never been set (all default OFF)', async () => {
      const accountId = await createAccount();
      await client.enqueue(accountId, 'aiResultReady', 'dedupe-1', { resultId: '1', suggestionCount: 2 });
      expect(await outboxRows(accountId)).toHaveLength(0);
    });

    it('should enqueue nothing when the category pref is explicitly false', async () => {
      const accountId = await createAccount();
      await setPrefs(accountId, { aiReadiness: false, weeklyDigest: false, billingReminders: false });
      await client.enqueue(accountId, 'aiResultReady', 'dedupe-2', { resultId: '1', suggestionCount: 2 });
      expect(await outboxRows(accountId)).toHaveLength(0);
    });

    it('should enqueue exactly one row when the account has explicitly opted in', async () => {
      const accountId = await createAccount();
      await setPrefs(accountId, { aiReadiness: true });
      await client.enqueue(accountId, 'aiResultReady', 'dedupe-3', { resultId: '42', suggestionCount: 5 });
      const rows = await outboxRows(accountId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.templateKey).toBe('memoir-ai-result-ready');
      expect(rows[0]!.variables).toEqual({ resultId: '42', suggestionCount: 5 });
    });

    it('should collapse a repeated enqueue for the same dedupe key into a single row', async () => {
      const accountId = await createAccount();
      await setPrefs(accountId, { aiReadiness: true });
      await client.enqueue(accountId, 'aiResultReady', 'dedupe-4', { resultId: '1', suggestionCount: 1 });
      await client.enqueue(accountId, 'aiResultReady', 'dedupe-4', { resultId: '1', suggestionCount: 1 });
      expect(await outboxRows(accountId)).toHaveLength(1);
    });
  });

  describe('NotificationSenderService.drain', () => {
    it('should deliver a pending row through the transport with the exact template key and variable names', async () => {
      const accountId = await createAccount();
      await setPrefs(accountId, { billingReminders: true });
      await client.enqueue(accountId, 'billingReminder', 'drain-1', { state: 'trial', expiresAtDate: '2026-09-01', amount: 10, currencyCode: 'USD' });

      await sender.drain();
      const delivered = recorded.find(request => request.templateKey === 'memoir-billing-reminder' && request.email === `notify-${subject}@example.com`);
      expect(delivered).toBeDefined();
      expect(Object.keys(delivered!.variables).sort()).toEqual(['amount', 'currencyCode', 'expiresAtDate', 'state']);

      const [row] = await outboxRows(accountId);
      expect(row!.status).toBe('sent');
      expect(row!.sentAt).not.toBeNull();
    });

    it('should not fail the caller when pulse is unavailable — the row retries with backoff instead', async () => {
      const accountId = await createAccount();
      await setPrefs(accountId, { aiReadiness: true });
      await client.enqueue(accountId, 'aiResultReady', 'drain-2', { resultId: '9', suggestionCount: 1 });

      scriptedOutcome = 'unavailable';
      const sent = await sender.drain();
      expect(sent).toBe(0);

      const [row] = await outboxRows(accountId);
      expect(row!.status).toBe('pending');
      expect(row!.attempts).toBe(1);
      expect(row!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should cap retries and mark the row failed once the attempt budget is exhausted', async () => {
      Config['cache'].set('notifications.sender-max-attempts', 2);
      const accountId = await createAccount();
      await setPrefs(accountId, { aiReadiness: true });
      await client.enqueue(accountId, 'aiResultReady', 'drain-3', { resultId: '9', suggestionCount: 1 });

      scriptedOutcome = 'unavailable';
      await outbox.markRetry((await outboxRows(accountId))[0]!.id, new Date(0), 'forced-due');
      await sender.drain();
      await outbox.markRetry((await outboxRows(accountId))[0]!.id, new Date(0), 'forced-due');
      await sender.drain();

      const [row] = await outboxRows(accountId);
      expect(row!.status).toBe('failed');
      expect(row!.attempts).toBeGreaterThanOrEqual(2);
    });
  });

  describe('BillingReminderSweepService (entitlement due sweep)', () => {
    it('should enqueue a billing reminder for a trial nearing expiry, only when opted in', async () => {
      const accountId = await createAccount();
      await setPrefs(accountId, { billingReminders: true });
      const expiresAt = new Date(Date.now() + 24 * 3_600_000);
      await db
        .insert(schema.entitlements)
        .values({ accountId, tier: 'paid', state: 'trial', expiresAt })
        .onConflictDoUpdate({ target: schema.entitlements.accountId, set: { state: 'trial', expiresAt } });

      const found = await billingSweep.run();
      expect(found).toBeGreaterThanOrEqual(1);

      const rows = await outboxRows(accountId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.templateKey).toBe('memoir-billing-reminder');
      expect((rows[0]!.variables as { state: string }).state).toBe('trial');
    });

    it('should enqueue nothing for a trial nearing expiry when the account has not opted in', async () => {
      const accountId = await createAccount();
      const expiresAt = new Date(Date.now() + 24 * 3_600_000);
      await db
        .insert(schema.entitlements)
        .values({ accountId, tier: 'paid', state: 'trial', expiresAt })
        .onConflictDoUpdate({ target: schema.entitlements.accountId, set: { state: 'trial', expiresAt } });

      await billingSweep.run();
      expect(await outboxRows(accountId)).toHaveLength(0);
    });
  });

  describe('WeeklyDigestSweepService (aggregate assembly)', () => {
    async function seedQuestLog(accountId: bigint, date: string, state: string) {
      const [quest] = await db
        .insert(schema.quests)
        .values({ accountId, name: `Quest ${date}-${state}`, durationMin: 10, statAffinity: 'discipline', strictness: 'anchor', recurrence: { type: 'daily' } })
        .returning();
      await db.insert(schema.questLogs).values({
        accountId,
        questId: quest!.id,
        date,
        state: state as (typeof schema.questLogs.$inferInsert)['state'],
        statAffinity: 'discipline',
        strictness: 'anchor',
        intensityModeAtLog: 'standard',
        crownSliceWeight: '1.00',
        rulesetVersion: 1,
        reasonTag: state === 'missed' ? 'forgot' : null,
      });
    }

    async function seedExpense(accountId: bigint, occurredOn: string, amountMinor: number) {
      await db.insert(schema.expenses).values({
        id: Bun.randomUUIDv7(),
        accountId,
        amountMinor: BigInt(amountMinor),
        amountText: (amountMinor / 100).toFixed(2),
        currency: 'USD',
        categoryId: 'food',
        occurredOn,
      });
    }

    it('should compute adherence counts and a money total from aggregates only, for the week ending yesterday', async () => {
      const accountId = await createAccount();
      const monday = '2026-08-17';
      await seedQuestLog(accountId, monday, 'completed');
      await seedQuestLog(accountId, '2026-08-18', 'missed');
      await seedQuestLog(accountId, '2026-08-19', 'completed');
      await seedExpense(accountId, '2026-08-20', 1000);
      await seedExpense(accountId, '2026-08-21', 500);

      const result = await digestSweep.assemble(accountId, 'UTC', 'USD', new Date('2026-08-24T12:00:00Z'));
      expect(result.dedupeKey).toBe('2026-08-17');
      expect(result.variables).toMatchObject({
        weekStartDate: '2026-08-17',
        weekEndDate: '2026-08-23',
        questsScheduledCount: 3,
        questsCompletedCount: 2,
        netAmount: 15,
        currencyCode: 'USD',
        reasonTagCode: 'forgot',
      });
    });

    it('should never contain a sensitive-manifest fixture string (canary): the assembler queries only aggregate columns', async () => {
      const accountId = await createAccount();
      const canary = `CANARY${Bun.randomUUIDv7().replaceAll('-', '')}`;
      const [quest] = await db
        .insert(schema.quests)
        .values({ accountId, name: canary, durationMin: 10, statAffinity: 'discipline', strictness: 'anchor', recurrence: { type: 'daily' } })
        .returning();
      await db.insert(schema.questLogs).values({
        accountId,
        questId: quest!.id,
        date: '2026-08-18',
        state: 'missed',
        statAffinity: 'discipline',
        strictness: 'anchor',
        intensityModeAtLog: 'standard',
        crownSliceWeight: '1.00',
        rulesetVersion: 1,
        reasonNote: canary,
        reasonTag: 'forgot',
      });
      await db.insert(schema.expenses).values({
        id: Bun.randomUUIDv7(),
        accountId,
        amountMinor: 100n,
        amountText: '1.00',
        currency: 'USD',
        categoryId: 'food',
        occurredOn: '2026-08-19',
        merchant: canary,
        note: canary,
      });

      const result = await digestSweep.assemble(accountId, 'UTC', 'USD', new Date('2026-08-24T12:00:00Z'));
      expect(JSON.stringify(result.variables)).not.toContain(canary);
    });

    it('should enqueue the digest only for accounts opted in and only on the account-local digest day', async () => {
      const accountId = await createAccount();
      await setPrefs(accountId, { weeklyDigest: true });

      const sent = await digestSweep.run(new Date('2026-08-24T12:00:00Z'));
      expect(sent).toBeGreaterThanOrEqual(1);
      expect(await outboxRows(accountId)).toHaveLength(1);
    });
  });
});
