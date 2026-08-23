import { beforeEach, describe, expect, it } from 'vitest';

import { type Command } from '@/lib/data';
import { MemoirStore, Outbox, type OutboxEntry } from '@/lib/sync';

import { applied, createTestEngine, failed, rejected, sharedBacking } from './sync-harness';

const TODAY = '2026-08-24';

function complete(occurrenceId: string): Command {
  return { type: 'quest.complete', occurrenceId };
}

async function queued(outbox: Outbox, questIds: string[]): Promise<OutboxEntry[]> {
  const entries: OutboxEntry[] = [];
  for (const questId of questIds) entries.push((await outbox.enqueue(complete(`${questId}:${TODAY}`), TODAY)) as OutboxEntry);
  return entries;
}

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

describe('Outbox', () => {
  beforeEach(() => setOnline(true));

  it('should keep commands in the order the owner performed them', async () => {
    const outbox = new Outbox(new MemoirStore(sharedBacking()));
    for (const questId of ['a', 'b', 'c']) await outbox.enqueue(complete(`${questId}:${TODAY}`), TODAY);

    const pending = await outbox.pending();
    expect(pending.map(entry => entry.payload['occurrenceId'])).toEqual([`a:${TODAY}`, `b:${TODAY}`, `c:${TODAY}`]);
    expect(pending.map(entry => entry.seq)).toEqual([1, 2, 3]);
  });

  it('should mint a distinct command id per action', async () => {
    const outbox = new Outbox(new MemoirStore(sharedBacking()));
    const first = await outbox.enqueue(complete(`a:${TODAY}`), TODAY);
    const second = await outbox.enqueue(complete(`a:${TODAY}`), TODAY);
    expect(first?.commandId).not.toBe(second?.commandId);
  });

  it('should keep a command with no server handler out of the queue', async () => {
    const outbox = new Outbox(new MemoirStore(sharedBacking()));
    expect(await outbox.enqueue({ type: 'journal.record', text: 'a thought' }, TODAY)).toBeNull();
    expect(await outbox.size()).toBe(0);
  });

  it('should survive a restart of the app', async () => {
    const backing = sharedBacking();
    await new Outbox(new MemoirStore(backing)).enqueue(complete(`a:${TODAY}`), TODAY);
    expect(await new Outbox(new MemoirStore(backing)).size()).toBe(1);
  });

  it('should drop every terminal outcome and keep a failed one queued', async () => {
    const outbox = new Outbox(new MemoirStore(sharedBacking()));
    const entries = await queued(outbox, ['a', 'b', 'c']);
    const [first, second, third] = entries as [OutboxEntry, OutboxEntry, OutboxEntry];

    const result = await outbox.ack(entries, [applied(first.commandId), failed(second.commandId)]);

    expect(result.interrupted).toBe(true);
    expect((await outbox.pending()).map(entry => entry.commandId)).toEqual([second.commandId, third.commandId]);
  });

  it('should surface a rejection once and stop holding the command', async () => {
    const outbox = new Outbox(new MemoirStore(sharedBacking()));
    const [entry] = (await queued(outbox, ['a'])) as [OutboxEntry];

    const result = await outbox.ack([entry], [rejected(entry.commandId, 'That day is already closed.')]);

    expect(result.notices).toEqual([{ commandId: entry.commandId, message: 'That day is already closed.' }]);
    expect(await outbox.size()).toBe(0);
  });

  it('should treat a short outcome list as an interrupted batch', async () => {
    const outbox = new Outbox(new MemoirStore(sharedBacking()));
    const entries = await queued(outbox, ['a', 'b']);
    const [first] = entries as [OutboxEntry, OutboxEntry];

    const result = await outbox.ack(entries, [applied(first.commandId)]);

    expect(result.interrupted).toBe(true);
    expect(await outbox.size()).toBe(1);
  });
});

describe('SyncEngine outbox flush', () => {
  beforeEach(() => setOnline(true));

  it('should post the queue in order in one batch', async () => {
    setOnline(false);
    const { engine, server } = createTestEngine();
    for (const questId of ['a', 'b', 'c']) await engine.enqueue(complete(`${questId}:${TODAY}`), TODAY);

    setOnline(true);
    await engine.sync();

    expect(server.batches).toHaveLength(1);
    expect(server.batches[0]?.types).toEqual(['quest.complete', 'quest.complete', 'quest.complete']);
    expect(engine.getSnapshot().queuedCount).toBe(0);
  });

  it('should flush a command enqueued while online without waiting for a tick', async () => {
    const { engine, server } = createTestEngine();
    await engine.enqueue(complete(`a:${TODAY}`), TODAY);
    await engine.sync();

    expect(server.batches).toHaveLength(1);
    expect(engine.getSnapshot().queuedCount).toBe(0);
  });

  it('should resend from the first unacked command after a batch is cut short', async () => {
    setOnline(false);
    const { engine, server } = createTestEngine({
      outcomes: (batch, attempt) => (attempt === 0 ? [applied(batch.commandIds[0] as string), failed(batch.commandIds[1] as string)] : batch.commandIds.map(id => applied(id))),
    });

    for (const questId of ['a', 'b', 'c']) await engine.enqueue(complete(`${questId}:${TODAY}`), TODAY);

    setOnline(true);
    await engine.sync();

    expect(engine.getSnapshot().state).toBe('failed');
    expect(engine.getSnapshot().queuedCount).toBe(2);

    await engine.sync();

    expect(server.batches).toHaveLength(2);
    expect(server.batches[1]?.commandIds).toEqual(server.batches[0]?.commandIds.slice(1));
    expect(engine.getSnapshot().queuedCount).toBe(0);
  });

  it('should converge silently when a resent command is replayed', async () => {
    const { engine, server } = createTestEngine({ outcomes: (batch, attempt) => (attempt === 0 ? [] : batch.commandIds.map(id => applied(id, true))) });

    await engine.enqueue(complete(`a:${TODAY}`), TODAY);
    await engine.sync();
    expect(engine.getSnapshot().queuedCount).toBe(1);

    await engine.sync();

    expect(server.batches[1]?.commandIds).toEqual(server.batches[0]?.commandIds);
    expect(engine.getSnapshot().queuedCount).toBe(0);
    expect(engine.getSnapshot().notices).toEqual([]);
  });

  it('should hold the queue while offline and flush it once the browser reconnects', async () => {
    setOnline(false);
    const { engine, server } = createTestEngine();

    for (const questId of ['a', 'b']) await engine.enqueue(complete(`${questId}:${TODAY}`), TODAY);
    await engine.sync();

    expect(server.batches).toHaveLength(0);
    expect(engine.getSnapshot().state).toBe('offline');
    expect(engine.getSnapshot().queuedCount).toBe(2);

    setOnline(true);
    await engine.sync();

    expect(server.batches).toHaveLength(1);
    expect(engine.getSnapshot().state).toBe('online');
  });

  it('should keep the queue and the local mirror intact when the session has expired', async () => {
    const backing = sharedBacking();
    const { engine, store } = createTestEngine({ backing, status: () => 401 });
    await store.upsertRows('quests', [{ id: '7', name: 'Morning run' }]);

    await engine.enqueue(complete(`7:${TODAY}`), TODAY);
    await engine.sync();

    expect(engine.getSnapshot().state).toBe('signed-out');
    expect(engine.getSnapshot().queuedCount).toBe(1);
    expect(await store.readDomain('quests')).toHaveLength(1);
    expect(await store.readOutbox()).toHaveLength(1);
  });

  it('should register the device once and reuse the id it stored', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing });
    await first.engine.sync();
    const second = createTestEngine({ backing });
    await second.engine.sync();

    expect(first.server.deviceRegistrations).toHaveLength(1);
    expect(second.server.deviceRegistrations).toEqual(first.server.deviceRegistrations);
  });
});
