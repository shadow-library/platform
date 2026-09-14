import { describe, expect, it } from 'vitest';

import { homeAmountOf } from '@/lib/data';
import {
  type DeltaPage,
  NEWER_DOMAINS,
  projectFinanceRows,
  projectWorldState,
  SNAPSHOT_DOMAINS,
  SYNC_DOMAINS,
  SYNC_META_KEYS,
  type SyncCommand,
  SyncedFinanceProvider,
  toWireCommand,
  type WireCommand,
} from '@/lib/sync';

import fixtures from './fixtures/wire-commands.json';
import { createTestEngine, sharedBacking } from './sync-harness';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Scenario {
  scenario: string;
  command: SyncCommand;
  wire: WireCommand;
  performedAt?: string;
}

/**
 * Pins `toWireCommand`'s output for every server-backed command in all four unions against `tests/fixtures/wire-commands.json`, a byte-identical copy of
 * which lives at `apps/shadow-memoir-server/tests/sync/fixtures/wire-commands.json` and is driven through
 * the real command endpoint by `wire-compat.spec.ts` there. Neither workspace can import the other's `src`
 * (the server's `tsconfig.json` has no path alias into the web app, and `command-wire.ts` pulls in the
 * whole `@/lib/data` barrel), so the JSON fixture is what keeps the two sides honest about the wire shape
 * instead of a shared import.
 */
describe('command-wire fixtures (FE-4)', () => {
  for (const entry of fixtures as unknown as Scenario[]) {
    it(`should build the pinned wire payload for ${entry.scenario}`, () => {
      const wire = toWireCommand(entry.command);

      if (entry.command.type !== 'quest.create') {
        expect(wire).toEqual(entry.wire);
        return;
      }

      const { entityRef, ...payload } = wire.payload;
      expect({ type: wire.type, payload }).toEqual(entry.wire);
      expect(entityRef).toMatch(UUID_V7);
    });
  }
});

describe('projection (UI-004, UI-005)', () => {
  it('should project the server health threshold shape', () => {
    const world = projectWorldState(
      {
        metrics: [{ id: '501', name: 'Steps', isHealth: true }],
        quests: [{ id: 'q1', name: 'Move 8,000 steps', healthThreshold: { metricId: '501', value: 8000, comparison: 'gte' } }],
      },
      '2026-09-10',
    );

    expect(world.quests[0]?.healthThreshold).toEqual({ metricKey: 'steps', value: 8000, comparison: 'gte' });
  });

  it('should skip a malformed or unresolvable health threshold instead of crashing', () => {
    const world = projectWorldState(
      {
        metrics: [{ id: '501', name: 'Steps', isHealth: true }],
        quests: [
          { id: 'q1', name: 'Old shape', healthThreshold: { metric: 'steps', target: 8000, unit: 'steps' } },
          { id: 'q2', name: 'Unknown metric', healthThreshold: { metricId: '999', value: 1, comparison: 'gte' } },
          { id: 'q3', name: 'Bad comparison', healthThreshold: { metricId: '501', value: 8000, comparison: 'more-than' } },
        ],
      },
      '2026-09-10',
    );

    expect(world.quests.map(quest => quest.healthThreshold)).toEqual([null, null, null]);
  });

  it('should treat a null home amount in the home currency as the amount', () => {
    const { expenses } = projectFinanceRows({
      expenses: [{ id: 'e1', amountMinor: 6415, currency: 'EUR', homeAmountMinor: null, fxRate: null, occurredOn: '2026-09-10', loggedAt: '2026-09-10T10:00:00Z' }],
    });

    expect(expenses).toHaveLength(1);
    expect(homeAmountOf(expenses[0]!, 'EUR')).toBe(6415);
  });
});

describe('progression contract (P1-17)', () => {
  const ACCOUNT = {
    level: 5,
    totalXp: '1703',
    xpIntoLevel: 0,
    xpForNextLevel: 1118,
    hpToday: 4,
    hpMax: 5,
    coins: 12,
    warmthState: 'warm',
    displayedTitleId: 'quiet_climber',
    shieldsAvailable: 3,
    shieldCap: 6,
    crown: { label: 'this week', cadence: 'weekly', periodStart: '2026-08-24', closesOn: '2026-08-30', dayIndex: 1, dayCount: 7, keptPercent: 100 },
    persona: 'returner',
    comeback: null,
  };

  function page(cursor: string, domains: DeltaPage['domains']): DeltaPage {
    return { cursor, hasMore: false, domains, tombstones: [] };
  }

  it('should accept the progression fields and domains', async () => {
    expect(SYNC_DOMAINS).toEqual(expect.arrayContaining(['hero_events', 'progress_counters']));
    expect(SNAPSHOT_DOMAINS).toContain('progress_counters');
    expect(SNAPSHOT_DOMAINS).not.toContain('hero_events');

    const backing = sharedBacking();
    const first = createTestEngine({
      backing,
      pages: [
        page('10', {
          account: [ACCOUNT],
          quest_logs: [{ id: '71', questId: '7', date: '2026-08-23', state: 'missed', shielded: true }],
          hero_events: [
            { id: '1', type: 'crown_init', date: '2026-08-24', xpDelta: 0, syncSeq: '9' },
            { id: '2', type: 'quest_complete', date: '2026-08-24', xpDelta: 12, syncSeq: '10' },
          ],
          progress_counters: [{ questsCompleted: 4, crownsBanked: 1 }],
        }),
      ],
    });
    await first.engine.start();

    const second = createTestEngine({
      backing,
      pages: [
        page('11', {
          hero_events: [{ id: '3', type: 'level_up', date: '2026-08-24', levelAfter: 6, syncSeq: '11' }],
          progress_counters: [{ questsCompleted: 5, crownsBanked: 1 }],
        }),
      ],
    });
    await second.engine.start();

    expect((await second.store.readDomain('hero_events')).map(row => row['id']).sort()).toEqual(['1', '2', '3']);
    expect(await second.store.readDomain('progress_counters')).toEqual([{ questsCompleted: 5, crownsBanked: 1 }]);
    expect((await second.store.readDomain('quest_logs'))[0]).toMatchObject({ shielded: true });

    const rows = second.engine.domains();
    expect(rows.account?.[0]).toMatchObject({ persona: 'returner', shieldsAvailable: 3, crown: { dayCount: 7 } });
    expect(() => projectWorldState(rows, '2026-08-24')).not.toThrow();
  });
});

describe('category archive (P1-18)', () => {
  const HOME = { id: '7', key: 'home', label: 'Home', builtin: true };

  function page(cursor: string, domains: DeltaPage['domains']): DeltaPage {
    return { cursor, hasMore: false, domains, tombstones: [] };
  }

  it('should send category.setArchived to the server', async () => {
    const posted: { type: string; payload: Record<string, unknown> }[] = [];
    const { engine, server } = createTestEngine({
      pages: [
        page('1', { expense_categories: [{ ...HOME, active: true, archivedAt: null }] }),
        page('2', { expense_categories: [{ ...HOME, active: false, archivedAt: '2026-08-24T08:00:00.000Z' }] }),
      ],
      fetchImpl: fake => async (input, init) => {
        if (String(input).includes('/sync/commands')) posted.push(...(JSON.parse(String(init?.body)) as { commands: typeof posted }).commands);
        return fake.fetchImpl(input, init);
      },
    });
    await engine.start();
    const finance = new SyncedFinanceProvider(engine);

    const result = await finance.dispatchCommand({ type: 'category.setArchived', id: 'home', archived: true });
    expect(result.delivery).toMatchObject({ status: 'queued' });
    await engine.sync();

    expect(server.batches.flatMap(batch => batch.types)).toEqual(['category.setArchived']);
    expect(posted[0]).toMatchObject({ type: 'category.setArchived', payload: { categoryId: 'home', archived: true } });

    await finance.reproject();
    expect((await finance.categories()).items.find(slice => slice.category.id === 'home')?.category.archived).toBe(true);
  });
});

describe('expense audit contract (P1-19)', () => {
  const EXPENSE_ID = '0192f1a2-7b3c-7d4e-8f50-1a2b3c4d5e6f';
  const EXPENSE = { id: EXPENSE_ID, amountMinor: '520', amountText: '5.20', currency: 'EUR', categoryId: 'transport', occurredOn: '2026-08-24', note: null, merchant: null };

  function audit(id: string, action: string, changes: Record<string, unknown>[] = []): Record<string, unknown> {
    return { id, accountId: '1', expenseId: EXPENSE_ID, action, changes, deviceId: null, createdAt: '2026-08-24T09:00:00.000Z', syncSeq: id };
  }

  function page(cursor: string, domains: DeltaPage['domains'], tombstones: DeltaPage['tombstones'] = []): DeltaPage {
    return { cursor, hasMore: false, domains, tombstones };
  }

  function requestedDomains(url: string): string[] {
    return new URL(decodeURIComponent(url), 'http://memoir.test').searchParams.get('domains')?.split(',') ?? [];
  }

  it('should accept expense audits as a watermark domain whose earlier rows leave with a deleted expense', async () => {
    expect(SYNC_DOMAINS).toContain('expense_audits');
    expect(NEWER_DOMAINS).toContain('expense_audits');
    expect(SNAPSHOT_DOMAINS).not.toContain('expense_audits');

    const backing = sharedBacking();
    const first = createTestEngine({
      backing,
      pages: [page('11', { expenses: [EXPENSE], expense_audits: [audit('10', 'created'), audit('11', 'updated', [{ field: 'note', from: null, to: 'Oat flat white' }])] })],
    });
    await first.engine.start();

    const second = createTestEngine({
      backing,
      pages: [
        page('14', { expenses: [], expense_audits: [audit('14', 'deleted')] }, [
          { domain: 'expenses', recordId: EXPENSE_ID, syncSeq: '12' },
          { domain: 'expense_audits', recordId: '10', syncSeq: '13' },
          { domain: 'expense_audits', recordId: '11', syncSeq: '13' },
        ]),
      ],
    });
    await second.engine.start();

    expect(await second.store.readDomain('expense_audits')).toEqual([expect.objectContaining({ id: '14', action: 'deleted', changes: [] })]);
    expect(await second.store.readDomain('expenses')).toEqual([]);
    expect(() => projectFinanceRows(second.engine.domains())).not.toThrow();
  });

  it('should backfill expense audits from zero once a server starts serving them', async () => {
    const backing = sharedBacking();
    const older = createTestEngine({ backing, pages: [page('42', { expenses: [EXPENSE] })] });
    await older.engine.start();
    expect(await older.store.readMeta(SYNC_META_KEYS.coveredDomains)).toEqual(['expenses@1']);

    const upgraded = createTestEngine({
      backing,
      pages: [page('43', { expenses: [], expense_audits: [] }), page('11', { expense_audits: [audit('10', 'created'), audit('11', 'updated')] })],
    });
    await upgraded.engine.start();

    expect(upgraded.server.deltaRequests[1]).toContain('since=0');
    expect(requestedDomains(upgraded.server.deltaRequests[1]!)).toEqual(['expense_audits']);
    expect(await upgraded.store.readMeta(SYNC_META_KEYS.cursor)).toBe('43');
    expect((await upgraded.store.readDomain('expense_audits')).map(row => row['id'])).toEqual(['10', '11']);
    expect(await upgraded.store.readMeta(SYNC_META_KEYS.coveredDomains)).toEqual(['expense_audits@1', 'expenses@1']);
  });
});
