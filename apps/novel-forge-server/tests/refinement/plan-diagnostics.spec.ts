import { describe, expect, it } from 'bun:test';

import { schema } from '@server/database';

import { type BriefUpdateOp, type ChangeOp } from '@modules/refinement/change-set';
import { densityFindings, findPoolingWarnings, isPlanSecret, loadPlanDiagnostics, scenePovFindings } from '@modules/refinement/plan-diagnostics';
import { ProposalService } from '@modules/refinement/proposal.service';

import { planTables } from '../knowledge/plan-tables';

const TARGET = { min: 2000, max: 3000, aim: 2500 };
const ADVICE = 'the writer will have it for the whole chapter — split into two chapters, or keep it (a clue check will run).';

function pooling(overrides: Partial<Parameters<typeof findPoolingWarnings>[0]> = {}) {
  return findPoolingWarnings({
    scenes: [{ pov: 'ren' }, { pov: 'ren' }, { pov: 'mara' }],
    knownByPov: new Map([
      ['mara', new Set(['lamp_origin', 'open_rule'])],
      ['ren', new Set(['open_rule'])],
    ]),
    learns: [],
    secrets: new Set(['lamp_origin']),
    labels: new Map([['lamp_origin', 'The lamp holds a drowned king.']]),
    names: new Map([['mara', 'Mara']]),
    ...overrides,
  });
}

describe('findPoolingWarnings', () => {
  it('should warn, by the secret’s label, when one scene’s point of view knows a secret another’s does not', () => {
    expect(pooling()).toEqual([`Scene 3's point of view (Mara) knows "The lamp holds a drowned king.", which scenes 1 and 2 (ren) do not; ${ADVICE}`]);
  });

  it('should leave out what is no secret: a rule everyone lives under, or a fact the reader was already shown', () => {
    expect(pooling({ secrets: new Set() })).toEqual([]);
  });

  it('should count what a scene’s point of view learns on the page, and say it must not colour the scenes before', () => {
    const warnings = pooling({ knownByPov: new Map(), learns: [{ entityKey: 'mara', factKey: 'lamp_origin' }] });

    expect(warnings).toEqual([
      `Scene 3's point of view (Mara) knows "The lamp holds a drowned king.", which scenes 1 and 2 (ren) do not; ${ADVICE}`,
      '"The lamp holds a drowned king." is learned in scene 3 — it must not colour earlier scenes; the writer has it for the whole chapter (a clue check will run).',
    ]);
  });

  it('should list at most five secrets and count the rest', () => {
    const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const [warning] = pooling({ knownByPov: new Map([['mara', new Set(keys)]]), secrets: new Set(keys), labels: new Map() });

    expect(warning).toContain('knows "a", "b", "c", "d", "e" (+2 more), which');
  });

  it('should stay quiet when the chapter has one point of view and nothing is learned after its first scene', () => {
    expect(pooling({ scenes: [{ pov: 'mara' }, { pov: 'mara' }], learns: [{ entityKey: 'mara', factKey: 'lamp_origin' }] })).toEqual([]);
  });
});

describe('isPlanSecret', () => {
  it('should treat open canon and reader promises as no secret, and a fact shown to the reader before the chapter as spent', () => {
    const fact = { factKey: 'f', revealChapter: null, unlock: null, source: 'manual' as const, disclosedInChapter: null };

    expect(isPlanSecret(fact, 4)).toBe(true);
    expect(isPlanSecret({ ...fact, revealChapter: 1 }, 4)).toBe(false);
    expect(isPlanSecret({ ...fact, source: 'seed' }, 4)).toBe(false);
    expect(isPlanSecret({ ...fact, disclosedInChapter: 2 }, 4)).toBe(false);
    expect(isPlanSecret({ ...fact, disclosedInChapter: 4 }, 4)).toBe(true);
  });
});

describe('densityFindings', () => {
  it('should advise on a thin chapter without refusing it', () => {
    expect(densityFindings([{ pov: 'mara', estimatedWords: 900 }], null, TARGET)).toEqual([
      'Density: 1 scene(s) for a 2000–3000 word chapter, which usually takes 3 — keep it if that is what you intend.',
      'Density: the scenes come to about 900 words, under the 2000-word target — keep it if that is what you intend.',
    ]);
  });

  it('should pass the planner’s own density risk on, and judge no length the scenes do not state', () => {
    expect(densityFindings([{ pov: 'mara' }], 'Thin material', TARGET)).toEqual(['Density: Thin material — keep it if that is what you intend.']);
    expect(densityFindings([{ pov: 'a' }, { pov: 'a' }, { pov: 'a' }], null, TARGET)).toEqual([]);
  });
});

describe('scenePovFindings', () => {
  it('should ask for a point of view where a scene has none or names someone who is not a character', () => {
    expect(scenePovFindings([{ pov: 'mara' }, { pov: null }, { pov: 'the_lamp' }], new Set(['mara']))).toEqual([
      'Scene 2 names no point of view — pick one on the card.',
      'Scene 3\'s point of view "the_lamp" is not a character in the Story Bible — pick one on the card.',
    ]);
  });
});

function project() {
  return planTables({
    milestones: [{ milestoneKey: 'lamp_rank_3', label: 'Mara reaches Lamp rank 3' }],
    facts: [
      { id: 201n, factKey: 'lamp_origin', text: 'The lamp holds a drowned king.', terms: ['drowned king'], unlock: { all: [{ milestone: 'lamp_rank_3' }] } },
      { id: 202n, factKey: 'open_rule', text: 'Lamps burn memories.', revealChapter: 1 },
    ],
    entities: [
      { id: 101n, entityKey: 'mara', name: 'Mara', type: 'character' },
      { id: 102n, entityKey: 'ren', name: 'Ren', type: 'character' },
    ],
    knowledge: [
      { factId: 201n, entityId: 101n, learnedInChapter: 2 },
      { factId: 202n, entityId: 101n, learnedInChapter: 2 },
      { factId: 201n, entityId: 102n, learnedInChapter: 6 },
    ],
  });
}

const PLAN: BriefUpdateOp = {
  op: 'brief.update',
  chapter: 4,
  body: 'Mara tests the lamp.',
  scenes: [
    { summary: 'Mara at the gate', pov: 'mara', estimatedWords: 800 },
    { summary: 'Ren waits', pov: 'ren', estimatedWords: 800 },
    { summary: 'Mara returns', pov: 'mara', estimatedWords: 800 },
  ],
};

describe('loadPlanDiagnostics', () => {
  it('should read what each scene’s point of view knew before the chapter from the ledger, secrets only', async () => {
    expect(await loadPlanDiagnostics(project().db as never, 7n, PLAN)).toEqual([
      `Scenes 1 and 3's point of view (Mara) knows "The lamp holds a drowned king.", which scene 2 (Ren) does not; ${ADVICE}`,
    ]);
  });

  it('should warn when an edited scene names a secret the plan cannot reveal yet, and not once its claim unlocks it', async () => {
    const leaky = { ...PLAN, scenes: PLAN.scenes?.map((scene, index) => (index === 1 ? { ...scene, beats: ['Ren waits.', 'He hums of the drowned king.'] } : scene)) };

    expect((await loadPlanDiagnostics(project().db as never, 7n, leaky))[0]).toBe(
      'Give-away: scene 2\'s beat 2 names a term of "The lamp holds a drowned king.", which is still locked here — reword it before the writer reads it.',
    );
    expect(await loadPlanDiagnostics(project().db as never, 7n, { ...leaky, claimedMilestones: ['lamp_rank_3'] })).not.toContainEqual(expect.stringContaining('Give-away'));
  });

  it('should have nothing to say about an empty plan', async () => {
    expect(await loadPlanDiagnostics(project().db as never, 7n, { op: 'brief.update', chapter: 4, body: '', scenes: [] })).toEqual([]);
  });
});

describe('ProposalService — plan card diagnostics', () => {
  it('should judge a plan card’s diagnostics again when the author edits its scenes', async () => {
    const tables = project();
    const service = new ProposalService({ getPostgresClient: () => tables.db } as never);
    const card = await service.create(7n, { scopeType: 'novel', kind: 'chapter_plan', changeSet: [PLAN as ChangeOp], allowedOps: ['brief.update'] });
    expect(card.warnings).toEqual([expect.stringContaining('which scene 2 (Ren) does not')]);
    Object.assign(tables.rows(schema.refinementProposals)[0] ?? {}, { status: 'pending' });

    const edited = { ...PLAN, scenes: PLAN.scenes?.map(scene => ({ ...scene, pov: 'mara' })) };
    const updated = await service.updateChangeSet(7n, card.id, [edited]);

    expect(updated.warnings).toBeNull();
    expect(tables.rows(schema.refinementProposals)).toHaveLength(1);
  });
});
