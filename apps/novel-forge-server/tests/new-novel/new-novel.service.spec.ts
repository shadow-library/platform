import { describe, expect, it } from 'bun:test';

import { filterLedgerEntries } from '@modules/ledger/ledger-entries';
import { NewNovelService } from '@modules/new-novel/new-novel.service';

type Row = Record<string, unknown>;

interface Fixture {
  volumes?: Row[];
  chapters?: Row[];
  drafts?: Row[];
  brief?: Row;
  ledgerEntries?: Row[];
  createThrows?: Error;
  sessionThrows?: Error;
}

function makeService(fixture: Fixture = {}) {
  const tx = { marker: 'tx' };
  let transactions = 0;
  const db = {
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      transactions++;
      return run(tx);
    },
    query: {
      volumes: { findMany: async () => fixture.volumes ?? [] },
      chapters: { findMany: async () => fixture.chapters ?? [] },
      drafts: { findMany: async () => fixture.drafts ?? [] },
      briefs: { findFirst: async () => fixture.brief },
    },
  };
  const databaseService = { getPostgresClient: () => db } as never;

  const project = { id: 1n, premise: null, protagonistKey: null, opposition: null, theme: null, readerPromise: null, endingQuestion: null, ending: null };
  const createCalls: { body: Row; tx: unknown }[] = [];
  const projectService = {
    create: async (body: Row, usedTx?: unknown) => {
      createCalls.push({ body, tx: usedTx });
      if (fixture.createThrows) throw fixture.createThrows;
      return project;
    },
    getOrThrow: async () => project,
  } as never;

  let entries: Row[] = (fixture.ledgerEntries ?? []).map((entry, index) => ({ id: BigInt(100 + index), decidedBy: 'author', kind: 'decision', ...entry }));
  let nextEntryId = 1000n;
  const appendCalls: { projectId: bigint; entries: Row[]; tx: unknown }[] = [];
  const supersedeCalls: Row[] = [];
  const withdrawCalls: Row[] = [];
  const ledger = {
    append: async (projectId: bigint, newEntries: Row[], usedTx?: unknown) => {
      appendCalls.push({ projectId, entries: newEntries, tx: usedTx });
      const rows = newEntries.map(entry => ({ ...entry, id: nextEntryId++, projectId }));
      entries = [...entries, ...rows];
      return rows;
    },
    listActive: async (_projectId: bigint, filter?: { topics?: string[] }) => filterLedgerEntries(entries as never, filter as never),
    supersede: async (projectId: bigint, entryId: bigint, next: Row) => {
      supersedeCalls.push({ projectId, entryId, next });
      const previous = entries.find(entry => entry.id === entryId) as Row;
      const successor = { ...next, id: nextEntryId++, projectId, topic: previous.topic };
      entries = [...entries, successor];
      return successor;
    },
    withdraw: async (projectId: bigint, entryId: bigint, reason: string) => {
      withdrawCalls.push({ projectId, entryId, reason });
      entries = entries.filter(entry => entry.id !== entryId);
      return {};
    },
  } as never;

  const notesReplaceCalls: { projectId: bigint; notes: string; tx: unknown }[] = [];
  const notes = {
    replace: async (projectId: bigint, text: string, usedTx?: unknown) => {
      notesReplaceCalls.push({ projectId, notes: text, tx: usedTx });
    },
    read: async () => ({ text: '' }),
  } as never;

  const sessionCalls: { projectId: bigint; input: Row; tx: unknown }[] = [];
  const chat = {
    createSession: async (projectId: bigint, input: Row, usedTx?: unknown) => {
      sessionCalls.push({ projectId, input, tx: usedTx });
      if (fixture.sessionThrows) throw fixture.sessionThrows;
      return { id: 'session-1' };
    },
  } as never;

  const service = new NewNovelService(databaseService, projectService, ledger, notes, chat);
  return { service, createCalls, appendCalls, supersedeCalls, withdrawCalls, notesReplaceCalls, sessionCalls, tx, transactions: () => transactions };
}

describe('NewNovelService.createWithNotes', () => {
  it('should trim the title and create a new_novel project', async () => {
    const { service, createCalls } = makeService();

    await service.createWithNotes({ title: '  The Tide Bargain  ' });

    expect(createCalls[0]?.body).toMatchObject({ name: 'The Tide Bargain', title: 'The Tide Bargain', kind: 'new_novel' });
  });

  it('should pass the requested cost tier through, and leave it unset for the owner’s default when none is sent', async () => {
    const { service, createCalls } = makeService();

    await service.createWithNotes({ title: 'The Tide Bargain', costTier: 'economy' });
    await service.createWithNotes({ title: 'The Tide Bargain' });

    expect(createCalls[0]?.body).toMatchObject({ costTier: 'economy' });
    expect(createCalls[1]?.body['costTier']).toBeUndefined();
  });

  it('should refuse a blank title without touching the database', async () => {
    const { service, createCalls } = makeService();

    await expect(service.createWithNotes({ title: '   ' })).rejects.toMatchObject({ code: 'PRJ_014' });
    expect(createCalls).toHaveLength(0);
  });

  it('should hand the notes to the notes store for the new project', async () => {
    const { service, notesReplaceCalls } = makeService();

    await service.createWithNotes({ title: 'The Tide Bargain', notes: 'Mira keeps the lamp lit.' });

    expect(notesReplaceCalls[0]).toMatchObject({ projectId: 1n, notes: 'Mira keeps the lamp lit.' });
  });

  it('should hand an empty string to the notes store when none are given, not skip the call', async () => {
    const { service, notesReplaceCalls } = makeService();

    await service.createWithNotes({ title: 'The Tide Bargain' });

    expect(notesReplaceCalls[0]).toMatchObject({ notes: '' });
  });

  it('should run the project, the notes write and the chat session in the same transaction', async () => {
    const { service, createCalls, notesReplaceCalls, sessionCalls, tx, transactions } = makeService();

    await service.createWithNotes({ title: 'The Tide Bargain', notes: 'Mira keeps the lamp lit.' });

    expect(transactions()).toBe(1);
    expect(createCalls[0]?.tx).toBe(tx);
    expect(notesReplaceCalls[0]?.tx).toBe(tx);
    expect(sessionCalls[0]?.tx).toBe(tx);
  });

  it('should open the chat session without forcing a mode, so ChatService’s own auto default applies', async () => {
    const { service, sessionCalls } = makeService();

    await service.createWithNotes({ title: 'The Tide Bargain' });

    expect(sessionCalls[0]?.input).toEqual({});
  });

  it('should propagate a failure from inside the transaction instead of swallowing it', async () => {
    const { service, createCalls } = makeService({ sessionThrows: new Error('boom') });

    await expect(service.createWithNotes({ title: 'The Tide Bargain' })).rejects.toThrow('boom');
    expect(createCalls).toHaveLength(1);
  });
});

describe('NewNovelService.progress', () => {
  it('should answer the first volume goal from the lowest-ordinal volume and leave the next chapter open with no brief', async () => {
    const { service } = makeService({ volumes: [{ objective: 'Reach the tide court.' }] });

    const progress = await service.progress(1n);

    expect(progress.items.find(item => item.key === 'first_volume_goal')).toMatchObject({ status: 'answered' });
    expect(progress.items.find(item => item.key === 'next_chapter_planned')).toMatchObject({ status: 'open' });
  });

  it('should reflect an active checklist override', async () => {
    const { service } = makeService({ ledgerEntries: [{ topic: 'progress.ending', kind: 'system', decidedBy: 'system', payload: { status: 'undecided' } }] });

    const progress = await service.progress(1n);

    expect(progress.items.find(item => item.key === 'ending')).toMatchObject({ status: 'undecided', overrideEntryId: 100n });
  });

  it('should ignore a forged override that is not kind system', async () => {
    const { service } = makeService({ ledgerEntries: [{ topic: 'progress.ending', kind: 'direction', decidedBy: 'author', payload: { status: 'undecided' } }] });

    const progress = await service.progress(1n);

    expect(progress.items.find(item => item.key === 'ending')).toMatchObject({ status: 'open' });
  });
});

describe('NewNovelService.setProgressOverride', () => {
  it('should refuse a key that is not on the checklist', async () => {
    const { service, appendCalls } = makeService();

    await expect(service.setProgressOverride(1n, 'nonsense', { status: 'dismissed' })).rejects.toMatchObject({ code: 'PRJ_013' });
    expect(appendCalls).toHaveLength(0);
  });

  it('should append a system-owned entry carrying the status in its payload when none exists yet', async () => {
    const { service, appendCalls } = makeService();

    await service.setProgressOverride(1n, 'ending', { status: 'dismissed' });

    expect(appendCalls[0]?.entries[0]).toMatchObject({ kind: 'system', topic: 'progress.ending', decidedBy: 'system', payload: { status: 'dismissed' } });
  });

  it('should supersede an existing override, keeping it system-owned', async () => {
    const { service, supersedeCalls } = makeService({ ledgerEntries: [{ topic: 'progress.ending', kind: 'system', decidedBy: 'system', payload: { status: 'dismissed' } }] });

    await service.setProgressOverride(1n, 'ending', { status: 'undecided' });

    expect(supersedeCalls[0]).toMatchObject({ entryId: 100n, next: { kind: 'system', decidedBy: 'system', payload: { status: 'undecided' } } });
  });
});

describe('NewNovelService.clearProgressOverride', () => {
  it('should withdraw every active entry at the topic', async () => {
    const { service, withdrawCalls } = makeService({
      ledgerEntries: [
        { topic: 'progress.ending', kind: 'system', decidedBy: 'system', payload: { status: 'dismissed' } },
        { topic: 'progress.ending', kind: 'system', decidedBy: 'system', payload: { status: 'undecided' } },
      ],
    });

    await service.clearProgressOverride(1n, 'ending');

    expect(withdrawCalls).toHaveLength(2);
    expect(withdrawCalls.map(call => call.entryId)).toEqual([100n, 101n]);
  });

  it('should do nothing when there is no override to clear', async () => {
    const { service, withdrawCalls } = makeService();

    const progress = await service.clearProgressOverride(1n, 'ending');

    expect(withdrawCalls).toHaveLength(0);
    expect(progress.items.find(item => item.key === 'ending')).toMatchObject({ status: 'open' });
  });
});
