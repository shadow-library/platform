import { describe, expect, it, mock } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { loadArtifactStates } from '@modules/refinement/artifact-state';
import { type ChangeOp, changeSetRefs } from '@modules/refinement/change-set';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';
import { schema } from '@server/database';

import { matchesWhere, queryRows } from '../sql-filter';

type Row = Record<string, unknown>;

async function fakeProject(changeSet: ChangeOp[], seed: { briefs?: Row[]; volumes?: Row[]; facts?: Row[] } = {}) {
  const seeded = (rows: Row[] = []) => rows.map((row, index) => ({ id: BigInt(index + 1), projectId: 7n, revision: 1, contentHash: null, ...row }));
  const tables = new Map<unknown, Row[]>([
    [schema.briefs, seeded(seed.briefs)],
    [schema.volumes, seeded(seed.volumes)],
    [schema.canonFacts, seeded(seed.facts)],
    [schema.refinementProposals, []],
  ]);
  const rows = (table: unknown): Row[] => tables.get(table) ?? [];
  const finder = (table: unknown) => ({
    findFirst: async (query: Parameters<typeof queryRows>[1]) => queryRows(rows(table), query)[0],
    findMany: async (query: Parameters<typeof queryRows>[1]) => queryRows(rows(table), query),
  });
  const tx = {
    query: {
      projects: { findFirst: async () => ({ id: 7n, premise: null, brief: null, themes: null, instructions: null, storyCurrentChapter: 0 }) },
      briefs: finder(schema.briefs),
      volumes: finder(schema.volumes),
      canonFacts: finder(schema.canonFacts),
    },
    select: () => ({ from: (table: unknown) => ({ where: () => ({ for: async () => rows(table) }) }) }),
    update: (table: unknown) => ({
      set: (values: Row) => ({
        where: (condition: SQL) => {
          const changed = rows(table).filter(row => matchesWhere(row, condition));
          for (const row of changed) Object.assign(row, values);
          return Object.assign(Promise.resolve(), { returning: async () => changed });
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: Row) => void rows(table).push({ id: BigInt(rows(table).length + 100), projectId: 7n, ...values }),
    }),
    delete: (table: unknown) => ({
      where: (condition: SQL) => {
        const removed = rows(table).filter(row => matchesWhere(row, condition));
        tables.set(
          table,
          rows(table).filter(row => !removed.includes(row)),
        );
        return Object.assign(Promise.resolve(), { returning: async () => removed });
      },
    }),
  };
  const proposal = { id: 300n, projectId: 7n, kind: 'chat', status: 'pending', changeSet, messageId: null, summary: null, baseline: {} as unknown, inverseOps: null as unknown };
  rows(schema.refinementProposals).push(proposal);
  proposal.baseline = await loadArtifactStates(tx as never, 7n, changeSetRefs(changeSet));
  const db = { transaction: async (run: (handle: unknown) => Promise<unknown>) => run(tx) };
  const service = new ProposalApplyService({ getPostgresClient: () => db } as never, { has: () => true, get: mock(() => undefined) } as never);
  const inverse = () => JSON.parse(JSON.stringify(proposal.inverseOps, (_, value: unknown) => (typeof value === 'bigint' ? String(value) : value))) as Row[];
  return { service, rows, inverse };
}

const PLAIN_BRIEF: Row = {
  chapter: 3,
  body: 'Ada hides the slip.',
  volumeKey: null,
  writeMode: 'standard',
  handEdited: false,
  direction: null,
  contentMode: null,
  scenes: null,
  claimedMilestones: null,
  isEnding: false,
};

const PLANNED_BRIEF: Row = {
  ...PLAIN_BRIEF,
  direction: 'Ada chooses the ledger over her brother.',
  contentMode: 'unrestricted',
  scenes: [{ summary: 'The clerk refuses her.', pov: 'ada' }],
  claimedMilestones: ['ada_reads_ledger'],
  isEnding: true,
};

const PLAN_FIELDS = ['direction', 'contentMode', 'scenes', 'claimedMilestones', 'isEnding'] as const;

function planFields(row: Row | undefined): Row {
  return Object.fromEntries(PLAN_FIELDS.map(field => [field, row?.[field]]));
}

describe('ProposalApplyService — chapter plan fields', () => {
  it('should set every plan field on a brief and restore the unset values on revert', async () => {
    const { service, rows, inverse } = await fakeProject(
      [
        {
          op: 'brief.update',
          chapter: 3,
          direction: '  Ada chooses the ledger over her brother. ',
          contentMode: 'unrestricted',
          scenes: [{ summary: 'The clerk refuses her.', pov: 'ada' }, { summary: 'Night at the docks.' } as never],
          claimedMilestones: ['ada_reads_ledger', ' ada_reads_ledger '],
          isEnding: true,
        },
      ],
      { briefs: [PLAIN_BRIEF] },
    );

    await service.apply(7n, 300n);

    expect(planFields(rows(schema.briefs)[0])).toEqual({
      direction: 'Ada chooses the ledger over her brother.',
      contentMode: 'unrestricted',
      scenes: [
        { summary: 'The clerk refuses her.', pov: 'ada' },
        { summary: 'Night at the docks.', pov: null },
      ],
      claimedMilestones: ['ada_reads_ledger'],
      isEnding: true,
    });
    expect(inverse()[0]).toMatchObject({ direction: null, contentMode: null, scenes: null, claimedMilestones: null, isEnding: false });

    await service.revert(7n, 300n);

    expect(planFields(rows(schema.briefs)[0])).toEqual(planFields(PLAIN_BRIEF));
  });

  it('should keep every plan field an op leaves out', async () => {
    const { service, rows } = await fakeProject([{ op: 'brief.update', chapter: 3, title: 'The Slip' }], { briefs: [PLANNED_BRIEF] });

    await service.apply(7n, 300n);

    expect(planFields(rows(schema.briefs)[0])).toEqual(planFields(PLANNED_BRIEF));
  });

  it('should clear the plan fields an op sets to null, and put them back on revert', async () => {
    const { service, rows } = await fakeProject([{ op: 'brief.update', chapter: 3, direction: null, contentMode: null, scenes: null, claimedMilestones: null, isEnding: false }], {
      briefs: [PLANNED_BRIEF],
    });

    await service.apply(7n, 300n);
    expect(planFields(rows(schema.briefs)[0])).toEqual(planFields(PLAIN_BRIEF));

    await service.revert(7n, 300n);
    expect(planFields(rows(schema.briefs)[0])).toEqual(planFields(PLANNED_BRIEF));
  });
});

describe('ProposalApplyService — volume state', () => {
  const volume: Row = { volumeKey: 'volume_1', ordinal: 1, title: 'The Ledger House', objective: 'Get in.', body: null, state: 'not_started' };

  it('should set a volume state and restore it on revert', async () => {
    const { service, rows, inverse } = await fakeProject([{ op: 'volume.upsert', volumeKey: 'volume_1', state: 'active' }], { volumes: [volume] });

    await service.apply(7n, 300n);
    expect(rows(schema.volumes)[0]).toMatchObject({ state: 'active', objective: 'Get in.' });
    expect(inverse()[0]).toMatchObject({ op: 'volume.upsert', state: 'not_started' });

    await service.revert(7n, 300n);
    expect(rows(schema.volumes)[0]).toMatchObject({ state: 'not_started' });
  });

  it('should keep the state when the op leaves it out, and start a new volume not started', async () => {
    const { service, rows } = await fakeProject(
      [
        { op: 'volume.upsert', volumeKey: 'volume_1', title: 'The Counting House' },
        { op: 'volume.upsert', volumeKey: 'volume_2', objective: 'Get out.' },
      ],
      { volumes: [{ ...volume, state: 'goal_met' }] },
    );

    await service.apply(7n, 300n);

    expect(rows(schema.volumes).map(row => [row['volumeKey'], row['state']])).toEqual([
      ['volume_1', 'goal_met'],
      ['volume_2', 'not_started'],
    ]);
  });
});

describe('ProposalApplyService — fact unlock and allowed clues', () => {
  const fact: Row = {
    factKey: 'f1',
    text: 'the vault is empty',
    subjects: null,
    constraintNote: null,
    writerNote: null,
    terms: null,
    revealChapter: null,
    unlock: null,
    allowedClues: null,
  };
  const unlock = { all: [{ milestone: 'ada_reads_ledger' }, { chapter: 12 }] };

  it('should set an unlock condition and clues on a fact and restore them as explicit nulls on revert', async () => {
    const { service, rows, inverse } = await fakeProject([{ op: 'fact.upsert', factKey: 'f1', unlock, allowedClues: ['the ledger smells of seawater'] }], { facts: [fact] });

    await service.apply(7n, 300n);
    expect(rows(schema.canonFacts)[0]).toMatchObject({ unlock, allowedClues: ['the ledger smells of seawater'] });
    expect(inverse()[0]).toMatchObject({ unlock: null, allowedClues: null });

    await service.revert(7n, 300n);
    expect(rows(schema.canonFacts)[0]).toMatchObject({ unlock: null, allowedClues: null });
  });

  it('should trim and de-duplicate the clues it writes', async () => {
    const { service, rows } = await fakeProject([{ op: 'fact.upsert', factKey: 'f1', allowedClues: [' a cold draught ', 'a cold draught', 'salt on the sill'] }], {
      facts: [fact],
    });

    await service.apply(7n, 300n);

    expect(rows(schema.canonFacts)[0]).toMatchObject({ allowedClues: ['a cold draught', 'salt on the sill'] });
  });

  it('should keep an unlock condition and clues the op leaves out', async () => {
    const { service, rows } = await fakeProject([{ op: 'fact.upsert', factKey: 'f1', body: 'the vault was emptied' }], {
      facts: [{ ...fact, unlock, allowedClues: ['a cold draught'] }],
    });

    await service.apply(7n, 300n);

    expect(rows(schema.canonFacts)[0]).toMatchObject({ text: 'the vault was emptied', unlock, allowedClues: ['a cold draught'] });
  });

  it('should clear an unlock condition and clues set to null, and put them back on revert', async () => {
    const { service, rows } = await fakeProject([{ op: 'fact.upsert', factKey: 'f1', unlock: null, allowedClues: null }], {
      facts: [{ ...fact, unlock, allowedClues: ['a cold draught'] }],
    });

    await service.apply(7n, 300n);
    expect(rows(schema.canonFacts)[0]).toMatchObject({ unlock: null, allowedClues: null });

    await service.revert(7n, 300n);
    expect(rows(schema.canonFacts)[0]).toMatchObject({ unlock, allowedClues: ['a cold draught'] });
  });

  it('should treat a changed unlock condition as a change to the fact when guarding a revert', async () => {
    const { service, rows } = await fakeProject([{ op: 'fact.upsert', factKey: 'f1', allowedClues: ['a cold draught'] }], { facts: [fact] });

    await service.apply(7n, 300n);
    Object.assign(rows(schema.canonFacts)[0] as Row, { unlock });

    await expect(service.revert(7n, 300n)).rejects.toMatchObject({ code: 'RFN_006' });
  });
});
