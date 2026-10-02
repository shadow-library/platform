import { describe, expect, it } from 'bun:test';

import { loadArtifactStates } from '@modules/refinement/artifact-state';
import { type ChangeOp } from '@modules/refinement/change-set';
import { type OpUndoRecord } from '@modules/refinement/op-undo';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';

const STORY = { premise: 'Two strangers wake up after the Ascend.', brief: null, themes: null, instructions: null };
const EMPTY_FIELDS = { theme: null, readerPromise: null, protagonistKey: null, opposition: null, endingQuestion: null, ending: null };

async function chatTurn(ops: ChangeOp[], fields: Record<string, string | null> = {}) {
  const project: Record<string, unknown> = { id: 7n, ...STORY, ...EMPTY_FIELDS, ...fields };
  const writes: Record<string, unknown>[] = [];
  const tx = {
    query: { projects: { findFirst: async () => project } },
    select: () => ({ from: () => ({ where: () => ({ for: async () => [proposal] }) }) }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        writes.push(values);
        return { where: () => Object.assign(Promise.resolve(), { returning: async () => [{ ...proposal, ...values }] }) };
      },
    }),
    insert: () => ({ values: async () => undefined }),
  };
  const proposal = { id: 300n, projectId: 7n, kind: 'chat', status: 'pending', changeSet: ops, baseline: await loadArtifactStates(tx as never, 7n, ['premise']) };
  const service = new ProposalApplyService({ getPostgresClient: () => ({}) } as never, { has: () => true } as never);
  await service.apply(7n, 300n, { tx: tx as never, autoApplied: true });
  const undo = writes.find(values => Array.isArray(values['opUndo']))?.['opUndo'] as (OpUndoRecord | null)[] | undefined;
  return { writes, undo };
}

describe('ProposalApplyService.apply — the story fields', () => {
  it('should write each story field the op names, trimmed, and leave the rest alone', async () => {
    const { writes } = await chatTurn([{ op: 'premise.update', opposition: '  Hunger, cold and the climbing Ravening.  ', readerPromise: 'They hold the campus.' }]);
    const story = writes.find(values => 'opposition' in values);

    expect(story).toMatchObject({ opposition: 'Hunger, cold and the climbing Ravening.', readerPromise: 'They hold the campus.' });
    expect(story).not.toHaveProperty('premise');
    expect(story).not.toHaveProperty('ending');
  });

  it('should undo a field it filled back to empty, and one it replaced back to what it held', async () => {
    const { undo } = await chatTurn([{ op: 'premise.update', opposition: 'The campus itself.', theme: 'Trust.' }], { theme: 'Survival.' });

    expect(undo?.[0]?.inverse).toEqual({ op: 'premise.update', opposition: null, theme: 'Survival.' });
  });
});

describe('loadArtifactStates — the premise', () => {
  it('should fingerprint a story with no story fields set exactly as before they existed', async () => {
    const tx = (row: Record<string, unknown>) => ({ query: { projects: { findFirst: async () => ({ id: 7n, ...row }) } } }) as never;
    const before = await loadArtifactStates(tx(STORY), 7n, ['premise']);
    const after = await loadArtifactStates(tx({ ...STORY, ...EMPTY_FIELDS }), 7n, ['premise']);
    const opposed = await loadArtifactStates(tx({ ...STORY, ...EMPTY_FIELDS, opposition: 'The campus itself.' }), 7n, ['premise']);

    expect(after['premise']?.contentHash).toBe(before['premise']?.contentHash as string);
    expect(opposed['premise']?.contentHash).not.toBe(before['premise']?.contentHash as string);
  });
});
