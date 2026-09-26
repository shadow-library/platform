import { describe, expect, it } from 'bun:test';

import { GenerationService } from '@modules/generation/generation.service';
import { schema } from '@server/database';

import { FakeAuthoringClaims } from '../jobs/authoring-claim-fixtures';
import { type PlanSeed, planTables } from '../knowledge/plan-tables';

const learns = (...factKeys: string[]) => ({ pov: ['mira'], learns: factKeys.map(factKey => ({ entityKey: 'mira', factKey })) });
const RANK_FOUR = { milestoneKey: 'lamp_rank_4', label: 'Mira reaches the fourth rank' };
const RANK_FOUR_RULE = { factKey: 'lamp_rank_4_rule', text: 'The fourth rank trades a memory for each hour of light.', unlock: { all: [{ milestone: 'lamp_rank_4' }] } };

function service(seed: PlanSeed) {
  const tables = planTables(seed);
  const noop = {} as never;
  const generation = new GenerationService(
    { getPostgresClient: () => tables.db } as never,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    new FakeAuthoringClaims().asService(),
    noop,
  );
  return { ...tables, generation };
}

describe('GenerationService.updateBrief — plan rules', () => {
  it('should refuse a hand-written plan that reveals a fact its unlock keeps locked, under the plan lock', async () => {
    const project = service({ milestones: [RANK_FOUR], facts: [RANK_FOUR_RULE] });

    await expect(project.generation.updateBrief(7n, 5, { body: 'Mira climbs.', knowledgeContract: learns('lamp_rank_4_rule') })).rejects.toMatchObject({ code: 'PLN_001' });
    expect(project.locks[0]).toBe(schema.projects);
  });

  it('should accept the reveal once the plan claims the milestone, and plan the milestone at that chapter', async () => {
    const project = service({ milestones: [RANK_FOUR], facts: [RANK_FOUR_RULE] });

    await project.generation.updateBrief(7n, 5, { body: 'Mira climbs.', claimedMilestones: ['lamp_rank_4'], knowledgeContract: learns('lamp_rank_4_rule') });

    expect(project.milestone('lamp_rank_4')).toMatchObject({ state: 'planned', plannedChapter: 5 });
    expect(project.fact('lamp_rank_4_rule')).toMatchObject({ plannedChapter: 5 });
  });

  it('should return the milestone to open when the plan drops its claim', async () => {
    const project = service({
      milestones: [{ ...RANK_FOUR, state: 'planned', plannedChapter: 5 }],
      briefs: [{ chapter: 5, body: 'Mira climbs.', claimedMilestones: ['lamp_rank_4'] }],
    });

    await project.generation.updateBrief(7n, 5, { body: 'Mira climbs.', claimedMilestones: null });

    expect(project.milestone('lamp_rank_4')).toMatchObject({ state: 'open', plannedChapter: null });
  });

  it('should refuse a second ending and a claim of a milestone the novel does not have', async () => {
    const project = service({ briefs: [{ chapter: 40, body: 'The last light.', isEnding: true }] });

    await expect(project.generation.updateBrief(7n, 41, { body: 'After the last light.', isEnding: true })).rejects.toMatchObject({ code: 'PLN_002' });
    await expect(project.generation.updateBrief(7n, 39, { body: 'The eve.', claimedMilestones: ['lamp_rank_9'] })).rejects.toMatchObject({ code: 'PLN_003' });
  });
});
