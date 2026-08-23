import { beforeEach, describe, expect, it } from 'vitest';

import { type Command } from '@/lib/data';
import { type DeltaPage, SyncedDataProvider } from '@/lib/sync';

import { createTestEngine, sharedBacking } from './sync-harness';

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
