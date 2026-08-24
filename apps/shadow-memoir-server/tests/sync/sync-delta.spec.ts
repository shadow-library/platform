import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Dispatcher, Injectable, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Authenticated, RequireScope } from '@shadow-library/auth/module';
import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Config } from '@shadow-library/common';
import { Body, FastifyModule, type FastifyRouter, HttpController, HttpStatus, Params, Post, RespondFor, Transform } from '@shadow-library/fastify';
import { DatabaseModule, DatabaseService } from '@shadow-library/modules';

import { AccountModule } from '@modules/account';
import { MemoirAuthModule, OwnerScopedRepository } from '@modules/auth';
import { DevicesModule } from '@modules/devices';
import { QuestsModule } from '@modules/quests';
import { RolloverModule } from '@modules/rollover';
import { addDays, formatLocalDate, localDateAt } from '@modules/rules';
import { SyncModule } from '@modules/sync';
import { DatastoreModule, type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { serviceToken, userToken } from '../test-idp';

/** Stands in for the T-18 quest repository: the point under test is that `scopedUpdate` re-stamps `sync_seq`, not what a quest edit does. */
@Injectable()
class TestQuestRepository extends OwnerScopedRepository {
  async rename(questId: bigint, name: string): Promise<number> {
    const updated = await this.scopedUpdate(schema.quests, { name }, eq(schema.quests.id, questId)).returning({ id: schema.quests.id });
    return updated.length;
  }
}

@Schema()
class QuestIdParams {
  @Field(() => String, { pattern: '^\\d+$' })
  @Transform('bigint:parse')
  questId: bigint;
}

@Schema()
class RenameQuestDto {
  @Field()
  name: string;
}

@Schema()
class RenameResultDto {
  @Field(() => Integer)
  updated: number;
}

/** `scopedUpdate` reads the account from the ambient request context, so the re-stamp can only be exercised from inside a request. */
@HttpController('/api/v1/test/quests')
@Authenticated()
@RequireScope('memoir:sync')
class TestQuestController {
  constructor(private readonly questRepository: TestQuestRepository) {}

  @Post('/:questId/rename')
  @HttpStatus(200)
  @RespondFor(200, RenameResultDto)
  async rename(@Params() params: QuestIdParams, @Body() body: RenameQuestDto): Promise<RenameResultDto> {
    return { updated: await this.questRepository.rename(params.questId, body.name) };
  }
}

const TestHttpModule = FastifyModule.forRoot({
  imports: [MemoirAuthModule, SyncModule, DevicesModule, AccountModule, QuestsModule, RolloverModule, DatabaseModule],
  controllers: [TestQuestController],
  providers: [TestQuestRepository],
  host: 'localhost',
  port: 0,
});

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_sync_delta_spec`;

/** Yesterday relative to the wall clock, in UTC (the fixture accounts' timezone) — the lazy rollover gate stamps a fresh account's daily_states row on today, so a literal date would collide with it once a run's real "today" caught up to it. */
const DATE = formatLocalDate(addDays(localDateAt(Date.now(), 'UTC'), -1));

interface DeltaBody {
  cursor: string;
  hasMore: boolean;
  domains: Record<string, Record<string, unknown>[]>;
  tombstones: { domain: string; recordId: string; syncSeq: string }[];
}

describe('GET /api/v1/sync/delta and the device registry (T-16)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  const originalOverlap = Config.get('sync.cursor-overlap');
  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let alice: string;
  let bob: string;
  let aliceAccountId: bigint;
  let bobAccountId: bigint;

  async function pullDelta(query: Record<string, string>, token = alice) {
    return router
      .mockRequest()
      .get('/api/v1/sync/delta')
      .query(query)
      .headers({ authorization: `Bearer ${token}` });
  }

  async function delta(query: Record<string, string> = { since: '0' }, token = alice): Promise<DeltaBody> {
    const response = await pullDelta(query, token);
    expect(response.statusCode).toBe(200);
    return response.json() as DeltaBody;
  }

  async function putDevice(deviceId: string, token = alice) {
    return router
      .mockRequest()
      .put(`/api/v1/account/devices/${deviceId}`)
      .headers({ authorization: `Bearer ${token}` })
      .body({ userAgent: 'test-agent', pushOptIn: true });
  }

  async function deleteDevice(deviceId: string, token = alice) {
    return router
      .mockRequest()
      .delete(`/api/v1/account/devices/${deviceId}`)
      .headers({ authorization: `Bearer ${token}` });
  }

  async function renameQuest(questId: bigint, name: string, token = alice) {
    return router
      .mockRequest()
      .post(`/api/v1/test/quests/${questId}/rename`)
      .headers({ authorization: `Bearer ${token}` })
      .body({ name });
  }

  async function accountIdOf(sub: string): Promise<bigint> {
    const [account] = await db.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.identitySub, sub));
    return account!.id;
  }

  async function createQuest(accountId: bigint, name: string): Promise<bigint> {
    const [quest] = await db
      .insert(schema.quests)
      .values({ accountId, name, durationMin: 30, statAffinity: 'body', strictness: 'routine', recurrence: {} })
      .returning({ id: schema.quests.id });
    return quest!.id;
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    /** The suite works with a handful of sequence values, so the production overlap would swallow every cursor advance; the overlap has its own test below. */
    Config['cache'].set('sync.cursor-overlap', 0);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;

    alice = await userToken('delta-alice-sub');
    bob = await userToken('delta-bob-sub');
    await pullDelta({ since: '0' }, alice);
    await pullDelta({ since: '0' }, bob);
    aliceAccountId = await accountIdOf('delta-alice-sub');
    bobAccountId = await accountIdOf('delta-bob-sub');
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    Config['cache'].set('sync.cursor-overlap', originalOverlap);
    await dropDatabase(databaseName);
  });

  describe('domains and epoch', () => {
    it('should carry the sync epoch header on every pull', async () => {
      const response = await pullDelta({ since: '0' });
      expect(response.headers['x-sync-epoch']).toBe(Config.get('sync.epoch'));
    });

    it('should return every registered domain, including the ones modules registered themselves', async () => {
      const body = await delta();
      expect(Object.keys(body.domains).sort()).toEqual([
        'account',
        'achievements_earned',
        'cosmetic_unlocks',
        'daily_states',
        'devices',
        'quest_logs',
        'quest_streaks',
        'quests',
        'titles_earned',
      ]);
    });

    it('should ship the account snapshot without the account id or identity subject', async () => {
      const body = await delta();
      const snapshot = body.domains['account']![0]!;
      expect(snapshot).toBeDefined();
      expect(snapshot['timezone']).toBe('UTC');
      expect(snapshot['id']).toBeUndefined();
      expect(snapshot['identitySub']).toBeUndefined();
    });

    it('should restrict the pull to the named domains', async () => {
      const body = await delta({ since: '0', domains: 'quests,devices' });
      expect(Object.keys(body.domains).sort()).toEqual(['devices', 'quests']);
    });

    it('should reject an unregistered domain with 400', async () => {
      const response = await pullDelta({ since: '0', domains: 'expenses' });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'SYN_001' });
    });
  });

  describe('cursor', () => {
    it('should deliver rows created after the cursor and advance past them', async () => {
      const before = await delta();
      const questId = await createQuest(aliceAccountId, 'cursor-quest');

      const after = await delta({ since: before.cursor });
      expect(after.domains['quests']!.map(row => row['id'])).toContain(String(questId));
      expect(BigInt(after.cursor) >= BigInt(before.cursor)).toBe(true);
    });

    it('should never move the cursor backwards when nothing changed', async () => {
      const first = await delta();
      const second = await delta({ since: first.cursor });
      expect(second.cursor).toBe(first.cursor);
      expect(second.hasMore).toBe(false);
    });

    it('should return a superset when pulled from an earlier cursor, converging on the same rows', async () => {
      const early = await delta();
      const questId = await createQuest(aliceAccountId, 'overlap-quest');
      const latest = await delta({ since: early.cursor });

      const replayed = await delta({ since: '0' });
      const latestIds = new Set(latest.domains['quests']!.map(row => row['id']));
      const replayedIds = new Set(replayed.domains['quests']!.map(row => row['id']));

      expect(replayedIds).toContain(String(questId));
      for (const id of latestIds) expect(replayedIds).toContain(id);
      expect(replayedIds.size >= latestIds.size).toBe(true);
    });

    it('should hold the cursor behind the newest change by the configured overlap so late commits are re-served', async () => {
      for (let index = 0; index < 4; index++) await createQuest(aliceAccountId, `overlap-lag-quest-${index}`);
      const exact = await delta({ since: '0' });

      Config['cache'].set('sync.cursor-overlap', 3);
      const lagged = await delta({ since: '0' });
      Config['cache'].set('sync.cursor-overlap', 0);

      expect(BigInt(lagged.cursor)).toBe(BigInt(exact.cursor) - 3n);

      const fromExact = await delta({ since: exact.cursor });
      const fromLagged = await delta({ since: lagged.cursor });
      expect(fromLagged.domains['quests']!.length).toBeGreaterThanOrEqual(fromExact.domains['quests']!.length);
    });

    it('should page a keyset domain and flag hasMore without skipping rows', async () => {
      for (let index = 0; index < 3; index++) await createQuest(aliceAccountId, `paged-quest-${index}`);

      const page = await delta({ since: '0', domains: 'quests', limit: '2' });
      expect(page.hasMore).toBe(true);
      expect(page.domains['quests']).toHaveLength(2);

      const seen = new Set(page.domains['quests']!.map(row => row['id']));
      let cursor = page.cursor;
      let guard = 0;
      let hasMore = page.hasMore;
      while (hasMore && guard++ < 20) {
        const next = await delta({ since: cursor, domains: 'quests', limit: '2' });
        for (const row of next.domains['quests']!) seen.add(row['id']);
        hasMore = next.hasMore;
        cursor = next.cursor;
      }

      const all = await db.select({ id: schema.quests.id }).from(schema.quests).where(eq(schema.quests.accountId, aliceAccountId));
      expect(seen.size).toBe(all.length);
    });
  });

  describe('sync_seq re-stamp', () => {
    it('should move an updated row past a cursor that had already passed it', async () => {
      const questId = await createQuest(aliceAccountId, 'restamp-quest');
      const drained = await delta({ since: '0' });
      const caughtUp = await delta({ since: drained.cursor });
      expect(caughtUp.domains['quests']!.map(row => row['id'])).not.toContain(String(questId));

      const renamed = await renameQuest(questId, 'restamp-quest-renamed');
      expect(renamed.json()).toEqual({ updated: 1 });

      const afterUpdate = await delta({ since: caughtUp.cursor });
      const row = afterUpdate.domains['quests']!.find(candidate => candidate['id'] === String(questId));
      expect(row).toBeDefined();
      expect(row!['name']).toBe('restamp-quest-renamed');
    });

    it('should refuse to update another account row through the same repository', async () => {
      const foreign = await createQuest(bobAccountId, 'bob-quest');
      const response = await renameQuest(foreign, 'hijacked', alice);
      expect(response.json()).toEqual({ updated: 0 });

      const [row] = await db.select({ name: schema.quests.name }).from(schema.quests).where(eq(schema.quests.id, foreign));
      expect(row!.name).toBe('bob-quest');
    });
  });

  describe('devices', () => {
    it('should upsert a device and return it without an account id', async () => {
      const deviceId = crypto.randomUUID();
      const response = await putDevice(deviceId);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id: deviceId, userAgent: 'test-agent', pushOptIn: true });
      expect(response.json().accountId).toBeUndefined();
    });

    it('should treat a repeated PUT as an update rather than a second device', async () => {
      const deviceId = crypto.randomUUID();
      await putDevice(deviceId);
      await putDevice(deviceId);

      const rows = await db.select().from(schema.devices).where(eq(schema.devices.id, deviceId));
      expect(rows).toHaveLength(1);
    });

    it('should surface the caller devices in the delta snapshot without their push subscriptions', async () => {
      const deviceId = crypto.randomUUID();
      await putDevice(deviceId);

      const body = await delta();
      const device = body.domains['devices']!.find(row => row['id'] === deviceId);
      expect(device).toBeDefined();
      expect(device!['pushSubscription']).toBeUndefined();
    });

    it('should propagate a device deletion as a tombstone on the next delta', async () => {
      const deviceId = crypto.randomUUID();
      await putDevice(deviceId);
      const drained = await delta();

      expect((await deleteDevice(deviceId)).statusCode).toBe(204);

      const body = await delta({ since: drained.cursor });
      expect(body.tombstones).toContainEqual(expect.objectContaining({ domain: 'devices', recordId: deviceId }));
      expect(body.domains['devices']!.map(row => row['id'])).not.toContain(deviceId);
    });

    it('should answer 404 for a device that does not exist', async () => {
      const response = await deleteDevice(crypto.randomUUID());
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'DEV_001' });
    });
  });

  describe('cross-account isolation', () => {
    it('should never leak another account rows into a delta pull', async () => {
      await createQuest(bobAccountId, 'bob-private-quest');
      const body = await delta({ since: '0' }, alice);
      expect(body.domains['quests']!.map(row => row['name'])).not.toContain('bob-private-quest');
    });

    it('should answer 404 when deleting a device that belongs to another account', async () => {
      const deviceId = crypto.randomUUID();
      await putDevice(deviceId, bob);

      const response = await deleteDevice(deviceId, alice);
      expect(response.statusCode).toBe(404);

      const rows = await db.select().from(schema.devices).where(eq(schema.devices.id, deviceId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.accountId).toBe(bobAccountId);
    });

    it('should refuse to adopt a device id that belongs to another account', async () => {
      const deviceId = crypto.randomUUID();
      await putDevice(deviceId, bob);

      const response = await putDevice(deviceId, alice);
      expect(response.statusCode).toBe(404);

      const [row] = await db.select({ accountId: schema.devices.accountId }).from(schema.devices).where(eq(schema.devices.id, deviceId));
      expect(row!.accountId).toBe(bobAccountId);
    });

    it('should never surface another account tombstones', async () => {
      const deviceId = crypto.randomUUID();
      await putDevice(deviceId, bob);
      await deleteDevice(deviceId, bob);

      const body = await delta({ since: '0' }, alice);
      expect(body.tombstones.map(tombstone => tombstone.recordId)).not.toContain(deviceId);
    });

    it('should reject a service-typed token on both sync and device routes', async () => {
      const token = await serviceToken();
      expect((await pullDelta({ since: '0' }, token)).statusCode).toBe(403);
      expect((await putDevice(crypto.randomUUID(), token)).statusCode).toBe(403);
      expect((await deleteDevice(crypto.randomUUID(), token)).statusCode).toBe(403);
    });
  });

  it('should treat DATE-scoped rows from every syncable table as one ordered stream', async () => {
    const questId = await createQuest(aliceAccountId, 'stream-quest');
    const drained = await delta();

    await db.insert(schema.questStreaks).values({ accountId: aliceAccountId, questId, currentRunDays: 1, lastCountedDate: DATE });
    await db
      .insert(schema.dailyStates)
      .values({ accountId: aliceAccountId, date: DATE, intensityMode: 'standard', hpStart: 0, hpEnd: 0, hpMax: 0, crownPeriodStart: DATE, rulesetVersion: 3 });

    const body = await delta({ since: drained.cursor });
    expect(body.domains['quest_streaks']).toHaveLength(1);
    expect(body.domains['daily_states']).toHaveLength(1);
  });
});
