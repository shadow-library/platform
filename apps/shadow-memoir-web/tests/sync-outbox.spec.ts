import { beforeEach, describe, expect, it } from 'vitest';

import { type Command, type OutcomeTicket } from '@/lib/data';
import { type DeadLetter, type KeyValueBacking, MemoirStore, Outbox, type OutboxEntry, SYNC_META_KEYS, type SyncEngine } from '@/lib/sync';

import { applied, createTestEngine, failed, type FakeServer, rejected, sharedBacking, superseded } from './sync-harness';

const TODAY = '2026-08-24';

function complete(occurrenceId: string): Command {
  return { type: 'quest.complete', occurrenceId };
}

async function queued(outbox: Outbox, questIds: string[]): Promise<OutboxEntry[]> {
  const entries: OutboxEntry[] = [];
  for (const questId of questIds) entries.push((await outbox.enqueue(complete(`${questId}:${TODAY}`), TODAY)) as OutboxEntry);
  return entries;
}

async function claimed(engine: SyncEngine, command: Command): Promise<OutcomeTicket> {
  const result = await engine.enqueue(command, TODAY, { awaitOutcome: true });
  if (result.status !== 'queued' || !result.ticket) throw new Error(`expected a claimed command, got ${result.status}`);
  return result.ticket;
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
    expect(await outbox.enqueue({ type: 'quest.setActive', questId: 'read-pages', active: false }, TODAY)).toBeNull();
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

    expect(result.progress).toBe('held');
    expect((await outbox.pending()).map(entry => entry.commandId)).toEqual([second.commandId, third.commandId]);
  });

  it('should surface a rejection once and stop holding the command', async () => {
    const outbox = new Outbox(new MemoirStore(sharedBacking()));
    const [entry] = (await queued(outbox, ['a'])) as [OutboxEntry];

    const result = await outbox.ack([entry], [rejected(entry.commandId, 'That day is already closed.')]);

    expect(result.settled).toEqual([{ entry, settlement: { status: 'rejected', code: 'CMD_002', result: {} } }]);
    expect(await outbox.size()).toBe(0);
  });

  it('should treat a short outcome list as an interrupted batch', async () => {
    const outbox = new Outbox(new MemoirStore(sharedBacking()));
    const entries = await queued(outbox, ['a', 'b']);
    const [first] = entries as [OutboxEntry, OutboxEntry];

    const result = await outbox.ack(entries, [applied(first.commandId)]);

    expect(result.progress).toBe('stalled');
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

  it('should mark the engine offline when enqueueing offline', async () => {
    const { engine } = createTestEngine();
    await engine.sync();
    expect(engine.getSnapshot().state).toBe('online');

    setOnline(false);
    await engine.enqueue(complete(`a:${TODAY}`), TODAY);

    expect(engine.getSnapshot()).toMatchObject({ state: 'offline', queuedCount: 1 });
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

describe('SyncEngine outcomes', () => {
  beforeEach(() => setOnline(true));

  it('should notify superseded outcomes', async () => {
    const { engine } = createTestEngine({ outcomes: batch => batch.commandIds.map(id => superseded(id, { state: 'skipped' })) });

    await engine.enqueue(complete(`a:${TODAY}`), TODAY);
    await engine.sync();

    expect(engine.getSnapshot().notices).toEqual([{ commandId: expect.any(String), commandType: 'quest.complete', outcome: 'superseded', code: null }]);
  });

  it('should dead-letter a non-retryable failed command and continue the queue', async () => {
    setOnline(false);
    const { engine, server } = createTestEngine({
      outcomes: (batch, attempt) =>
        attempt === 0
          ? [applied(batch.commandIds[0] as string), failed(batch.commandIds[1] as string, 'Anchor quests require a start time', 'QST_003')]
          : batch.commandIds.map(id => applied(id)),
    });
    for (const questId of ['a', 'b', 'c']) await engine.enqueue(complete(`${questId}:${TODAY}`), TODAY);
    const [, dead, last] = (await engine.outbox.pending()) as [OutboxEntry, OutboxEntry, OutboxEntry];

    setOnline(true);
    await engine.sync();

    expect(server.batches.map(batch => batch.commandIds)).toEqual([[expect.any(String), dead.commandId, last.commandId], [last.commandId]]);
    expect(engine.getSnapshot()).toMatchObject({
      state: 'online',
      queuedCount: 0,
      notices: [{ commandId: dead.commandId, commandType: 'quest.complete', outcome: 'failed', code: 'QST_003' }],
    });
    expect(await engine.outbox.deadLetters()).toEqual([expect.objectContaining({ commandId: dead.commandId, code: 'QST_003', type: 'quest.complete' })]);
  });

  it('should dead-letter a failed command with a code the catalogue does not list', async () => {
    const outbox = new Outbox(new MemoirStore(sharedBacking()));
    const [entry] = (await queued(outbox, ['a'])) as [OutboxEntry];

    const result = await outbox.ack([entry], [failed(entry.commandId, 'Another device changed this record first', 'SYN_409')]);

    expect(result).toEqual({ settled: [{ entry, settlement: { status: 'failed', code: 'SYN_409' } }], progress: 'continue' });
    expect(await outbox.size()).toBe(0);
    expect(await outbox.deadLetters()).toEqual([expect.objectContaining({ commandId: entry.commandId, code: 'SYN_409' })]);
  });

  it('should dead-letter a validation failure and post the commands behind it', async () => {
    setOnline(false);
    const { engine, server } = createTestEngine({
      outcomes: (batch, attempt) => (attempt === 0 ? [failed(batch.commandIds[0] as string, 'Validation Error', 'VALIDATION_ERROR')] : batch.commandIds.map(id => applied(id))),
    });
    for (const questId of ['a', 'b']) await engine.enqueue(complete(`${questId}:${TODAY}`), TODAY);

    setOnline(true);
    await engine.sync();

    expect(server.batches).toHaveLength(2);
    expect(engine.getSnapshot()).toMatchObject({ state: 'online', queuedCount: 0, notices: [expect.objectContaining({ outcome: 'failed', code: 'VALIDATION_ERROR' })] });
  });

  it('should not lose a dead letter added during a dismiss', async () => {
    const backing = sharedBacking();
    const outbox = new Outbox(new MemoirStore(backing));
    const [first, second] = (await queued(outbox, ['a', 'b'])) as [OutboxEntry, OutboxEntry];
    await outbox.ack([first], [failed(first.commandId, 'Anchor quests require a start time', 'QST_003')]);

    let release: () => void = () => undefined;
    const released = new Promise<void>(resolve => (release = resolve));
    const readsBeforeRelease: KeyValueBacking = {
      ...backing,
      get: async <T>(key: string) => {
        const value = await backing.get<T>(key);
        await released;
        return value;
      },
    };
    const dismissal = new Outbox(new MemoirStore(readsBeforeRelease)).dismissDeadLetter(first.commandId);
    await outbox.ack([second], [failed(second.commandId, 'Validation Error', 'VALIDATION_ERROR')]);
    release();
    await dismissal;

    expect((await outbox.deadLetters()).map(letter => letter.commandId)).toEqual([second.commandId]);
  });

  it('should carry over dead letters kept as one list by an earlier release', async () => {
    const store = new MemoirStore(sharedBacking());
    const outbox = new Outbox(store);
    const [first, second] = (await queued(outbox, ['a', 'b'])) as [OutboxEntry, OutboxEntry];
    const letter = (entry: OutboxEntry): DeadLetter => ({ ...entry, code: 'QST_003', deadLetteredAt: entry.createdAt });
    await store.writeMeta(SYNC_META_KEYS.deadLetters, [letter(first), letter(second)]);

    await outbox.dismissDeadLetter(first.commandId);
    const [third] = (await queued(outbox, ['c'])) as [OutboxEntry];
    await outbox.ack([third], [failed(third.commandId, 'Anchor quests require a start time', 'QST_003')]);

    expect((await outbox.deadLetters()).map(kept => kept.commandId)).toEqual([second.commandId, third.commandId]);
    expect(await store.readMeta(SYNC_META_KEYS.deadLetters)).toBeUndefined();
  });

  it('should keep a transient failure queued', async () => {
    const outbox = new Outbox(new MemoirStore(sharedBacking()));
    const [entry] = (await queued(outbox, ['a'])) as [OutboxEntry];

    const result = await outbox.ack([entry], [failed(entry.commandId, 'Receipt scanning is not configured', 'OCR_002')]);

    expect(result).toEqual({ settled: [], progress: 'held' });
    expect(await outbox.size()).toBe(1);
    expect(await outbox.deadLetters()).toEqual([]);
  });

  it('should not post again at once when the server answers none of the batch', async () => {
    const { engine, server } = createTestEngine({ outcomes: () => [applied('not-in-this-batch')] });

    await engine.enqueue(complete(`a:${TODAY}`), TODAY);
    await engine.sync();

    expect(server.batches).toHaveLength(1);
    expect(engine.getSnapshot()).toMatchObject({ state: 'failed', queuedCount: 1 });
  });

  it('should answer a claim as held when a retryable failure keeps it queued', async () => {
    const { engine } = createTestEngine({ outcomeTimeoutMs: 60_000, outcomes: batch => [failed(batch.commandIds[0] as string)] });

    const ticket = await claimed(engine, complete(`a:${TODAY}`));

    await expect(ticket.settled).resolves.toEqual({ status: 'unconfirmed', reason: 'held' });
    expect(await engine.outbox.size()).toBe(1);
  });

  it('should answer a known outcome only after the pull when a held failure shares its batch', async () => {
    let releaseDevice: () => void = () => undefined;
    let releasePull: () => void = () => undefined;
    const device = new Promise<void>(resolve => (releaseDevice = resolve));
    const pull = new Promise<void>(resolve => (releasePull = resolve));
    const { engine } = createTestEngine({
      outcomeTimeoutMs: 60_000,
      outcomes: batch => [rejected(batch.commandIds[0] as string, 'no', 'QST_006'), failed(batch.commandIds[1] as string)],
      fetchImpl: server => async (input, init) => {
        if (String(input).includes('/account/devices/')) await device;
        if (String(input).includes('/sync/delta')) await pull;
        return server.fetchImpl(input, init);
      },
    });

    const pass = engine.sync();
    const first = await claimed(engine, complete(`a:${TODAY}`));
    const second = await claimed(engine, complete(`b:${TODAY}`));
    let firstSettled = false;
    void first.settled.then(() => (firstSettled = true));
    releaseDevice();

    await expect(second.settled).resolves.toEqual({ status: 'unconfirmed', reason: 'held' });
    expect(firstSettled).toBe(false);

    releasePull();
    await pass;
    await expect(first.settled).resolves.toEqual({ status: 'rejected', code: 'QST_006', result: {} });
  });

  it('should say a claim is kept on the device while the account is being deleted', async () => {
    const { engine } = createTestEngine({ outcomeTimeoutMs: 60_000, status: () => 403, errorCode: 'ACC_002' });

    const ticket = await claimed(engine, complete(`a:${TODAY}`));

    await expect(ticket.settled).resolves.toEqual({ status: 'unconfirmed', reason: 'deletion' });
  });

  it('should answer a claim as held when the session expires while it waits', async () => {
    const { engine } = createTestEngine({ outcomeTimeoutMs: 60_000, status: () => 401 });

    const ticket = await claimed(engine, complete(`a:${TODAY}`));

    await expect(ticket.settled).resolves.toEqual({ status: 'unconfirmed', reason: 'held' });
  });

  it('should hand a claimed outcome to its claimant instead of raising a notice', async () => {
    const { engine } = createTestEngine({ outcomes: batch => batch.commandIds.map(id => rejected(id, 'This quest log is outside its 7-day edit window', 'QST_006')) });

    const ticket = await claimed(engine, complete(`a:${TODAY}`));

    await expect(ticket.settled).resolves.toEqual({ status: 'rejected', code: 'QST_006', result: {} });
    expect(engine.getSnapshot().notices).toEqual([]);
  });

  it('should settle a claim from the pass that replays the command after an interrupted one', async () => {
    const { engine, server } = createTestEngine({ outcomes: (batch, attempt) => (attempt === 0 ? [] : batch.commandIds.map(id => applied(id, true))) });

    const ticket = await claimed(engine, complete(`a:${TODAY}`));
    await engine.sync();
    expect(engine.getSnapshot().state).toBe('failed');

    await engine.sync();

    await expect(ticket.settled).resolves.toEqual({ status: 'applied', result: {} });
    expect(server.batches[1]?.commandIds).toEqual(server.batches[0]?.commandIds);
  });

  it('should answer a claim offline straight away when the command is queued offline', async () => {
    setOnline(false);
    const { engine, server } = createTestEngine();

    const ticket = await claimed(engine, complete(`a:${TODAY}`));

    await expect(ticket.settled).resolves.toEqual({ status: 'unconfirmed', reason: 'offline' });
    expect(server.batches).toHaveLength(0);
  });

  it('should answer a slow claim as unconfirmed and raise its late outcome as a notice', async () => {
    let answer: () => void = () => undefined;
    const gate = new Promise<void>(resolve => (answer = resolve));
    const { engine } = createTestEngine({
      outcomeTimeoutMs: 5,
      outcomes: batch => batch.commandIds.map(id => rejected(id, 'no', 'QST_006')),
      fetchImpl: server => async (input, init) => {
        if (String(input).includes('/sync/commands')) await gate;
        return server.fetchImpl(input, init);
      },
    });

    const ticket = await claimed(engine, complete(`a:${TODAY}`));
    await expect(ticket.settled).resolves.toEqual({ status: 'unconfirmed', reason: 'slow' });

    answer();
    await engine.sync();

    expect(engine.getSnapshot().notices).toEqual([expect.objectContaining({ outcome: 'rejected', code: 'QST_006' })]);
  });

  it('should raise a released claim’s outcome as a notice', async () => {
    const { engine } = createTestEngine({ outcomes: batch => batch.commandIds.map(id => rejected(id, 'no', 'FIN_003')) });

    const ticket = await claimed(engine, complete(`a:${TODAY}`));
    await ticket.settled;
    ticket.release();

    expect(engine.getSnapshot().notices).toEqual([expect.objectContaining({ outcome: 'rejected', code: 'FIN_003' })]);
  });

  it('should refuse a claim when the session changes account while it waits', async () => {
    let principal = 'usr_A';
    const { engine, server } = createTestEngine({ accountId: 'usr_A', principal: async () => principal });
    await engine.start();
    principal = 'usr_B';

    const ticket = await claimed(engine, complete(`a:${TODAY}`));

    await expect(ticket.settled).resolves.toEqual({ status: 'refused', boundary: 'principal-changed' });
    expect(server.batches).toHaveLength(0);
  });

  it('should post a command enqueued during a running pass without waiting for another trigger', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => (release = resolve));
    const { engine, server } = createTestEngine({
      fetchImpl: server => async (input, init) => {
        if (String(input).includes('/sync/delta')) await held;
        return server.fetchImpl(input, init);
      },
    });

    const pass = engine.sync();
    const ticket = await claimed(engine, complete(`a:${TODAY}`));
    release();
    await pass;

    await expect(ticket.settled).resolves.toEqual({ status: 'applied', result: {} });
    expect(server.batches).toHaveLength(1);
  });
});

describe('SyncEngine fresh pass', () => {
  beforeEach(() => setOnline(true));

  function heldDeltaEngine(): { engine: SyncEngine; server: FakeServer; hold: () => () => void } {
    let held = Promise.resolve();
    const { engine, server } = createTestEngine({
      fetchImpl: fake => async (input, init) => {
        if (String(input).includes('/sync/delta')) await held;
        return fake.fetchImpl(input, init);
      },
    });
    const hold = (): (() => void) => {
      let release: () => void = () => undefined;
      held = new Promise<void>(resolve => (release = resolve));
      return release;
    };
    return { engine, server, hold };
  }

  it('should run a new pass when a fresh sync is requested during an in-flight pass', async () => {
    const { engine, server, hold } = heldDeltaEngine();
    const release = hold();

    const passes = [engine.sync(), engine.sync(), engine.sync({ fresh: true }), engine.sync({ fresh: true, background: true })];
    release();
    await Promise.all(passes);

    expect(server.deltaRequests).toHaveLength(2);
  });

  it('should keep a fresh follow-up pass quiet only when every caller waiting on it asked for a background pass', async () => {
    const { engine, hold } = heldDeltaEngine();
    await engine.start();
    const states: string[] = [];
    engine.subscribe(() => states.push(engine.getSnapshot().state));

    let release = hold();
    const quiet = [engine.sync({ background: true }), engine.sync({ fresh: true, background: true })];
    release();
    await Promise.all(quiet);
    expect(states).not.toContain('syncing');

    release = hold();
    const announced = [engine.sync({ background: true }), engine.sync({ fresh: true, background: true }), engine.sync({ fresh: true })];
    release();
    await Promise.all(announced);
    expect(states).toContain('syncing');
  });
});
