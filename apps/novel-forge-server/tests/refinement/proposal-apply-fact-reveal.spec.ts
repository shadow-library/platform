import { describe, expect, it } from 'bun:test';

import { FACT_HANDLERS, type FactUpsertOp } from '@modules/refinement';

interface FakeFactRow {
  id: bigint;
  text: string;
  subjects: string[] | null;
  constraintNote: string | null;
  writerNote: string | null;
  terms: string[] | null;
  revealChapter: number | null;
}

function fakeCtx(existing: FakeFactRow | undefined, captured: { set?: Record<string, unknown> }) {
  const tx = {
    query: { canonFacts: { findFirst: async () => existing } },
    update: () => ({
      set: (values: Record<string, unknown>) => {
        captured.set = values;
        return { where: async () => undefined };
      },
    }),
    insert: () => ({ values: async () => undefined }),
  };
  return { tx: tx as never, projectId: 1n, applied: [] as never[], staleMarked: [] as string[] };
}

const dated: FakeFactRow = { id: 1n, text: 'the vault is empty', subjects: null, constraintNote: null, writerNote: null, terms: null, revealChapter: 12 };
const undated: FakeFactRow = { ...dated, revealChapter: null };

describe('fact.upsert apply — reveal merge', () => {
  it('should keep the existing reveal date when the op omits revealChapter', async () => {
    const captured: { set?: Record<string, unknown> } = {};
    const op: FactUpsertOp = { op: 'fact.upsert', factKey: 'f1', body: 'edited' };

    await FACT_HANDLERS['fact.upsert'].apply(fakeCtx(dated, captured), op);

    expect(captured.set?.['revealChapter']).toBe(12);
  });

  it('should set a reveal date on a previously undated fact', async () => {
    const captured: { set?: Record<string, unknown> } = {};
    const op: FactUpsertOp = { op: 'fact.upsert', factKey: 'f1', revealChapter: 30 };

    await FACT_HANDLERS['fact.upsert'].apply(fakeCtx(undated, captured), op);

    expect(captured.set?.['revealChapter']).toBe(30);
  });
});

describe('fact.upsert inverse — reveal capture', () => {
  it('should restore null, explicitly rather than omitted, as the inverse of dating a previously undated fact', async () => {
    const op: FactUpsertOp = { op: 'fact.upsert', factKey: 'f1', revealChapter: 30 };

    const inverse = (await FACT_HANDLERS['fact.upsert'].inverse(fakeCtx(undated, {}), op)) as FactUpsertOp;

    expect(JSON.parse(JSON.stringify(inverse))).toHaveProperty('revealChapter', null);
  });
});
