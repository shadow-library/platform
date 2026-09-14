import { beforeEach, describe, expect, it } from 'vitest';

import { type Command } from '@/lib/data';
import { type DeltaPage, NEWER_DOMAINS, SYNC_DOMAINS, SYNC_META_KEYS, SyncedDataProvider } from '@/lib/sync';

import { coverageFor, createTestEngine, deltaResponse, domainsExcept, type FakeServer, sharedBacking, type TestEngine } from './sync-harness';

const TODAY = '2026-08-24';

const RECURRENCE = {
  frequency: 'daily',
  interval: 1,
  daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  dayOfMonth: null,
  startDate: TODAY,
  end: { kind: 'never' },
  exceptions: [],
};

function questRow(id: string, name: string): Record<string, unknown> {
  return {
    id,
    name,
    notes: null,
    startTimeMin: 420,
    durationMin: 30,
    statAffinity: 'body',
    strictness: 'routine',
    optionalStreakOptIn: false,
    recurrence: RECURRENCE,
    moduleLink: null,
    reminderEnabled: false,
    reminderLeadMin: 0,
    healthThreshold: null,
    active: true,
    syncSeq: id,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

function page(overrides: Partial<DeltaPage>): DeltaPage {
  return { cursor: '0', hasMore: false, domains: {}, tombstones: [], ...overrides };
}

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

describe('delta ingestion', () => {
  beforeEach(() => setOnline(true));

  it('should mirror keyset rows and advance the cursor', async () => {
    const { engine, store, server } = createTestEngine({ pages: [page({ cursor: '42', domains: { quests: [questRow('1', 'Morning run')] } })] });
    await engine.start();

    expect(await store.readDomain('quests')).toHaveLength(1);
    expect(await store.readMeta('cursor')).toBe('42');
    expect(server.deltaRequests[0]).toContain('since=0');
  });

  it('should send the stored cursor on the next pull', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, pages: [page({ cursor: '42' })] });
    await first.engine.start();

    const second = createTestEngine({ backing, pages: [page({ cursor: '99' })] });
    await second.engine.start();

    expect(second.server.deltaRequests[0]).toContain('since=42');
  });

  it('should drain every page while the server reports more', async () => {
    const { engine, store, server } = createTestEngine({
      pages: [
        page({ cursor: '10', hasMore: true, domains: { quests: [questRow('1', 'Morning run')] } }),
        page({ cursor: '20', hasMore: true, domains: { quests: [questRow('2', 'Evening stretch')] } }),
        page({ cursor: '30', hasMore: false, domains: { quests: [questRow('3', 'Read pages')] } }),
      ],
    });
    await engine.start();

    expect(server.deltaRequests).toHaveLength(3);
    expect(await store.readDomain('quests')).toHaveLength(3);
    expect(await store.readMeta('cursor')).toBe('30');
  });

  it('should absorb a row redelivered by the cursor overlap', async () => {
    const backing = sharedBacking();
    const row = questRow('1', 'Morning run');
    const first = createTestEngine({ backing, pages: [page({ cursor: '10', domains: { quests: [row] } })] });
    await first.engine.start();

    const second = createTestEngine({ backing, pages: [page({ cursor: '11', domains: { quests: [{ ...row, name: 'Morning run, renamed' }] } })] });
    await second.engine.start();

    const rows = await second.store.readDomain('quests');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.['name']).toBe('Morning run, renamed');
  });

  it('should remove a row named by a tombstone', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, pages: [page({ cursor: '10', domains: { quests: [questRow('1', 'Morning run'), questRow('2', 'Evening stretch')] } })] });
    await first.engine.start();

    const second = createTestEngine({ backing, pages: [page({ cursor: '11', tombstones: [{ domain: 'quests', recordId: '1', syncSeq: '11' }] })] });
    await second.engine.start();

    expect((await second.store.readDomain('quests')).map(quest => quest['id'])).toEqual(['2']);
  });

  it('should keep a re-created row whose syncSeq is newer than its tombstone', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, pages: [page({ cursor: '5', domains: { quests: [{ ...questRow('1', 'Morning run'), syncSeq: '5' }] } })] });
    await first.engine.start();

    const tombstone = { domain: 'quests', recordId: '1', syncSeq: '8' };
    const restored = { ...questRow('1', 'Morning run, restored'), syncSeq: '12' };
    const second = createTestEngine({ backing, pages: [page({ cursor: '12', domains: { quests: [restored] }, tombstones: [tombstone] })] });
    await second.engine.start();
    expect((await second.store.readDomain('quests')).map(quest => quest['name'])).toEqual(['Morning run, restored']);

    const overlap = createTestEngine({ backing, pages: [page({ cursor: '12', tombstones: [tombstone] })] });
    await overlap.engine.start();
    expect((await overlap.store.readDomain('quests')).map(quest => quest['name'])).toEqual(['Morning run, restored']);
  });

  it('should remove a row whose tombstone in the same page is newer than it', async () => {
    const { engine, store } = createTestEngine({
      pages: [page({ cursor: '14', domains: { quests: [{ ...questRow('1', 'Morning run'), syncSeq: '12' }] }, tombstones: [{ domain: 'quests', recordId: '1', syncSeq: '14' }] })],
    });
    await engine.start();

    expect(await store.readDomain('quests')).toEqual([]);
  });

  it('should replace a snapshot domain rather than merge it', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, pages: [page({ cursor: '1', domains: { devices: [{ id: 'device-a' }, { id: 'device-b' }] } })] });
    await first.engine.start();

    const second = createTestEngine({ backing, pages: [page({ cursor: '2', domains: { devices: [{ id: 'device-a' }] } })] });
    await second.engine.start();

    expect((await second.store.readDomain('devices')).map(device => device['id'])).toEqual(['device-a']);
  });

  it('should drop the mirror and re-pull from zero when the epoch changes', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, epoch: 'epoch-1', pages: [page({ cursor: '42', domains: { quests: [questRow('1', 'Morning run')] } })] });
    await first.engine.start();
    expect(await first.store.readMeta('cursor')).toBe('42');

    const second = createTestEngine({ backing, epoch: 'epoch-2', pages: [page({ cursor: '7', domains: { quests: [questRow('9', 'Restored quest')] } })] });
    await second.engine.start();

    expect(second.server.deltaRequests[0]).toContain('since=42');
    expect(second.server.deltaRequests[1]).toContain('since=0');
    expect((await second.store.readDomain('quests')).map(quest => quest['id'])).toEqual(['9']);
    expect(await second.store.readMeta('sync-epoch')).toBe('epoch-2');
  });

  it('should keep the queue through an epoch reset', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, epoch: 'epoch-1' });
    await first.engine.start();

    setOnline(false);
    await first.engine.enqueue({ type: 'quest.complete', occurrenceId: `1:${TODAY}` }, TODAY);
    setOnline(true);

    const second = createTestEngine({ backing, epoch: 'epoch-2', status: () => 200 });
    await second.engine.hydrate();
    expect(second.engine.getSnapshot().queuedCount).toBe(1);
  });
});

/** Stands in for a server released before a domain existed: it refuses the first unknown domain it reads, as `SYN_001`. */
function refusingDomains(unknown: string[], named = true, refusing: (server: FakeServer) => boolean = () => true): (server: FakeServer) => typeof fetch {
  return server =>
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input));
      const requested = url.includes('/sync/delta') ? (new URL(url, 'http://memoir.test').searchParams.get('domains')?.split(',') ?? []) : [];
      const refused = refusing(server) ? requested.find(domain => unknown.includes(domain)) : undefined;
      if (!refused) return server.fetchImpl(input, init);
      const message = named ? `Unknown sync domain '${refused}'` : 'Validation failed';
      return new Response(JSON.stringify({ code: 'SYN_001', message }), { status: 400, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
}

function requestedDomains(url: string): string[] {
  return new URL(decodeURIComponent(url), 'http://memoir.test').searchParams.get('domains')?.split(',') ?? [];
}

describe('domain coverage', () => {
  beforeEach(() => setOnline(true));

  it('should keep syncing against a server that rejects a newer domain', async () => {
    const { engine, store, server } = createTestEngine({
      fetchImpl: refusingDomains(['progress_counters', 'hero_events'], false),
      pages: [page({ cursor: '42', domains: { quests: [questRow('1', 'Morning run')] } }), page({ cursor: '43' })],
    });
    await engine.start();
    await engine.sync();

    expect(engine.getSnapshot()).toMatchObject({ state: 'online', readiness: { kind: 'ready' } });
    expect(await store.readDomain('quests')).toHaveLength(1);
    expect(server.deltaRequests).toHaveLength(2);
    for (const url of server.deltaRequests) expect(requestedDomains(url)).not.toEqual(expect.arrayContaining(['hero_events']));
    for (const url of server.deltaRequests) expect(requestedDomains(url)).not.toContain('progress_counters');
    expect(await store.readMeta(SYNC_META_KEYS.coveredDomains)).toEqual(coverageFor(domainsExcept(...NEWER_DOMAINS, 'quest_logs')));
  });

  it('should treat a missing domain key as a refusal', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, pages: [page({ cursor: '42', domains: { quests: [questRow('1', 'Morning run')] } })] });
    await first.engine.start();
    expect(await first.store.readMeta(SYNC_META_KEYS.coveredDomains)).toEqual(coverageFor(SYNC_DOMAINS));

    const second = createTestEngine({ backing, serves: domainsExcept('reschedule_events'), pages: [page({ cursor: '43' })] });
    await second.engine.start();
    await second.engine.sync();

    expect(second.engine.getSnapshot()).toMatchObject({ state: 'online', readiness: { kind: 'ready' } });
    expect(requestedDomains(second.server.deltaRequests.at(-1)!)).not.toContain('reschedule_events');
    expect(second.server.deltaRequests.filter(url => url.includes('since=0')).map(requestedDomains)).toEqual([['expense_audits', 'hero_events']]);
    expect(await second.store.readMeta(SYNC_META_KEYS.coveredDomains)).toEqual(coverageFor(domainsExcept('reschedule_events', 'quest_logs')));
  });

  it('should not pull everything when every requested domain is refused', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, pages: [page({ cursor: '42', domains: { quests: [] } })] });
    await first.engine.start();
    await first.store.writeMeta(SYNC_META_KEYS.coveredDomains, coverageFor(domainsExcept('hero_events')));

    const second = createTestEngine({
      backing,
      fetchImpl: refusingDomains(['hero_events'], true, server => server.pageIndex > 0),
      pages: [page({ cursor: '43' }), page({ cursor: '43' })],
    });
    await second.engine.start();

    expect(second.engine.getSnapshot().state).toBe('online');
    for (const url of second.server.deltaRequests) expect(requestedDomains(url)).not.toEqual([]);
    expect(await second.store.readMeta(SYNC_META_KEYS.coveredDomains)).not.toContain('hero_events@1');
  });

  /** Backfills `hero_events` over two pages while another tab, on a server that refuses it, starts during the given backfill page and withdraws coverage. */
  async function backfillWithdrawnDuringPage(withdrawOnPage: number): Promise<TestEngine> {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, pages: [page({ cursor: '42', domains: { quests: [] } })] });
    await first.engine.start();
    await first.store.writeMeta(SYNC_META_KEYS.coveredDomains, coverageFor(domainsExcept('hero_events')));

    const heroEvent = (id: string): Record<string, unknown> => ({ id, type: 'quest_complete', date: TODAY, syncSeq: id });
    const olderTab = createTestEngine({ backing, fetchImpl: refusingDomains(['hero_events']), pages: [page({ cursor: '43' })] });
    let backfillPages = 0;
    const withdrawingDuringBackfill = (server: FakeServer): typeof fetch =>
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (requestedDomains(String(input)).join(',') === 'hero_events' && ++backfillPages === withdrawOnPage) await olderTab.engine.start();
        return server.fetchImpl(input, init);
      }) as typeof fetch;
    const backfilling = createTestEngine({
      backing,
      fetchImpl: withdrawingDuringBackfill,
      pages: [
        page({ cursor: '43' }),
        page({ cursor: '10', hasMore: true, domains: { hero_events: [heroEvent('10')] } }),
        page({ cursor: '20', domains: { hero_events: [heroEvent('20')] } }),
      ],
    });
    await backfilling.engine.start();
    return backfilling;
  }

  it('should not record coverage that another tab withdrew during a backfill', async () => {
    const backfilling = await backfillWithdrawnDuringPage(1);

    expect(backfilling.server.deltaRequests.filter(url => requestedDomains(url).join(',') === 'hero_events')).toHaveLength(1);
    expect(await backfilling.store.readMeta(SYNC_META_KEYS.coveredDomains)).not.toContain('hero_events@1');
    expect(await backfilling.store.readMeta(SYNC_META_KEYS.backfillCursor)).toBeNull();
  });

  it('should not record coverage that another tab withdrew during the last backfill page', async () => {
    const backfilling = await backfillWithdrawnDuringPage(2);

    expect(backfilling.server.deltaRequests.filter(url => requestedDomains(url).join(',') === 'hero_events')).toHaveLength(2);
    expect(await backfilling.store.readMeta(SYNC_META_KEYS.coveredDomains)).not.toContain('hero_events@1');
  });

  it('should not re-backfill served domains when a retry refuses the same domains again', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, pages: [page({ cursor: '42', domains: { quests: [] } })] });
    await first.engine.start();

    const second = createTestEngine({ backing, serves: domainsExcept('reschedule_events'), pages: [page({ cursor: '43' })] });
    await second.engine.start();
    for (let pass = 0; pass < 60; pass += 1) await second.engine.sync();

    expect(second.server.deltaRequests.filter(url => requestedDomains(url).includes('reschedule_events')).length).toBeGreaterThan(1);
    expect(second.server.deltaRequests.filter(url => url.includes('since=0')).map(requestedDomains)).toEqual([['expense_audits', 'hero_events']]);
  });

  it('should not mark an empty mirror ready when every domain is refused', async () => {
    const { engine, store, server } = createTestEngine({ serves: [], pages: [page({ cursor: '5' })] });
    await engine.start();
    await engine.sync();

    expect(engine.getSnapshot().readiness).toEqual({ kind: 'failed', reason: 'server' });
    expect(await store.readMeta(SYNC_META_KEYS.mirrorReady)).toBeNull();
    expect(await store.readMeta(SYNC_META_KEYS.cursor)).toBeUndefined();
    for (const url of server.deltaRequests) expect(requestedDomains(url)).not.toEqual([]);
  });

  it('should backfill a newly served keyset domain without moving the main cursor', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, serves: domainsExcept('hero_events'), pages: [page({ cursor: '42', domains: { quests: [questRow('1', 'Morning run')] } })] });
    await first.engine.start();

    const heroEvent = (id: string): Record<string, unknown> => ({ id, type: 'quest_complete', date: TODAY, xpDelta: 12, syncSeq: id });
    const second = createTestEngine({
      backing,
      pages: [page({ cursor: '43', domains: { quests: [], hero_events: [] } }), page({ cursor: '17', domains: { hero_events: [heroEvent('5'), heroEvent('17')] } })],
    });
    await second.engine.start();

    expect(second.server.deltaRequests[0]).toContain('since=42');
    expect(second.server.deltaRequests[1]).toContain('since=0');
    expect(requestedDomains(second.server.deltaRequests[1]!)).toEqual(['hero_events', 'quest_logs']);
    expect(await second.store.readMeta(SYNC_META_KEYS.cursor)).toBe('43');
    expect((await second.store.readDomain('hero_events')).map(row => row['id']).sort()).toEqual(['17', '5']);
    expect(await second.store.readMeta(SYNC_META_KEYS.coveredDomains)).toEqual(coverageFor(SYNC_DOMAINS));
  });

  it('should re-serve quest logs when their row version changes', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, pages: [page({ cursor: '42', domains: { quest_logs: [{ id: '71', questId: '1', date: TODAY, state: 'missed' }] } })] });
    await first.engine.start();
    await first.store.writeMeta(SYNC_META_KEYS.coveredDomains, [...coverageFor(domainsExcept('quest_logs')), 'quest_logs@1']);

    const second = createTestEngine({
      backing,
      pages: [
        page({ cursor: '43', domains: { quest_logs: [] } }),
        page({ cursor: '42', domains: { quest_logs: [{ id: '71', questId: '1', date: TODAY, state: 'missed', shielded: true }] } }),
      ],
    });
    await second.engine.start();

    expect(requestedDomains(second.server.deltaRequests[1]!)).toEqual(['quest_logs']);
    expect(second.server.deltaRequests[1]).toContain('since=0');
    expect(await second.store.readDomain('quest_logs')).toEqual([expect.objectContaining({ id: '71', shielded: true })]);
    expect(await second.store.readMeta(SYNC_META_KEYS.cursor)).toBe('43');
    expect(await second.store.readMeta(SYNC_META_KEYS.coveredDomains)).toEqual(coverageFor(SYNC_DOMAINS));
  });

  it('should not backfill a domain the server does not serve', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, pages: [page({ cursor: '42', domains: { quests: [questRow('1', 'Morning run')] } })] });
    await first.engine.start();

    const second = createTestEngine({ backing, fetchImpl: refusingDomains(NEWER_DOMAINS), pages: [page({ cursor: '43', domains: { quests: [] } })] });
    await second.engine.start();

    expect(second.server.deltaRequests).toHaveLength(1);
    expect(requestedDomains(second.server.deltaRequests[0]!)).not.toContain('hero_events');
    expect(second.engine.getSnapshot().state).toBe('online');
    expect(await second.store.readMeta(SYNC_META_KEYS.coveredDomains)).toEqual(coverageFor(domainsExcept(...NEWER_DOMAINS, 'quest_logs')));
    expect(await second.store.readDomain('hero_events')).toEqual([]);
  });

  it('should not record quest_logs@2 against a server that refuses the newer domains', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, pages: [page({ cursor: '42', domains: { quests: [], quest_logs: [], hero_events: [] } })] });
    await first.engine.start();
    expect(await first.store.readMeta(SYNC_META_KEYS.coveredDomains)).toEqual(coverageFor(SYNC_DOMAINS));

    const rolledBack = createTestEngine({
      backing,
      fetchImpl: refusingDomains(NEWER_DOMAINS),
      pages: [page({ cursor: '43', domains: { quests: [], quest_logs: [] } })],
    });
    await rolledBack.engine.start();
    await rolledBack.engine.sync();

    expect(await rolledBack.store.readMeta(SYNC_META_KEYS.coveredDomains)).toEqual(coverageFor(domainsExcept(...NEWER_DOMAINS, 'quest_logs')));
    expect(rolledBack.server.deltaRequests.filter(url => url.includes('since=0'))).toEqual([]);

    const fresh = createTestEngine({ fetchImpl: refusingDomains(NEWER_DOMAINS), pages: [page({ cursor: '5', domains: { quests: [], quest_logs: [] } })] });
    await fresh.engine.start();
    expect(await fresh.store.readMeta(SYNC_META_KEYS.coveredDomains)).toEqual(coverageFor(domainsExcept(...NEWER_DOMAINS, 'quest_logs')));
  });

  it('should backfill hero_events again after a server refused it', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, pages: [page({ cursor: '42', domains: { quests: [], hero_events: [] } })] });
    await first.engine.start();

    let upgraded = false;
    const heroEvent = { id: '3', type: 'level_up', date: TODAY, levelAfter: 2, syncSeq: '3' };
    const second = createTestEngine({
      backing,
      fetchImpl: refusingDomains(NEWER_DOMAINS, true, () => !upgraded),
      pages: [page({ cursor: '43', domains: { quests: [], hero_events: [heroEvent] } })],
    });
    await second.engine.start();
    expect(await second.store.readMeta(SYNC_META_KEYS.coveredDomains)).toEqual(coverageFor(domainsExcept(...NEWER_DOMAINS, 'quest_logs')));

    upgraded = true;
    for (let pass = 0; pass < 19; pass += 1) await second.engine.sync();
    expect(second.server.deltaRequests.some(url => requestedDomains(url).includes('hero_events'))).toBe(false);

    await second.engine.sync();
    const backfills = second.server.deltaRequests.filter(url => url.includes('since=0'));
    expect(backfills.map(requestedDomains)).toEqual([['expense_audits', 'hero_events', 'quest_logs', 'reschedule_events']]);
    expect((await second.store.readDomain('hero_events')).map(row => row['id'])).toEqual(['3']);
    expect(await second.store.readMeta(SYNC_META_KEYS.coveredDomains)).toEqual(coverageFor(SYNC_DOMAINS));
  });

  it('should ask for refused domains again once the epoch changes', async () => {
    const { engine, server } = createTestEngine({
      epoch: 'epoch-1',
      fetchImpl: refusingDomains(['progress_counters', 'hero_events'], true, fake => fake.epoch === 'epoch-1'),
      pages: [page({ cursor: '5', domains: { quests: [] } })],
    });
    await engine.start();
    expect(server.deltaRequests.every(url => !requestedDomains(url).includes('hero_events'))).toBe(true);

    server.epoch = 'epoch-2';
    await engine.sync();

    expect(requestedDomains(server.deltaRequests.at(-1)!)).toEqual(expect.arrayContaining(['progress_counters', 'hero_events']));
  });

  it('should resume a backfill from its saved cursor', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, pages: [page({ cursor: '42', domains: { quests: [] } })] });
    await first.engine.start();
    await first.store.writeMeta(SYNC_META_KEYS.coveredDomains, coverageFor(domainsExcept('hero_events')));

    const heroEvent = (id: string): Record<string, unknown> => ({ id, type: 'quest_complete', date: TODAY, syncSeq: id });
    const routed = (server: FakeServer): typeof fetch =>
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = decodeURIComponent(String(input));
        if (!url.includes('/sync/delta')) return server.fetchImpl(input, init);
        server.deltaRequests.push(url);
        const backfill = requestedDomains(url).join(',') === 'hero_events';
        const since = new URL(url, 'http://memoir.test').searchParams.get('since');
        const body = !backfill
          ? page({ cursor: '43', domains: { quests: [], hero_events: [] } })
          : since === '0'
            ? page({ cursor: '10', hasMore: true, domains: { hero_events: [heroEvent('10')] } })
            : page({ cursor: '20', domains: { hero_events: [heroEvent('20')] } });
        return deltaResponse(input, body, server.epoch);
      }) as typeof fetch;

    const second = createTestEngine({ backing, maxPages: 1, fetchImpl: routed });
    await second.engine.start();
    expect(await second.store.readMeta(SYNC_META_KEYS.backfillCursor)).toEqual({ domains: ['hero_events'], since: '10' });
    expect(second.engine.getSnapshot().state).toBe('failed');

    await second.engine.sync();

    const backfills = second.server.deltaRequests.filter(url => requestedDomains(url).join(',') === 'hero_events');
    expect(backfills.map(url => new URL(url, 'http://memoir.test').searchParams.get('since'))).toEqual(['0', '10']);
    expect((await second.store.readDomain('hero_events')).map(row => row['id']).sort()).toEqual(['10', '20']);
    expect(await second.store.readMeta(SYNC_META_KEYS.backfillCursor)).toBeNull();
    expect(await second.store.readMeta(SYNC_META_KEYS.cursor)).toBe('43');
    expect(second.engine.getSnapshot().state).toBe('online');
  });

  it('should forget coverage when the epoch resets', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, epoch: 'epoch-1', pages: [page({ cursor: '42', domains: { quests: [], hero_events: [] } })] });
    await first.engine.start();
    expect(await first.store.readMeta(SYNC_META_KEYS.coveredDomains)).toEqual(coverageFor(SYNC_DOMAINS));

    const second = createTestEngine({ backing, epoch: 'epoch-2', serves: domainsExcept('hero_events'), pages: [page({ cursor: '7', domains: { quests: [] } })] });
    await second.engine.start();

    expect(second.server.deltaRequests).toHaveLength(2);
    expect(await second.store.readMeta(SYNC_META_KEYS.coveredDomains)).toEqual(coverageFor(domainsExcept('hero_events', 'quest_logs')));
  });
});

describe('SyncedDataProvider', () => {
  beforeEach(() => setOnline(true));

  it('should render the day from the mirrored rows', async () => {
    const { engine } = createTestEngine({ pages: [page({ cursor: '10', domains: { quests: [questRow('1', 'Morning run')] } })] });
    await engine.start();
    const provider = new SyncedDataProvider(engine);
    await provider.reproject();

    const day = await provider.getDay(TODAY);
    expect(day.occurrences.map(occurrence => occurrence.questName)).toEqual(['Morning run']);
    expect(day.occurrences[0]?.state).toBe('upcoming');
  });

  it('should apply a command locally and queue it exactly once', async () => {
    const { engine } = createTestEngine({ pages: [page({ cursor: '10', domains: { quests: [questRow('1', 'Morning run')] } })] });
    await engine.start();
    const provider = new SyncedDataProvider(engine);
    await provider.reproject();
    setOnline(false);

    const command: Command = { type: 'quest.complete', occurrenceId: `1:${TODAY}` };
    const result = await provider.dispatchCommand(command);

    expect(result.status).toBe('applied');
    expect(engine.getSnapshot().queuedCount).toBe(1);
    expect((await provider.getDay(TODAY)).occurrences[0]?.state).toBe('completed');
  });

  it('should replay what is still queued over a freshly projected world', async () => {
    const { engine } = createTestEngine({ pages: [page({ cursor: '10', domains: { quests: [questRow('1', 'Morning run')] } })] });
    await engine.start();
    const provider = new SyncedDataProvider(engine);
    await provider.reproject();
    setOnline(false);

    await provider.dispatchCommand({ type: 'quest.complete', occurrenceId: `1:${TODAY}` });
    await provider.reproject();

    const day = await provider.getDay(TODAY);
    expect(day.occurrences[0]?.state).toBe('completed');
    expect(day.occurrences[0]?.xpAwarded).toBeGreaterThan(0);
  });
});
