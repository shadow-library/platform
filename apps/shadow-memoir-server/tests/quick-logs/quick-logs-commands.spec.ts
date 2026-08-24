import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { QuestsModule } from '@modules/quests';
import { QuickLogsModule } from '@modules/quick-logs';
import { addDays, formatLocalDate, localDateAt } from '@modules/rules';
import { SyncModule } from '@modules/sync';
import { accounts, DatastoreModule, heroEvents, journalEntries, mealPresets, meals, type PrimaryDatabase, sideQuests, weights } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule, QuestsModule, QuickLogsModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_quick_logs_commands_spec`;

const TODAY = formatLocalDate(localDateAt(Date.now(), 'UTC'));
const YESTERDAY = formatLocalDate(addDays(localDateAt(Date.now(), 'UTC'), -1));

interface Outcome {
  commandId: string;
  status: string;
  result: Record<string, unknown>;
  replayed: boolean;
  error?: { code: string; message: string };
}

function dailyRecurrence(startDate: string): Record<string, unknown> {
  return { frequency: 'daily', interval: 1, startDate, end: { kind: 'never' }, exceptions: [] };
}

describe('Quick logs (T-24)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let subCounter = 0;

  function envelope(type: string, payload: Record<string, unknown> = {}): Record<string, unknown> {
    return { commandId: Bun.randomUUIDv7(), type, payload, localDate: TODAY };
  }

  async function submit(commands: Record<string, unknown>[], token: string): Promise<Outcome[]> {
    const response = await router
      .mockRequest()
      .post('/api/v1/sync/commands')
      .headers({ authorization: `Bearer ${token}` })
      .body({ commands });
    return (response.json() as { outcomes: Outcome[] }).outcomes;
  }

  async function submitOne(type: string, payload: Record<string, unknown>, token: string): Promise<Outcome> {
    const [outcome] = await submit([envelope(type, payload)], token);
    return outcome!;
  }

  async function submitEnvelope(commandEnvelope: Record<string, unknown>, token: string): Promise<Outcome> {
    const [outcome] = await submit([commandEnvelope], token);
    return outcome!;
  }

  async function newUser(): Promise<{ token: string; accountId: bigint }> {
    subCounter += 1;
    const sub = `quick-logs-commands-sub-${subCounter}`;
    const token = await userToken(sub);
    await router
      .mockRequest()
      .get('/api/v1/sync/delta')
      .headers({ authorization: `Bearer ${token}` })
      .query({ since: '0' });
    const [account] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.identitySub, sub));
    return { token, accountId: account!.id };
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  describe('first-of-day reward dedupe (PRD §4.12)', () => {
    it('should grant the journal reward exactly once across a literal command replay', async () => {
      const { token, accountId } = await newUser();
      const commandEnvelope = envelope('journal.save', { id: Bun.randomUUIDv7(), draft: { date: TODAY, text: 'first entry' } });

      const first = await submitEnvelope(commandEnvelope, token);
      expect(first.status).toBe('applied');
      expect(first.result['rewarded']).toBe(true);
      expect(first.result['xpAwarded']).toBe(5);

      const replay = await submitEnvelope(commandEnvelope, token);
      expect(replay.replayed).toBe(true);
      expect(replay.result['rewarded']).toBe(true);
      expect(replay.result['xpAwarded']).toBe(5);

      const events = await db.select().from(heroEvents).where(eq(heroEvents.accountId, accountId));
      expect(events).toHaveLength(1);
      expect(events[0]?.xpDelta).toBe(5);
    });

    it('should grant the journal reward exactly once across two devices racing the same day', async () => {
      const { token, accountId } = await newUser();

      const deviceA = await submitOne('journal.save', { id: Bun.randomUUIDv7(), draft: { date: TODAY, text: 'from device A' } }, token);
      const deviceB = await submitOne('journal.save', { id: Bun.randomUUIDv7(), draft: { date: TODAY, text: 'from device B' } }, token);

      expect(deviceA.status).toBe('applied');
      expect(deviceA.result['rewarded']).toBe(true);
      expect(deviceA.result['xpAwarded']).toBe(5);

      expect(deviceB.status).toBe('applied');
      expect(deviceB.result['rewarded']).toBe(false);
      expect(deviceB.result['xpAwarded']).toBe(0);

      const events = await db.select().from(heroEvents).where(eq(heroEvents.accountId, accountId));
      expect(events).toHaveLength(1);
      const entries = await db.select().from(journalEntries).where(eq(journalEntries.accountId, accountId));
      expect(entries).toHaveLength(2);
    });

    it('should reward the first meal and weight of the day once, and zero further meal logs the same day', async () => {
      const { token } = await newUser();
      const first = await submitOne('meal.log', { id: Bun.randomUUIDv7(), draft: { date: TODAY, name: 'Oats', calories: 400, mealType: 'cooked' } }, token);
      expect(first.result['rewarded']).toBe(true);
      expect(first.result['xpAwarded']).toBe(3);

      const second = await submitOne('meal.log', { id: Bun.randomUUIDv7(), draft: { date: TODAY, name: 'Salad', calories: 300, mealType: 'cooked' } }, token);
      expect(second.result['rewarded']).toBe(false);
      expect(second.result['xpAwarded']).toBe(0);

      const weight = await submitOne('weight.save', { date: TODAY, kg: 80, confirmedReplacement: false }, token);
      expect(weight.result['rewarded']).toBe(true);
      expect(weight.result['xpAwarded']).toBe(3);
    });
  });

  describe('backdated entries (PRD §4.12: no backdated quick-log XP)', () => {
    it('should record a backdated journal entry but grant zero deltas', async () => {
      const { token, accountId } = await newUser();
      const outcome = await submitOne('journal.save', { id: Bun.randomUUIDv7(), draft: { date: YESTERDAY, text: 'backfilled' } }, token);

      expect(outcome.status).toBe('applied');
      expect(outcome.result['rewarded']).toBe(false);
      expect(outcome.result['xpAwarded']).toBe(0);

      const events = await db.select().from(heroEvents).where(eq(heroEvents.accountId, accountId));
      expect(events).toHaveLength(0);
      const entries = await db.select().from(journalEntries).where(eq(journalEntries.accountId, accountId));
      expect(entries).toHaveLength(1);
    });

    it('should record a backdated side quest but grant zero deltas even though it would be within the first-3 window', async () => {
      const { token } = await newUser();
      const outcome = await submitOne('sidequest.log', { id: Bun.randomUUIDv7(), draft: { date: YESTERDAY, name: 'Fixed the fence' } }, token);
      expect(outcome.result['rewarded']).toBe(false);
      expect(outcome.result['xpAwarded']).toBe(0);
      expect(outcome.result['coinsAwarded']).toBe(0);
    });
  });

  describe('quest-linkage offers (PRD §2.6)', () => {
    it('should surface a linkage offer instead of granting quick-log XP when an eligible linked quest is not yet completed', async () => {
      const { token, accountId } = await newUser();
      const questOutcome = await submitOne(
        'quest.create',
        { name: 'Evening journal', durationMinutes: 10, statAffinity: 'mind', strictness: 'goal', recurrence: dailyRecurrence(TODAY), moduleLink: 'journal' },
        token,
      );
      const questId = questOutcome.result['id'] as string;

      const outcome = await submitOne('journal.save', { id: Bun.randomUUIDv7(), draft: { date: TODAY, text: 'linked entry' } }, token);
      expect(outcome.result['rewarded']).toBe(false);
      expect(outcome.result['xpAwarded']).toBe(0);
      expect(outcome.result['linkageOffer']).toMatchObject({ status: 'offered', questId, date: TODAY });

      const events = await db.select().from(heroEvents).where(eq(heroEvents.accountId, accountId));
      expect(events).toHaveLength(0);
    });

    it('should grant the quest reward and suppress quick-log XP entirely — never both — when the entry is linked to an already-completed quest', async () => {
      const { token, accountId } = await newUser();
      const questOutcome = await submitOne(
        'quest.create',
        { name: 'Log the meal', durationMinutes: 10, statAffinity: 'body', strictness: 'goal', recurrence: dailyRecurrence(TODAY), moduleLink: 'meal' },
        token,
      );
      const questId = questOutcome.result['id'] as string;

      const completion = await submitOne('quest.complete', { occurrenceId: `${questId}:${TODAY}` }, token);
      expect(completion.status).toBe('applied');
      expect(completion.result['xpAwarded'] as number).toBeGreaterThan(0);

      const mealOutcome = await submitOne('meal.log', { id: Bun.randomUUIDv7(), draft: { date: TODAY, name: 'Grilled chicken', calories: 500, mealType: 'cooked' } }, token);
      expect(mealOutcome.result['rewarded']).toBe(false);
      expect(mealOutcome.result['xpAwarded']).toBe(0);
      expect(mealOutcome.result['linkageOffer']).toMatchObject({ status: 'already-completed', questId });

      const events = await db.select().from(heroEvents).where(eq(heroEvents.accountId, accountId));
      const mealGrants = events.filter(event => event.type === 'meal');
      expect(mealGrants).toHaveLength(0);
      const questGrants = events.filter(event => event.type === 'quest_complete' || event.type === 'quest_late');
      expect(questGrants).toHaveLength(1);
    });
  });

  describe('soft entry caps (PRD §4.13 — never blocking)', () => {
    async function seedJournalCount(accountId: bigint, count: number): Promise<void> {
      const rows = Array.from({ length: count }, () => ({ id: Bun.randomUUIDv7(), accountId, date: TODAY, text: 'seed', rewarded: false }));
      if (rows.length > 0) await db.insert(journalEntries).values(rows);
    }

    it('should surface an approaching advisory at 80% and a reached advisory past 100%, while every write still applies', async () => {
      const { token, accountId } = await newUser();
      await seedJournalCount(accountId, 79);

      const at80 = await submitOne('journal.save', { id: Bun.randomUUIDv7(), draft: { date: TODAY, text: 'entry 80' } }, token);
      expect(at80.status).toBe('applied');
      expect(at80.result['advisory']).toMatchObject({ level: 'approaching', used: 80, limit: 100, blocksSave: false });

      await seedJournalCount(accountId, 19);
      const at100 = await submitOne('journal.save', { id: Bun.randomUUIDv7(), draft: { date: TODAY, text: 'entry 100' } }, token);
      expect(at100.status).toBe('applied');
      expect(at100.result['advisory']).toMatchObject({ level: 'reached', used: 100, blocksSave: false });

      const beyond = await submitOne('journal.save', { id: Bun.randomUUIDv7(), draft: { date: TODAY, text: 'entry 101' } }, token);
      expect(beyond.status).toBe('applied');
      expect(beyond.result['advisory']).toMatchObject({ level: 'reached', used: 101, blocksSave: false });
    });
  });

  describe('weight upsert with confirm flag (PRD §3.9)', () => {
    it('should refuse an unconfirmed same-day replace and write nothing, then apply once confirmed', async () => {
      const { token, accountId } = await newUser();
      const first = await submitOne('weight.save', { date: TODAY, kg: 80, confirmedReplacement: false }, token);
      expect(first.status).toBe('applied');

      const unconfirmed = await submitOne('weight.save', { date: TODAY, kg: 79.5, confirmedReplacement: false }, token);
      expect(unconfirmed.status).toBe('rejected');
      expect(unconfirmed.result['kind']).toBe('needs-confirmation');

      const rows = await db.select().from(weights).where(eq(weights.accountId, accountId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.kg).toBe('80.00');

      const confirmed = await submitOne('weight.save', { date: TODAY, kg: 79.5, confirmedReplacement: true }, token);
      expect(confirmed.status).toBe('applied');
      expect(confirmed.result['replaced']).toBe(true);

      const afterReplace = await db.select().from(weights).where(eq(weights.accountId, accountId));
      expect(afterReplace).toHaveLength(1);
      expect(afterReplace[0]?.kg).toBe('79.50');
    });
  });

  describe('meal preset snapshot-on-log (PRD §3.9)', () => {
    it('should leave an already-logged meal unchanged when its preset is edited afterward', async () => {
      const { token, accountId } = await newUser();
      const preset = await submitOne('meal.savePreset', { preset: { name: 'Breakfast oats', calories: 400, mealType: 'cooked' } }, token);
      const presetId = preset.result['id'] as string;

      const logged = await submitOne('meal.logPreset', { id: Bun.randomUUIDv7(), presetId, date: TODAY }, token);
      expect(logged.status).toBe('applied');

      await submitOne('meal.preset.update', { id: presetId, patch: { name: 'Breakfast oats (large)', calories: 650 } }, token);

      const [meal] = await db.select().from(meals).where(eq(meals.accountId, accountId));
      expect(meal?.name).toBe('Breakfast oats');
      expect(meal?.calories).toBe(400);

      const [updatedPreset] = await db
        .select()
        .from(mealPresets)
        .where(eq(mealPresets.id, BigInt(presetId)));
      expect(updatedPreset?.name).toBe('Breakfast oats (large)');
      expect(updatedPreset?.calories).toBe(650);
    });
  });

  describe('side quests first-3-rewarded (PRD §4.12)', () => {
    it('should reward the first 3 side quests of the day and grant zero for the 4th', async () => {
      const { token, accountId } = await newUser();
      const results: Outcome[] = [];
      for (let i = 0; i < 4; i++) results.push(await submitOne('sidequest.log', { id: Bun.randomUUIDv7(), draft: { date: TODAY, name: `Deed ${i}` } }, token));

      expect(results.map(outcome => outcome.result['rewarded'])).toEqual([true, true, true, false]);
      expect(results.map(outcome => outcome.result['xpAwarded'])).toEqual([8, 8, 8, 0]);
      expect(results.map(outcome => outcome.result['coinsAwarded'])).toEqual([1, 1, 1, 0]);

      const rows = await db.select().from(sideQuests).where(eq(sideQuests.accountId, accountId));
      expect(rows).toHaveLength(4);
      expect(rows.filter(row => row.rewarded)).toHaveLength(3);
    });
  });
});
