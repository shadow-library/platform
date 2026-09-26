import { describe, expect, it, mock } from 'bun:test';

import { schema } from '@server/database';

import { loadArtifactStates } from '@modules/refinement/artifact-state';
import { type BriefUpdateOp, type ChangeOp, changeSetRefs } from '@modules/refinement/change-set';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';

import { type PlanSeed, planTables } from '../knowledge/plan-tables';

type Row = Record<string, unknown>;

const PLAN: BriefUpdateOp = {
  op: 'brief.update',
  chapter: 3,
  body: 'Mara tests the lamp.\nScene 1 (~900 words). Stale line from staging.',
  scenes: [
    { summary: 'Mara reaches the gate', pov: 'mara', goal: 'Get through', turn: 'The gate opens', estimatedWords: 900 },
    { summary: 'Ren waits below', pov: 'ren' },
  ],
};

function engine(seed: PlanSeed) {
  const tables = planTables({ drafts: [{ chapter: 1 }, { chapter: 2 }], ...seed });
  let nextProposal = 400n;
  const service = new ProposalApplyService({ getPostgresClient: () => tables.db } as never, { has: () => true, get: mock(() => undefined) } as never);
  const propose = async (changeSet: ChangeOp[], kind = 'chapter_plan'): Promise<bigint> => {
    const id = nextProposal++;
    const baseline = await loadArtifactStates(tables.db as never, 7n, changeSetRefs(changeSet));
    tables.rows(schema.refinementProposals).push({ id, projectId: 7n, kind, status: 'pending', changeSet, messageId: null, summary: null, baseline });
    return id;
  };
  const proposal = (id: bigint): Row | undefined => tables.rows(schema.refinementProposals).find(row => row['id'] === id);
  return { ...tables, service, propose, proposal };
}

describe('ProposalApplyService — a plan pass card', () => {
  it('should render the writer’s brief from the card’s scenes as the author left them', async () => {
    const project = engine({});
    const edited = { ...PLAN, scenes: [{ ...PLAN.scenes?.[0], summary: 'Mara bargains at the gate' }, PLAN.scenes?.[1]] } as BriefUpdateOp;
    const id = await project.propose([edited]);

    await project.service.apply(7n, id);

    expect(project.brief(3)?.['body']).toBe(
      ['Mara tests the lamp.', 'Scene 1 (~900 words). Mara bargains at the gate. Goal: Get through. Turn: The gate opens. POV: mara.', 'Scene 2. Ren waits below. POV: ren.'].join(
        '\n',
      ),
    );
  });

  it('should refuse a card for a chapter the story has moved past', async () => {
    const project = engine({ drafts: [{ chapter: 1 }, { chapter: 2 }, { chapter: 3 }] });
    const id = await project.propose([{ ...PLAN, chapter: 3 }]);

    await expect(project.service.apply(7n, id)).rejects.toMatchObject({ code: 'PLN_008' });
    expect(project.proposal(id)?.['status']).toBe('pending');
  });

  it('should render the scenes of any plan write that carries them, and strip them when the list is emptied', async () => {
    const project = engine({});
    const chat = await project.propose([PLAN], 'chat');
    await project.service.apply(7n, chat);
    expect(project.brief(3)?.['body']).toContain('Scene 2. Ren waits below. POV: ren.');

    const emptied = await project.propose([{ op: 'brief.update', chapter: 3, scenes: [] }], 'chat');
    await project.service.apply(7n, emptied);
    expect(project.brief(3)?.['body']).toBe('Mara tests the lamp.');
  });

  it('should keep a hand-written body as written when the write carries no scenes', async () => {
    const project = engine({});
    const id = await project.propose([{ op: 'brief.update', chapter: 3, body: 'Written by hand.\n\nScene 1 is mine.' }], 'chat');

    await project.service.apply(7n, id);

    expect(project.brief(3)?.['body']).toBe('Written by hand.\n\nScene 1 is mine.');
  });

  it('should clear a replaced plan’s point of view and write the planner’s risks, and bring both back on revert', async () => {
    const project = engine({ briefs: [{ chapter: 3, body: 'Old plan.', pov: 'mara', repetitionRisks: ['old'], densityRisk: 'old risk' }] });
    const id = await project.propose([{ op: 'brief.update', chapter: 3, body: 'New plan.', pov: null, repetitionRisks: null, densityRisk: 'Thin material' }]);

    await project.service.apply(7n, id);
    expect(project.brief(3)).toMatchObject({ pov: null, repetitionRisks: null, densityRisk: 'Thin material' });

    await project.service.revert(7n, id);
    expect(project.brief(3)).toMatchObject({ pov: 'mara', repetitionRisks: ['old'], densityRisk: 'old risk' });
  });
});
