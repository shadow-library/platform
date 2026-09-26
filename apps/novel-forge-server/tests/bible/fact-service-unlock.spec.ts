import { describe, expect, it } from 'bun:test';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { type UpsertFactBody } from '@modules/bible/fact/fact.dto';
import { FactService } from '@modules/bible/fact/fact.service';

type Row = Record<string, unknown>;

const unlock = { all: [{ milestone: 'mira_rank_2' }, { chapter: 9 }] };

const stored: Row = {
  id: 1n,
  projectId: 1n,
  factKey: 'lamp_rank_3',
  text: 'the third rank burns memory for light',
  subjects: null,
  constraintNote: null,
  writerNote: null,
  terms: null,
  revealChapter: null,
  unlock,
  plannedChapter: null,
  disclosedInChapter: null,
  allowedClues: ['the lamp burns cold before a storm'],
  source: 'manual',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const ledgerRow = {
  learnedInChapter: 3,
  source: 'brief',
  note: null,
  status: 'provisional',
  createdAt: new Date('2024-01-02'),
  entity: { entityKey: 'mira', name: 'Mira' },
};

function createService(initial: Row): { service: FactService; writes: Row[] } {
  const writes: Row[] = [];
  const store = { current: { ...initial, knowledge: [ledgerRow] } };
  const postgres = {
    query: {
      projects: { findFirst: async () => ({ id: 1n }) },
      canonFacts: { findFirst: async () => store.current, findMany: async () => [store.current] },
      briefs: { findMany: async () => [] },
      milestones: { findMany: async () => [] },
      volumes: { findMany: async () => [] },
      chapters: { findFirst: async () => undefined },
    },
    select: () => ({ from: () => ({ where: () => ({ for: async () => [] }) }) }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(postgres),
    update: () => ({
      set: (values: Row) => ({
        where: async () => {
          writes.push(values);
          store.current = { ...store.current, ...values };
        },
      }),
    }),
  };
  return { service: new FactService(new FakeDatabaseService({ postgres })), writes };
}

describe('FactService.upsert — unlock condition and allowed clues', () => {
  it('should keep the unlock condition and clues when the body omits them', async () => {
    const { service } = createService(stored);

    const result = await service.upsert(1n, 'lamp_rank_3', { text: 'edited' });

    expect(result).toMatchObject({ text: 'edited', unlock, allowedClues: ['the lamp burns cold before a storm'] });
  });

  it('should clear both on null, and present a fact without a condition with the field absent', async () => {
    const { service, writes } = createService(stored);

    const result = await service.upsert(1n, 'lamp_rank_3', { text: stored['text'] as string, unlock: null, allowedClues: null });

    expect(writes[0]).toMatchObject({ unlock: null, allowedClues: null });
    expect(result).not.toHaveProperty('unlock', null);
    expect(result.unlock).toBeUndefined();
    expect(result.allowedClues).toBeNull();
  });

  it('should trim, drop blank and de-duplicate the clues it is sent', async () => {
    const { service, writes } = createService(stored);

    await service.upsert(1n, 'lamp_rank_3', { text: stored['text'] as string, allowedClues: [' a cold draught ', '', 'a cold draught', 'salt on the sill'] });

    expect(writes[0]).toMatchObject({ allowedClues: ['a cold draught', 'salt on the sill'] });
  });

  it("should refuse a clue that names one of the fact's give-away terms, whether the terms are sent or stored", async () => {
    const { service, writes } = createService({ ...stored, terms: ['memory tithe'] });

    await expect(service.upsert(1n, 'lamp_rank_3', { text: 'x', allowedClues: ['the Memory Tithe comes due'] })).rejects.toMatchObject({ code: 'FCT_006' });
    await expect(service.upsert(1n, 'lamp_rank_3', { text: 'x', terms: ['cold lamp'], allowedClues: ['a cold lamp at dusk'] })).rejects.toMatchObject({ code: 'FCT_006' });
    expect(writes).toEqual([]);
  });

  it('should refuse a structurally malformed unlock condition before writing', async () => {
    const { service, writes } = createService(stored);
    const body = { text: 'x', unlock: { all: [{ ending: false }] } } as unknown as UpsertFactBody;

    await expect(service.upsert(1n, 'lamp_rank_3', body)).rejects.toMatchObject({ code: 'FCT_005' });
    expect(writes).toEqual([]);
  });

  it('should carry each knowledge row’s status', async () => {
    const { service } = createService(stored);

    const fact = await service.get(1n, 'lamp_rank_3');

    expect(fact.knowledge).toEqual([expect.objectContaining({ entityKey: 'mira', status: 'provisional' })]);
  });
});
