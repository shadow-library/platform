import { describe, expect, it, mock } from 'bun:test';

import { loadArtifactStates } from '@modules/refinement/artifact-state';
import { type ChangeOp, changeSetRefs } from '@modules/refinement/change-set';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';
import { schema } from '@server/database';

import { type PlanSeed, planTables } from '../knowledge/plan-tables';

type Row = Record<string, unknown>;

const learns = (...factKeys: string[]) => ({ pov: ['mira'], learns: factKeys.map(factKey => ({ entityKey: 'mira', factKey })) });
const RANK_FOUR = { milestoneKey: 'lamp_rank_4', label: 'Mira reaches the fourth rank', kind: 'rank' };
const RANK_FOUR_RULE = { factKey: 'lamp_rank_4_rule', text: 'The fourth rank trades a memory for each hour of light.', unlock: { all: [{ milestone: 'lamp_rank_4' }] } };

function engine(seed: PlanSeed) {
  const tables = planTables(seed);
  let nextProposal = 300n;
  const service = new ProposalApplyService({ getPostgresClient: () => tables.db } as never, { has: () => true, get: mock(() => undefined) } as never);
  const propose = async (changeSet: ChangeOp[]): Promise<bigint> => {
    const id = nextProposal++;
    const baseline = await loadArtifactStates(tables.db as never, 7n, changeSetRefs(changeSet));
    tables.rows(schema.refinementProposals).push({ id, projectId: 7n, kind: 'chat', status: 'pending', changeSet, messageId: null, summary: null, baseline });
    return id;
  };
  const proposal = (id: bigint): Row | undefined => tables.rows(schema.refinementProposals).find(row => row['id'] === id);
  return { ...tables, service, propose, proposal };
}

describe('ProposalApplyService — reveal rule on brief.update', () => {
  it('should refuse a plan that reveals a locked fact, and leave the proposal pending', async () => {
    const project = engine({ milestones: [RANK_FOUR], facts: [RANK_FOUR_RULE], briefs: [{ chapter: 5, body: 'Mira climbs.' }] });
    const id = await project.propose([{ op: 'brief.update', chapter: 5, knowledgeContract: learns('lamp_rank_4_rule') }]);

    await expect(project.service.apply(7n, id)).rejects.toMatchObject({ code: 'PLN_001' });
    expect(project.proposal(id)?.['status']).toBe('pending');
  });

  it('should name each locked secret on the refusal by its title and what it still needs, never by its truth', async () => {
    const project = engine({ milestones: [RANK_FOUR], facts: [RANK_FOUR_RULE], briefs: [{ chapter: 5, body: 'Mira climbs.' }] });
    const id = await project.propose([{ op: 'brief.update', chapter: 5, knowledgeContract: learns('lamp_rank_4_rule') }]);

    const refusal = await project.service.apply(7n, id).then(
      () => null,
      (err: { toResponse: () => unknown }) => err.toResponse(),
    );

    expect(refusal).toMatchObject({
      code: 'PLN_001',
      details: { violations: [{ factKey: 'lamp_rank_4_rule', label: 'Lamp rank 4 rule', missing: ['milestone lamp_rank_4 reached'] }] },
    });
    expect(JSON.stringify(refusal)).not.toContain(RANK_FOUR_RULE.text);
  });

  it('should accept a change-set that creates the milestone, claims it and reveals the fact it unlocks, in any order', async () => {
    const project = engine({ facts: [RANK_FOUR_RULE], briefs: [{ chapter: 5, body: 'Mira climbs.' }] });
    const id = await project.propose([
      { op: 'brief.update', chapter: 5, knowledgeContract: learns('lamp_rank_4_rule'), claimedMilestones: ['lamp_rank_4'] },
      { op: 'milestone.upsert', milestoneKey: 'lamp_rank_4', label: 'Mira reaches the fourth rank', kind: 'rank' },
    ]);

    await project.service.apply(7n, id);

    expect(project.milestone('lamp_rank_4')).toMatchObject({ state: 'planned', plannedChapter: 5, kind: 'rank' });
    expect(project.fact('lamp_rank_4_rule')).toMatchObject({ plannedChapter: 5 });
  });

  it('should refuse to revert back to a plan whose reveal no longer holds', async () => {
    const project = engine({
      milestones: [RANK_FOUR],
      facts: [RANK_FOUR_RULE],
      briefs: [
        { chapter: 4, body: 'Mira trains.', claimedMilestones: ['lamp_rank_4'] },
        { chapter: 5, body: 'Mira climbs.', knowledgeContract: learns('lamp_rank_4_rule') },
      ],
    });
    const dropReveal = await project.propose([{ op: 'brief.update', chapter: 5, knowledgeContract: null }]);
    await project.service.apply(7n, dropReveal);
    const dropClaim = await project.propose([{ op: 'brief.update', chapter: 4, claimedMilestones: null }]);
    await project.service.apply(7n, dropClaim);
    expect(project.milestone('lamp_rank_4')).toMatchObject({ state: 'open' });

    await expect(project.service.revert(7n, dropReveal)).rejects.toMatchObject({ code: 'PLN_001' });
    expect(project.proposal(dropReveal)?.['status']).toBe('applied');
  });

  it('should refuse a second ending plan', async () => {
    const project = engine({ briefs: [{ chapter: 40, body: 'The last light.', isEnding: true }] });
    const id = await project.propose([{ op: 'brief.update', chapter: 41, body: 'After the last light.', isEnding: true }]);

    await expect(project.service.apply(7n, id)).rejects.toMatchObject({ code: 'PLN_002' });
  });
});

describe('ProposalApplyService — the finalized frontier', () => {
  it('should refuse a plan edit or removal at a finalized chapter even while the story cursor is behind it', async () => {
    const project = engine({ chapters: [{ number: 6 }], storyCurrentChapter: 5, briefs: [{ chapter: 6, body: 'Mira climbs.' }] });

    for (const op of [{ op: 'brief.update', chapter: 6, body: 'Mira falls.' } as const, { op: 'brief.remove', chapter: 6 } as const]) {
      const id = await project.propose([op]);
      await expect(project.service.apply(7n, id)).rejects.toMatchObject({ code: 'RFN_005' });
    }
    expect(project.brief(6)?.['body']).toBe('Mira climbs.');
  });
});

describe('ProposalApplyService — milestone ops', () => {
  it('should refuse a subject that is not an entity of the novel', async () => {
    const project = engine({ milestones: [RANK_FOUR] });
    const id = await project.propose([{ op: 'milestone.upsert', milestoneKey: 'lamp_rank_4', subjectEntityKey: 'nobody' }]);

    await expect(project.service.apply(7n, id)).rejects.toMatchObject({ code: 'MIL_004' });
  });

  it('should refuse to remove a milestone a plan claims', async () => {
    const project = engine({ milestones: [RANK_FOUR], briefs: [{ chapter: 4, body: 'Mira trains.', claimedMilestones: ['lamp_rank_4'] }] });
    const id = await project.propose([{ op: 'milestone.remove', milestoneKey: 'lamp_rank_4' }]);

    await expect(project.service.apply(7n, id)).rejects.toMatchObject({ code: 'MIL_003' });
  });

  it('should remove a milestone after the op that drops its last claim, whatever the listed order, and restore both on revert', async () => {
    const project = engine({ milestones: [RANK_FOUR], briefs: [{ chapter: 4, body: 'Mira trains.', claimedMilestones: ['lamp_rank_4'] }] });
    const id = await project.propose([
      { op: 'milestone.remove', milestoneKey: 'lamp_rank_4' },
      { op: 'brief.update', chapter: 4, claimedMilestones: null },
    ]);

    await project.service.apply(7n, id);
    expect(project.milestone('lamp_rank_4')).toBeUndefined();

    await project.service.revert(7n, id);
    expect(project.milestone('lamp_rank_4')).toMatchObject({ label: 'Mira reaches the fourth rank', kind: 'rank', state: 'planned', plannedChapter: 4 });
    expect(project.brief(4)?.['claimedMilestones']).toEqual(['lamp_rank_4']);
  });

  it('should remove a milestone a promise names as its payoff without blocking, unlike a claimed plan or a fact unlock', async () => {
    const project = engine({ milestones: [RANK_FOUR], plotThreads: [{ threadKey: 'the-ledger', summary: 'Who has the ledger.', payoffMilestoneKey: 'lamp_rank_4' }] });
    const id = await project.propose([{ op: 'milestone.remove', milestoneKey: 'lamp_rank_4' }]);

    await project.service.apply(7n, id);
    expect(project.milestone('lamp_rank_4')).toBeUndefined();
  });

  it('should edit only the authored fields of a milestone and put them back on revert', async () => {
    const project = engine({ milestones: [{ ...RANK_FOUR, subjectEntityKey: 'mira' }] });
    const id = await project.propose([{ op: 'milestone.upsert', milestoneKey: 'lamp_rank_4', label: 'The fourth rung', subjectEntityKey: null }]);

    await project.service.apply(7n, id);
    expect(project.milestone('lamp_rank_4')).toMatchObject({ label: 'The fourth rung', subjectEntityKey: null, kind: 'rank', state: 'open' });

    await project.service.revert(7n, id);
    expect(project.milestone('lamp_rank_4')).toMatchObject({ label: 'Mira reaches the fourth rank', subjectEntityKey: 'mira' });
  });

  it('should refuse a new milestone without a label', async () => {
    const project = engine({});
    const id = await project.propose([{ op: 'milestone.upsert', milestoneKey: 'lamp_rank_4' }]);

    await expect(project.service.apply(7n, id)).rejects.toMatchObject({ code: 'RFN_004' });
  });
});
