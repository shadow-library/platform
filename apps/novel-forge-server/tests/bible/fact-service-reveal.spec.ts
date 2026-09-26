import { describe, expect, it } from 'bun:test';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { FactService } from '@modules/bible/fact/fact.service';
import { type UpsertFactBody } from '@modules/bible/fact/fact.dto';

interface StoredFact {
  id: bigint;
  projectId: bigint;
  factKey: string;
  text: string;
  subjects: string[] | null;
  constraintNote: string | null;
  writerNote: string | null;
  terms: string[] | null;
  revealChapter: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function createService(initial: StoredFact): FactService {
  const store: { current: (StoredFact & { knowledge: never[] }) | undefined } = { current: { ...initial, knowledge: [] } };
  const postgres = {
    query: {
      projects: { findFirst: async () => ({ id: initial.projectId }) },
      canonFacts: { findFirst: async () => store.current, findMany: async () => [store.current] },
      briefs: { findMany: async () => [] },
      milestones: { findMany: async () => [] },
      volumes: { findMany: async () => [] },
      chapters: { findFirst: async () => undefined },
    },
    select: () => ({ from: () => ({ where: () => ({ for: async () => [] }) }) }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(postgres),
    update: () => ({
      set: (values: Partial<StoredFact>) => ({
        where: async () => {
          store.current = { ...(store.current as StoredFact & { knowledge: never[] }), ...values };
        },
      }),
    }),
    insert: () => ({
      values: async (values: StoredFact) => {
        store.current = { ...values, knowledge: [] };
      },
    }),
  };
  return new FactService(new FakeDatabaseService({ postgres }));
}

const dated: StoredFact = {
  id: 1n,
  projectId: 1n,
  factKey: 'f1',
  text: 'the vault is empty',
  subjects: null,
  constraintNote: null,
  writerNote: null,
  terms: null,
  revealChapter: 12,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('FactService.upsert reveal merge', () => {
  it('should clear a dated reveal when the body sends revealChapter: null', async () => {
    const body: UpsertFactBody = { text: dated.text, revealChapter: null };
    const result = await createService(dated).upsert(dated.projectId, dated.factKey, body);
    expect(result.revealChapter).toBeNull();
  });

  it('should keep the existing reveal date when the body omits revealChapter', async () => {
    const body: UpsertFactBody = { text: 'edited text' };
    const result = await createService(dated).upsert(dated.projectId, dated.factKey, body);
    expect(result.revealChapter).toBe(12);
  });

  it('should set a reveal date on a previously undated fact', async () => {
    const body: UpsertFactBody = { text: dated.text, revealChapter: 30 };
    const result = await createService({ ...dated, revealChapter: null }).upsert(dated.projectId, dated.factKey, body);
    expect(result.revealChapter).toBe(30);
  });
});
