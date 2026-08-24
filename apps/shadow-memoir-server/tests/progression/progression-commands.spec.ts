import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { and, eq } from 'drizzle-orm';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { ProgressionModule } from '@modules/progression';
import { SyncModule } from '@modules/sync';
import { accounts, cosmeticUnlocks, DatastoreModule, heroEvents, type PrimaryDatabase } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule, ProgressionModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_progression_commands_spec`;

const DATE = '2026-08-24';

interface Outcome {
  commandId: string;
  status: string;
  result: Record<string, unknown>;
  replayed: boolean;
  error?: { code: string; message: string };
}

describe('Progression commands (T-21)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let subCounter = 0;

  function envelope(type: string, payload: Record<string, unknown> = {}): Record<string, unknown> {
    return { commandId: Bun.randomUUIDv7(), type, payload, localDate: DATE };
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

  async function newUser(coins = 0): Promise<{ token: string; accountId: bigint }> {
    subCounter += 1;
    const sub = `progression-commands-sub-${subCounter}`;
    const token = await userToken(sub);
    await router
      .mockRequest()
      .get('/api/v1/sync/delta')
      .headers({ authorization: `Bearer ${token}` })
      .query({ since: '0' });
    const [account] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.identitySub, sub));
    const accountId = account!.id;
    if (coins > 0) await db.update(accounts).set({ coins }).where(eq(accounts.id, accountId));
    return { token, accountId };
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

  describe('cosmetic.purchase', () => {
    it('should unlock a cosmetic and spend exactly its coin price', async () => {
      const { token, accountId } = await newUser(100);
      const outcome = await submitOne('cosmetic.purchase', { cosmeticId: 'badge_bronze' }, token);

      expect(outcome.status).toBe('applied');
      expect(outcome.result['charged']).toBe(true);
      expect(outcome.result['coinsSpent']).toBe(50);

      const [account] = await db.select({ coins: accounts.coins }).from(accounts).where(eq(accounts.id, accountId));
      expect(account?.coins).toBe(50);

      const [unlock] = await db
        .select()
        .from(cosmeticUnlocks)
        .where(and(eq(cosmeticUnlocks.accountId, accountId), eq(cosmeticUnlocks.cosmeticId, 'badge_bronze')));
      expect(unlock?.source).toBe('coin');
      expect(unlock?.kind).toBe('badge');
    });

    it('should reject a purchase beyond the account balance', async () => {
      const { token } = await newUser(10);
      const outcome = await submitOne('cosmetic.purchase', { cosmeticId: 'badge_bronze' }, token);
      expect(outcome.status).toBe('failed');
      expect(outcome.error?.code).toBe('HRO_001');
    });

    it('should reject purchasing an achievement-only cosmetic', async () => {
      const { token } = await newUser(1000);
      const outcome = await submitOne('cosmetic.purchase', { cosmeticId: 'badge_gold_streak' }, token);
      expect(outcome.status).toBe('failed');
      expect(outcome.error?.code).toBe('CSM_004');
    });

    it('should reject an unknown cosmetic id', async () => {
      const { token } = await newUser(1000);
      const outcome = await submitOne('cosmetic.purchase', { cosmeticId: 'does_not_exist' }, token);
      expect(outcome.status).toBe('failed');
      expect(outcome.error?.code).toBe('CSM_002');
    });

    it('should replay the same purchase command without charging twice', async () => {
      const { token, accountId } = await newUser(100);
      const command = envelope('cosmetic.purchase', { cosmeticId: 'badge_bronze' });

      const first = await submit([command], token);
      const second = await submit([command], token);

      expect(second[0]!.replayed).toBe(true);
      expect(second[0]!.result).toEqual(first[0]!.result);

      const [account] = await db.select({ coins: accounts.coins }).from(accounts).where(eq(accounts.id, accountId));
      expect(account?.coins).toBe(50);
    });

    it('§11.3 — should charge exactly once when two devices race the same purchase', async () => {
      const { token, accountId } = await newUser(100);
      const commands = [envelope('cosmetic.purchase', { cosmeticId: 'badge_bronze' }), envelope('cosmetic.purchase', { cosmeticId: 'badge_bronze' })];

      const [first, second] = await Promise.all([submit([commands[0]!], token), submit([commands[1]!], token)]);
      const statuses = [first[0]!.status, second[0]!.status].sort();
      expect(statuses).toEqual(['applied', 'superseded']);

      const [account] = await db.select({ coins: accounts.coins }).from(accounts).where(eq(accounts.id, accountId));
      expect(account?.coins).toBe(50);

      const unlocks = await db
        .select()
        .from(cosmeticUnlocks)
        .where(and(eq(cosmeticUnlocks.accountId, accountId), eq(cosmeticUnlocks.cosmeticId, 'badge_bronze')));
      expect(unlocks).toHaveLength(1);

      const spendEvents = await db
        .select()
        .from(heroEvents)
        .where(and(eq(heroEvents.accountId, accountId), eq(heroEvents.dedupeKey, 'coinspend_badge_bronze')));
      expect(spendEvents).toHaveLength(1);
    });
  });

  describe('cosmetic.equip', () => {
    it('should reject equipping a cosmetic that has not been unlocked', async () => {
      const { token } = await newUser(0);
      const outcome = await submitOne('cosmetic.equip', { cosmeticId: 'badge_bronze' }, token);
      expect(outcome.status).toBe('failed');
      expect(outcome.error?.code).toBe('CSM_003');
    });

    it('should keep exactly one equipped cosmetic per kind', async () => {
      const { token, accountId } = await newUser(300);
      await submitOne('cosmetic.purchase', { cosmeticId: 'badge_bronze' }, token);
      await submitOne('cosmetic.purchase', { cosmeticId: 'badge_silver' }, token);

      const first = await submitOne('cosmetic.equip', { cosmeticId: 'badge_bronze' }, token);
      expect(first.status).toBe('applied');
      const second = await submitOne('cosmetic.equip', { cosmeticId: 'badge_silver' }, token);
      expect(second.status).toBe('applied');

      const equipped = await db
        .select()
        .from(cosmeticUnlocks)
        .where(and(eq(cosmeticUnlocks.accountId, accountId), eq(cosmeticUnlocks.kind, 'badge'), eq(cosmeticUnlocks.equipped, true)));
      expect(equipped).toHaveLength(1);
      expect(equipped[0]?.cosmeticId).toBe('badge_silver');
    });
  });

  describe('title.display', () => {
    it('should reject displaying a title the account has not earned', async () => {
      const { token } = await newUser(0);
      const outcome = await submitOne('title.display', { titleId: 'steady_builder' }, token);
      expect(outcome.status).toBe('failed');
      expect(outcome.error?.code).toBe('TTL_001');
    });

    it('should accept clearing the displayed title with null', async () => {
      const { token, accountId } = await newUser(0);
      const outcome = await submitOne('title.display', { titleId: null }, token);
      expect(outcome.status).toBe('applied');

      const [account] = await db.select({ displayedTitleId: accounts.displayedTitleId }).from(accounts).where(eq(accounts.id, accountId));
      expect(account?.displayedTitleId).toBeNull();
    });
  });
});
