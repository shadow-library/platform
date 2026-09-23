import { describe, expect, it, mock } from 'bun:test';

import { authorSuccessor, ledgerEntryStatus, LedgerService } from '@modules/blueprint/ledger/ledger.service';
import { type Ledger } from '@server/database';

function entry(overrides: Partial<Ledger.Entry> = {}): Ledger.Entry {
  return {
    id: 1n,
    projectId: 7n,
    kind: 'decision',
    phase: 'heart',
    topic: 'theme',
    statement: 'Is a promise kept to the dead worth breaking a promise to the living?',
    why: 'It is the question under every chapter of the ferry route.',
    rejectedAlternatives: ['Can a town forgive a flood?'],
    writerLine: 'Every chapter tests one promise.',
    decidedBy: 'author',
    stepKey: null,
    payload: { drivers: ['slice_of_life'] },
    links: { bibleDocuments: [{ section: 'project', slug: 'theme' }] },
    supersedesId: null,
    supersededAt: null,
    withdrawnReason: null,
    createdAt: new Date(0),
    ...overrides,
  };
}

interface FakeState {
  projectKind?: string | null;
  stored?: Ledger.Entry;
  marked?: Ledger.Entry[];
  locked?: Ledger.Entry[];
}

function fakeLedger(state: FakeState = {}) {
  const inserted: Ledger.NewEntry[] = [];
  const updates: Record<string, unknown>[] = [];
  const transaction = mock(async (run: (tx: unknown) => Promise<unknown>) => run(db));
  const db = {
    query: {
      projects: { findFirst: mock(async () => (state.projectKind === null ? undefined : { kind: state.projectKind ?? 'new_novel' })) },
      decisionLedgerEntries: { findFirst: mock(async () => state.stored), findMany: mock(async () => []) },
    },
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        const [locked] = state.locked ?? [];
        return { where: () => ({ returning: async () => state.marked ?? (locked ? [{ ...locked, ...values }] : []) }) };
      },
    }),
    insert: () => ({
      values: (values: Ledger.NewEntry | Ledger.NewEntry[]) => {
        const rows = [values].flat();
        inserted.push(...rows);
        return { returning: () => Promise.resolve(rows.map((row, index) => entry({ ...(row as Partial<Ledger.Entry>), id: 100n + BigInt(index) }))) };
      },
    }),
    select: () => ({ from: () => ({ where: () => ({ for: async () => state.locked ?? [] }) }) }),
    transaction,
  };
  const databaseService = { getPostgresClient: () => db, translateError: (err: unknown) => Promise.reject(err) };
  return { service: new LedgerService(databaseService as never), db, inserted, updates, transaction };
}

describe('LedgerService.supersede', () => {
  it('should mark only the old entry superseded and append a successor that keeps its topic and phase', async () => {
    const old = entry({ id: 5n });
    const { service, inserted, updates, transaction } = fakeLedger({ marked: [old] });

    const successor = await service.supersede(7n, 5n, { kind: 'decision', decidedBy: 'author', statement: 'Is a promise to the dead a promise at all?' });

    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0] ?? {})).toEqual(['supersededAt']);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ projectId: 7n, supersedesId: 5n, topic: 'theme', phase: 'heart', statement: 'Is a promise to the dead a promise at all?' });
    expect(successor.supersedesId).toBe(5n);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('should refuse to supersede an entry that is already superseded', async () => {
    const { service, inserted } = fakeLedger({ marked: [], stored: entry({ supersededAt: new Date(1) }) });

    await expect(service.supersede(7n, 1n, { kind: 'decision', decidedBy: 'author', statement: 'Second try' })).rejects.toMatchObject({ code: 'LDG_002' });
    expect(inserted).toHaveLength(0);
  });

  it('should answer a missing entry with not found', async () => {
    const { service } = fakeLedger({ marked: [] });

    await expect(service.supersede(7n, 99n, { kind: 'decision', decidedBy: 'author', statement: 'Nothing there' })).rejects.toMatchObject({ code: 'LDG_001' });
  });

  it('should run inside the caller transaction instead of opening its own', async () => {
    const { service, db, transaction } = fakeLedger({ marked: [entry()] });

    await service.supersede(7n, 1n, { kind: 'system', decidedBy: 'system', statement: 'Gate opened' }, db as never);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('should refuse a curated project', async () => {
    const { service } = fakeLedger({ projectKind: 'curated', marked: [entry()] });

    await expect(service.supersede(7n, 1n, { kind: 'decision', decidedBy: 'author', statement: 'Anything' })).rejects.toMatchObject({ code: 'PRJ_009' });
  });

  it('should refuse the author a second supersede of the same entry through the read guard', async () => {
    const { service, inserted } = fakeLedger({ stored: entry({ supersededAt: new Date(1) }) });

    await expect(service.supersedeByAuthor(7n, 1n, { statement: 'Reworded again' })).rejects.toMatchObject({ code: 'LDG_002' });
    expect(inserted).toHaveLength(0);
  });
});

describe('LedgerService.append', () => {
  it('should append several entries in one statement', async () => {
    const { service, inserted } = fakeLedger();

    const rows = await service.append(7n, [
      { kind: 'direction', phase: 'idea', topic: 'taste', statement: 'Quiet mornings over battles', decidedBy: 'author' },
      { kind: 'rejected', phase: 'idea', topic: 'concepts', statement: 'A chosen-one prophecy', why: 'Feels predetermined', decidedBy: 'author' },
    ]);

    expect(rows).toHaveLength(2);
    expect(inserted.map(row => row.kind)).toEqual(['direction', 'rejected']);
    expect(inserted[1]).toMatchObject({ why: 'Feels predetermined', rejectedAlternatives: [], links: {}, supersedesId: null });
  });

  it('should write nothing for an empty batch', async () => {
    const { service, inserted } = fakeLedger({ projectKind: null });

    expect(await service.append(7n, [])).toEqual([]);
    expect(inserted).toHaveLength(0);
  });
});

describe('LedgerService.linkEntry', () => {
  it('should merge new links into the existing ones', async () => {
    const { service, updates } = fakeLedger({ locked: [entry({ links: { entityKeys: ['ferrywoman'], briefChapters: [3] } })] });

    const linked = await service.linkEntry(7n, 1n, { entityKeys: ['ferrywoman', 'harbour_clerk'], briefChapters: [1, 3] });

    expect(updates[0]).toEqual({ links: { entityKeys: ['ferrywoman', 'harbour_clerk'], briefChapters: [1, 3] } });
    expect(linked.links.entityKeys).toEqual(['ferrywoman', 'harbour_clerk']);
  });

  it('should answer an unknown entry with not found', async () => {
    const { service } = fakeLedger({ locked: [] });

    await expect(service.linkEntry(7n, 2n, { arcKeys: ['arc_1'] })).rejects.toMatchObject({ code: 'LDG_001' });
  });
});

describe('authorSuccessor', () => {
  it('should keep why, writer line, alternatives, payload and links when a decision is reworded', () => {
    const previous = entry();

    const next = authorSuccessor(previous, { statement: 'Reworded theme' });

    expect(next).toMatchObject({ kind: 'decision', decidedBy: 'author', statement: 'Reworded theme', why: previous.why, writerLine: previous.writerLine, links: previous.links });
    expect(next.rejectedAlternatives).toEqual(previous.rejectedAlternatives);
    expect(next.payload).toEqual(previous.payload);
  });

  it('should clear a text field sent as an empty string', () => {
    expect(authorSuccessor(entry(), { statement: 'Reworded', writerLine: '' }).writerLine).toBeNull();
  });

  it('should turn an overruled system detail into an author decision', () => {
    const next = authorSuccessor(entry({ kind: 'system', decidedBy: 'system', topic: 'cast' }), { statement: 'The clerk is forty, not twenty' });

    expect(next.kind).toBe('decision');
    expect(next.decidedBy).toBe('author');
  });

  it('should refuse to turn a direction into a decision', () => {
    expect(() => authorSuccessor(entry({ kind: 'direction' }), { kind: 'decision', statement: 'Promote it' })).toThrow(expect.objectContaining({ code: 'LDG_003' }));
  });

  it('should carry nothing over when the kind changes', () => {
    const next = authorSuccessor(entry(), { kind: 'rejected', statement: 'No promise theme' });

    expect(next).toMatchObject({ why: null, writerLine: null, payload: null, links: {}, rejectedAlternatives: [] });
  });
});

describe('LedgerService.withdraw', () => {
  it('should deactivate an entry with the reason and append no successor', async () => {
    const direction = entry({ kind: 'direction', statement: 'Keep every chapter at sea' });
    const { service, inserted, updates } = fakeLedger({ marked: [{ ...direction, supersededAt: new Date(1), withdrawnReason: 'Too confining' }] });

    const withdrawn = await service.withdraw(7n, 1n, '  Too confining ');

    expect(inserted).toHaveLength(0);
    expect(Object.keys(updates[0] ?? {}).sort()).toEqual(['supersededAt', 'withdrawnReason']);
    expect(updates[0]?.['withdrawnReason']).toBe('Too confining');
    expect(ledgerEntryStatus(withdrawn)).toBe('withdrawn');
  });

  it('should lift a rejection by withdrawing it', async () => {
    const rejected = entry({ kind: 'rejected', statement: 'No sea monsters' });
    const { service, inserted } = fakeLedger({ marked: [{ ...rejected, supersededAt: new Date(1), withdrawnReason: 'Changed my mind' }] });

    expect((await service.withdraw(7n, 1n, 'Changed my mind')).kind).toBe('rejected');
    expect(inserted).toHaveLength(0);
  });

  it('should refuse to withdraw an entry that is already retired', async () => {
    const { service } = fakeLedger({ marked: [], stored: entry({ supersededAt: new Date(1), withdrawnReason: 'Earlier' }) });

    await expect(service.withdraw(7n, 1n, 'Again')).rejects.toMatchObject({ code: 'LDG_002' });
  });
});

describe('LedgerService author paths', () => {
  it('should append an author entry as the author with no phase by default', async () => {
    const { service, inserted } = fakeLedger();

    await service.appendByAuthor(7n, { kind: 'backlog', topic: 'places', statement: 'The drowned chapel', why: 'Not before chapter 20' });

    expect(inserted[0]).toMatchObject({ kind: 'backlog', phase: null, decidedBy: 'author', topic: 'places' });
  });

  it('should refuse a malformed topic key', async () => {
    const { service, inserted } = fakeLedger();

    await expect(service.append(7n, [{ kind: 'direction', phase: null, topic: 'World Rules', statement: 'x', decidedBy: 'author' }])).rejects.toMatchObject({ code: 'LDG_004' });
    expect(inserted).toHaveLength(0);
  });

  it('should supersede with the authored successor of the stored entry', async () => {
    const stored = entry({ id: 4n, kind: 'system', decidedBy: 'system', phase: 'volume_one', topic: 'cast', statement: 'The clerk is twenty.' });
    const { service, inserted } = fakeLedger({ stored, marked: [stored] });

    await service.supersedeByAuthor(7n, 4n, { statement: 'The clerk is forty.' });

    expect(inserted[0]).toMatchObject({ kind: 'decision', decidedBy: 'author', statement: 'The clerk is forty.', topic: 'cast', phase: 'volume_one', supersedesId: 4n });
  });
});

describe('ledgerEntryStatus', () => {
  it('should tell active, superseded and withdrawn entries apart', () => {
    expect(ledgerEntryStatus(entry())).toBe('active');
    expect(ledgerEntryStatus(entry({ supersededAt: new Date(1) }))).toBe('superseded');
    expect(ledgerEntryStatus(entry({ supersededAt: new Date(1), withdrawnReason: 'Dropped' }))).toBe('withdrawn');
  });
});

describe('the gate entry', () => {
  const gate = entry({ id: 9n, kind: 'system', decidedBy: 'system', phase: null, topic: 'gate', statement: 'The Workspace is open.' });

  it('should refuse to be superseded through the ledger API', async () => {
    const { service, inserted } = fakeLedger({ stored: gate, marked: [] });

    await expect(service.supersedeByAuthor(7n, 9n, { statement: 'Back to the Blueprint' })).rejects.toMatchObject({ code: 'LDG_005' });
    expect(inserted).toHaveLength(0);
  });

  it('should refuse to be withdrawn through the ledger API', async () => {
    const { service } = fakeLedger({ stored: gate, marked: [] });

    await expect(service.withdraw(7n, 9n, 'Opened it by accident')).rejects.toMatchObject({ code: 'LDG_005' });
  });

  it('should still report an ordinary retired entry as already retired', async () => {
    const { service } = fakeLedger({ stored: entry({ supersededAt: new Date(1) }), marked: [] });

    await expect(service.withdraw(7n, 1n, 'Dropped')).rejects.toMatchObject({ code: 'LDG_002' });
  });
});
