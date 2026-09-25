import { describe, expect, it } from 'bun:test';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { type FactUpsertOp, ProposalApplyService } from '@modules/refinement';

interface FakeFactRow {
  id: bigint;
  text: string;
  subjects: string[] | null;
  constraintNote: string | null;
  writerNote: string | null;
  terms: string[] | null;
  revealChapter: number | null;
}

function createService(): ProposalApplyService {
  return new ProposalApplyService(new FakeDatabaseService(), {} as never);
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
  return { tx: tx as never, projectId: 1n, applied: [] as never[], staleMarked: [] as string[], blueprintLock: false };
}

const dated: FakeFactRow = { id: 1n, text: 'the vault is empty', subjects: null, constraintNote: null, writerNote: null, terms: null, revealChapter: 12 };
const undated: FakeFactRow = { ...dated, revealChapter: null };

describe('ProposalApplyService applyFactUpsert reveal merge', () => {
  it('should keep the existing reveal date when the op omits revealChapter', async () => {
    const captured: { set?: Record<string, unknown> } = {};
    const op: FactUpsertOp = { op: 'fact.upsert', factKey: 'f1', body: 'edited' };

    await createService()['applyFactUpsert'](fakeCtx(dated, captured), op);

    expect(captured.set?.['revealChapter']).toBe(12);
  });

  it('should set a reveal date on a previously undated fact', async () => {
    const captured: { set?: Record<string, unknown> } = {};
    const op: FactUpsertOp = { op: 'fact.upsert', factKey: 'f1', revealChapter: 30 };

    await createService()['applyFactUpsert'](fakeCtx(undated, captured), op);

    expect(captured.set?.['revealChapter']).toBe(30);
  });
});

describe('ProposalApplyService inverseFact reveal capture', () => {
  it('should restore null, explicitly rather than omitted, as the inverse of dating a previously undated fact', async () => {
    const op: FactUpsertOp = { op: 'fact.upsert', factKey: 'f1', revealChapter: 30 };

    const inverse = (await createService()['inverseFact'](fakeCtx(undated, {}), op)) as FactUpsertOp;

    expect(JSON.parse(JSON.stringify(inverse))).toHaveProperty('revealChapter', null);
  });
});
