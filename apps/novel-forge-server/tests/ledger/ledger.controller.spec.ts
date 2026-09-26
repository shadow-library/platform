import { describe, expect, it } from 'bun:test';

import { LedgerController } from '@modules/ledger/ledger.controller';
import { type Ledger } from '@server/database';

function entry(overrides: Partial<Ledger.Entry> = {}): Ledger.Entry {
  return {
    id: 1n,
    projectId: 7n,
    kind: 'decision',
    topic: 'theme',
    statement: 'A promise kept to the dead.',
    why: null,
    rejectedAlternatives: [],
    writerLine: null,
    decidedBy: 'author',
    stepKey: null,
    payload: null,
    links: {},
    supersedesId: null,
    supersededAt: null,
    withdrawnReason: null,
    createdAt: new Date(0),
    ...overrides,
  };
}

function makeController(entries: Ledger.Entry[]) {
  const listActiveCalls: { projectId: bigint; query: Record<string, unknown> }[] = [];
  const ledgerService = {
    listActive: async (projectId: bigint, query: Record<string, unknown>) => {
      listActiveCalls.push({ projectId, query });
      return entries;
    },
  } as never;
  return { controller: new LedgerController(ledgerService), listActiveCalls };
}

describe('LedgerController.listActive — the Notebook listing', () => {
  it('should exclude the author’s notes and every checklist override by default', async () => {
    const entries = [entry({ topic: 'theme' }), entry({ id: 2n, topic: 'start.brief' }), entry({ id: 3n, kind: 'system', topic: 'progress.ending' })];
    const { controller } = makeController(entries);

    const { entries: visible } = await controller.listActive({ projectId: 7n }, {});

    expect(visible.map(row => row.topic)).toEqual(['theme']);
  });

  it('should return them when the caller asks for those topics explicitly', async () => {
    const entries = [entry({ id: 2n, topic: 'start.brief' }), entry({ id: 3n, kind: 'system', topic: 'progress.ending' })];
    const { controller } = makeController(entries);

    const { entries: visible } = await controller.listActive({ projectId: 7n }, { topics: ['start.brief', 'progress.ending'] });

    expect(visible.map(row => row.topic)).toEqual(['start.brief', 'progress.ending']);
  });
});
