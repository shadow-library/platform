import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { HubActionRegistrar } from '@modules/hub/hub-action.registrar';
import { ActionExecutorRegistry, type ActionOp, bindApprovalRevision, type ChangeOp, type DraftUpdateOp, ProposalApplyService, ProposalService } from '@modules/refinement';
import { AppErrorCode } from '@server/classes';
import { schema } from '@server/database';

import { type DraftRow, draftRow, fakeGenerationDb, render } from '../generation/generation-fixtures';

function applyDraftOp(reads: (DraftRow | undefined)[], written: unknown[] = []) {
  const fake = fakeGenerationDb({ draftReads: reads, draftWriteResult: written });
  const ctx = { tx: fake.db as never, projectId: 1n, applied: [] as { artifactRef: string; newRevision: number | null }[], staleMarked: [] as string[] };
  const service = new ProposalApplyService(new FakeDatabaseService(), {} as never);
  return {
    fake,
    ctx,
    update: (op: DraftUpdateOp & { isolated?: boolean; generator?: 'unrestricted' }) => service['applyDraftUpdate'](ctx, op),
    remove: (chapter: number) => service['applyDraftRemove'](ctx, { op: 'draft.remove', chapter }),
    inverse: (op: ChangeOp) => service['inverseDraft'](ctx, op as DraftUpdateOp),
    staleMarks: () => fake.writesTo(schema.drafts, 'update').filter(write => typeof write.values?.['staleReason'] === 'object' && write.values['staleReason'] !== null),
  };
}

const REVOKE_CHAPTER_4 = '("character_knowledge"."project_id" = $1 and "character_knowledge"."source" = $2 and "character_knowledge"."learned_in_chapter" = $3)';

describe('ProposalApplyService applyDraftUpdate', () => {
  it('should bind the write to the revision it read, bump it in SQL and revoke the reveals the old prose earned', async () => {
    const run = applyDraftOp([draftRow()], [{ id: 11n, revision: 3 }]);

    await run.update({ op: 'draft.update', chapter: 4, body: 'The ferry leaves without its keeper.' });

    const [write] = run.fake.writesTo(schema.drafts, 'update');
    const where = render(write?.where);
    expect(where.sql).toBe('("drafts"."id" = $1 and "drafts"."revision" = $2 and "drafts"."status" <> $3)');
    expect(where.params).toEqual([11n, 2, 'final']);
    expect(render(write?.values?.['revision'] as SQL).sql).toBe('"drafts"."revision" + 1');
    expect(run.fake.writesTo(schema.draftRevisions)[0]?.values).toMatchObject({ draftId: 11n, revision: 3, source: 'chat_edited' });
    expect(render(run.fake.writesTo(schema.characterKnowledge, 'delete')[0]?.where).sql).toBe(REVOKE_CHAPTER_4);
    expect(run.ctx.applied).toEqual([{ artifactRef: 'draft:4', newRevision: 3 }]);
  });

  it.each([
    ['a conflict when the draft moved on', draftRow({ revision: 3 }), 'DRF_013'],
    ['finalized when the draft became final', draftRow({ status: 'final' }), 'DRF_002'],
  ])('should report a write the draft refused as %s, with no revision row or revocation', async (_, live, code) => {
    const run = applyDraftOp([draftRow(), live]);

    await expect(run.update({ op: 'draft.update', chapter: 4, title: 'Slack Water' })).rejects.toMatchObject({ code });
    expect(run.fake.writesTo(schema.draftRevisions)).toEqual([]);
    expect(run.fake.writesTo(schema.characterKnowledge)).toEqual([]);
  });

  it("should refuse to rewrite an isolated draft's prose the chat could not read", async () => {
    const run = applyDraftOp([draftRow({ isolated: true })]);

    await expect(run.update({ op: 'draft.update', chapter: 4, body: 'A blind rewrite.' })).rejects.toMatchObject({ code: 'RFN_012' });
    expect(run.fake.writes).toEqual([]);
  });

  it.each([
    ['a title-only change', { title: 'Slack Water' }],
    ['a revert that restores the body it already holds', { title: 'Slack Water', body: draftRow().body }],
  ])('should still let %s through on an isolated draft', async (_, fields) => {
    const run = applyDraftOp([draftRow({ isolated: true })], [{ id: 11n, revision: 3 }]);

    await run.update({ op: 'draft.update', chapter: 4, ...fields });

    expect(run.fake.writesTo(schema.drafts, 'update')[0]?.values).toMatchObject({ title: 'Slack Water', body: draftRow().body });
  });
});

describe('ProposalApplyService draft ops and later chapters', () => {
  it('should mark later drafts stale after a chat edit, as a hand edit does', async () => {
    const run = applyDraftOp([draftRow()], [{ id: 11n, revision: 3 }]);

    await run.update({ op: 'draft.update', chapter: 4, title: 'Slack Water' });

    expect(run.staleMarks().map(write => render(write.where).params)).toEqual([[1n, 4, 'final']]);
  });

  it('should leave a later chapter the same proposal also rewrote fresh, not stale', async () => {
    const run = applyDraftOp([draftRow(), draftRow({ id: 12n, chapter: 5, staleReason: 'ancestor chapter 4 was chat_edited' })], [{ id: 11n, revision: 3 }]);

    await run.update({ op: 'draft.update', chapter: 4, body: 'The ferry leaves without its keeper.' });
    await run.update({ op: 'draft.update', chapter: 5, body: 'The keeper swims after it.' });

    const writes = run.fake.writesTo(schema.drafts, 'update').map(write => write.values ?? {});
    const staleMark = writes.findIndex(values => typeof values['staleReason'] === 'object' && values['staleReason'] !== null);
    const chapterFive = writes.findIndex(values => values['body'] === 'The keeper swims after it.');
    expect(staleMark).toBeGreaterThan(-1);
    expect(chapterFive).toBeGreaterThan(staleMark);
    expect(writes[chapterFive]?.['staleReason']).toBeNull();
  });

  it('should lock the draft rows before the knowledge rows, as approval does', async () => {
    const run = applyDraftOp([draftRow()], [{ id: 11n, revision: 3 }]);

    await run.update({ op: 'draft.update', chapter: 4, title: 'Slack Water' });

    const order = run.fake.writes.filter(write => write.table === schema.drafts || write.table === schema.characterKnowledge).map(write => write.table === schema.drafts);
    expect(order.lastIndexOf(true)).toBeLessThan(order.indexOf(false));
  });

  it('should mark later drafts stale after a chat removal', async () => {
    const run = applyDraftOp([draftRow()], [{ id: 11n }]);

    await run.remove(4);

    expect(run.staleMarks()).toHaveLength(1);
  });
});

describe('ProposalApplyService draft containment on revert', () => {
  it("should capture an isolated draft's containment on the inverse of its removal", async () => {
    const run = applyDraftOp([draftRow({ isolated: true, generator: 'unrestricted' })]);

    const inverse = await run.inverse({ op: 'draft.remove', chapter: 4 });

    expect(inverse).toMatchObject({ op: 'draft.update', chapter: 4, body: draftRow().body, isolated: true, generator: 'unrestricted' });
  });

  it('should recreate a reverted removal with the containment it had', async () => {
    const run = applyDraftOp([undefined], [{ id: 12n, revision: 1 }]);

    await run.update({ op: 'draft.update', chapter: 4, body: draftRow().body, isolated: true, generator: 'unrestricted' });

    expect(run.fake.writesTo(schema.drafts, 'insert')[0]?.values).toMatchObject({ isolated: true, generator: 'unrestricted' });
  });

  it('should create a chat-written draft as standard and not isolated', async () => {
    const run = applyDraftOp([undefined], [{ id: 12n, revision: 1 }]);

    await run.update({ op: 'draft.update', chapter: 4, body: 'A new chapter.' });

    expect(run.fake.writesTo(schema.drafts, 'insert')[0]?.values).toMatchObject({ isolated: false, generator: 'standard' });
  });
});

describe('ProposalApplyService applyDraftRemove', () => {
  it('should refuse a draft that turned final and revoke reveals only after a removal', async () => {
    const refused = applyDraftOp([draftRow(), draftRow({ status: 'final' })]);
    await expect(refused.remove(4)).rejects.toMatchObject({ code: 'DRF_002' });
    expect(render(refused.fake.writesTo(schema.drafts, 'delete')[0]?.where).sql).toBe('("drafts"."id" = $1 and "drafts"."status" <> $2)');
    expect(refused.fake.writesTo(schema.characterKnowledge)).toEqual([]);

    const removed = applyDraftOp([draftRow()], [{ id: 11n }]);
    await removed.remove(4);
    expect(render(removed.fake.writesTo(schema.characterKnowledge, 'delete')[0]?.where).sql).toBe(REVOKE_CHAPTER_4);
  });
});

describe('bindApprovalRevision', () => {
  const approve: ActionOp = { op: 'action.approve_draft', chapter: 4, revision: 2 };

  it('should keep the staged revision when the proposal left the draft alone', () => {
    expect(bindApprovalRevision(approve, [{ artifactRef: 'draft:5', newRevision: 8 }])).toEqual(approve);
  });

  it("should approve the revision the proposal's own edit wrote", () => {
    expect(bindApprovalRevision(approve, [{ artifactRef: 'draft:4', newRevision: 3 }])).toEqual({ ...approve, revision: 3 });
  });

  it('should leave every other action untouched', () => {
    const judge: ActionOp = { op: 'action.judge_draft', chapter: 4 };
    expect(bindApprovalRevision(judge, [{ artifactRef: 'draft:4', newRevision: 3 }])).toBe(judge);
  });
});

describe('ProposalService.create approval staging', () => {
  function executor(drafts: { chapter: number; revision: number }[]) {
    return {
      query: { drafts: { findMany: async () => drafts } },
      insert: () => ({ values: (values: Record<string, unknown>) => ({ returning: async () => [{ id: 300n, ...values }] }) }),
    };
  }

  it('should stamp the current draft revision over whatever the model sent, and drop it when there is no draft', async () => {
    const changeSet: ChangeOp[] = [
      { op: 'action.approve_draft', chapter: 4, revision: 99 },
      { op: 'action.approve_draft', chapter: 6 },
    ];

    const proposal = await new ProposalService(new FakeDatabaseService()).create(
      7n,
      { scopeType: 'project', kind: 'chat', changeSet, warnings: [] },
      executor([{ chapter: 4, revision: 2 }]) as never,
    );

    expect(proposal.changeSet).toEqual([
      { op: 'action.approve_draft', chapter: 4, revision: 2 },
      { op: 'action.approve_draft', chapter: 6 },
    ]);
  });
});

describe('HubActionRegistrar action.approve_draft', () => {
  function register() {
    const registry = new ActionExecutorRegistry();
    const approvals: unknown[][] = [];
    const generation = {
      approveDraft: async (...args: unknown[]) => void approvals.push(args),
      getDraft: async (_projectId: bigint, chapter: number) => {
        if (chapter !== 4) throw AppErrorCode.DRF_001.create();
        return draftRow();
      },
    };
    new HubActionRegistrar(registry, generation as never, {} as never, {} as never, {} as never, {} as never).onModuleInit();
    const approve = registry.get('action.approve_draft');
    if (!approve) throw new Error('approve executor missing');
    return { approve, approvals };
  }

  it('should approve exactly the revision the card was staged against', async () => {
    const { approve, approvals } = register();

    await approve(1n, { op: 'action.approve_draft', chapter: 4, revision: 2 }, { autoApplied: false });

    expect(approvals).toEqual([[1n, 4, { revision: 2 }]]);
  });

  it('should refuse a card staged before approvals carried a revision rather than approve whatever the draft now holds', async () => {
    const { approve, approvals } = register();

    await expect(approve(1n, { op: 'action.approve_draft', chapter: 4 }, { autoApplied: false })).rejects.toMatchObject({ code: 'DRF_013' });
    expect(approvals).toEqual([]);
  });

  it('should report a card staged for a chapter that had no draft as a missing draft', async () => {
    const { approve, approvals } = register();

    await expect(approve(1n, { op: 'action.approve_draft', chapter: 6 }, { autoApplied: false })).rejects.toMatchObject({ code: 'DRF_001' });
    expect(approvals).toEqual([]);
  });
});
