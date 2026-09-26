import { describe, expect, it } from 'bun:test';

import { schema } from '@server/database';

import { type BriefUpdateOp, type ChangeOp } from '@modules/refinement/change-set';
import { ideaIdOf } from '@modules/refinement/idea-id';
import {
  densityFindings,
  findPoolingDiagnostics,
  isPlanSecret,
  loadPlanDiagnostics,
  type PlanDiagnostic,
  proposalDiagnostics,
  scenePovFindings,
} from '@modules/refinement/plan-diagnostics';
import { ProposalService } from '@modules/refinement/proposal.service';

import { planTables } from '../knowledge/plan-tables';

const TARGET = { min: 2000, max: 3000, aim: 2500 };
const ADVICE = 'the writer will have it for the whole chapter — split into two chapters, or keep it (a clue check will run).';

const messages = (diagnostics: readonly PlanDiagnostic[]): string[] => diagnostics.map(diagnostic => diagnostic.message);

function poolingDiagnostics(overrides: Partial<Parameters<typeof findPoolingDiagnostics>[0]> = {}): PlanDiagnostic[] {
  return findPoolingDiagnostics({
    scenes: [{ pov: 'ren' }, { pov: 'ren' }, { pov: 'mara' }],
    knownByPov: new Map([
      ['mara', new Set(['lamp_origin', 'open_rule'])],
      ['ren', new Set(['open_rule'])],
    ]),
    learns: [],
    secrets: new Set(['lamp_origin']),
    names: new Map([['mara', 'Mara']]),
    ...overrides,
  });
}

function pooling(overrides: Partial<Parameters<typeof findPoolingDiagnostics>[0]> = {}): string[] {
  return messages(poolingDiagnostics(overrides));
}

describe('findPoolingDiagnostics', () => {
  it('should warn, by the secret’s label, when one scene’s point of view knows a secret another’s does not', () => {
    expect(pooling()).toEqual([`Scene 3's point of view (Mara) knows "Lamp origin", which scenes 1 and 2 (ren) do not; ${ADVICE}`]);
  });

  it('should leave out what is no secret: a rule everyone lives under, or a fact the reader was already shown', () => {
    expect(pooling({ secrets: new Set() })).toEqual([]);
  });

  it('should count what a scene’s point of view learns on the page, and say it must not colour the scenes before', () => {
    const warnings = pooling({ knownByPov: new Map(), learns: [{ entityKey: 'mara', factKey: 'lamp_origin' }] });

    expect(warnings).toEqual([
      `Scene 3's point of view (Mara) knows "Lamp origin", which scenes 1 and 2 (ren) do not; ${ADVICE}`,
      '"Lamp origin" is learned in scene 3 — it must not colour earlier scenes; the writer has it for the whole chapter (a clue check will run).',
    ]);
  });

  it('should list at most five secrets and count the rest', () => {
    const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const [warning] = pooling({ knownByPov: new Map([['mara', new Set(keys)]]), secrets: new Set(keys) });

    expect(warning).toContain('knows "A", "B", "C", "D", "E" (+2 more), which');
  });

  it('should carry the points of view, their scenes and every pooled secret by key and title, never its truth, as data', () => {
    const [diagnostic] = poolingDiagnostics();

    expect(diagnostic).toEqual({
      kind: 'pooling',
      message: expect.stringContaining('knows'),
      data: {
        knowing: [{ entityKey: 'mara', name: 'Mara' }],
        unaware: [{ entityKey: 'ren', name: 'ren' }],
        facts: [{ factKey: 'lamp_origin', label: 'Lamp origin' }],
        knowingScenes: [2],
        unawareScenes: [0, 1],
      },
    });
  });

  it('should mark the scene a secret is learned in, and the scenes before it', () => {
    const learned = poolingDiagnostics({ knownByPov: new Map(), learns: [{ entityKey: 'mara', factKey: 'lamp_origin' }] })[1];

    expect(learned?.kind === 'pooling' && learned.data).toEqual({
      knowing: [{ entityKey: 'mara', name: 'Mara' }],
      unaware: [{ entityKey: 'ren', name: 'ren' }],
      facts: [{ factKey: 'lamp_origin', label: 'Lamp origin' }],
      knowingScenes: [2],
      unawareScenes: [0, 1],
      learnedInScene: 2,
    });
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
    expect(messages(densityFindings([{ pov: 'mara', estimatedWords: 900 }], null, TARGET))).toEqual([
      'Density: 1 scene(s) for a 2000–3000 word chapter, which usually takes 3 — keep it if that is what you intend.',
      'Density: the scenes come to about 900 words, under the 2000-word target — keep it if that is what you intend.',
    ]);
  });

  it('should pass the planner’s own density risk on, and judge no length the scenes do not state', () => {
    expect(densityFindings([{ pov: 'mara' }], 'Thin material', TARGET)).toEqual([{ kind: 'density', message: 'Density: Thin material — keep it if that is what you intend.' }]);
    expect(densityFindings([{ pov: 'a' }, { pov: 'a' }, { pov: 'a' }], null, TARGET)).toEqual([]);
  });
});

describe('scenePovFindings', () => {
  it('should ask for a point of view where a scene has none or names someone who is not a character', () => {
    expect(scenePovFindings([{ pov: 'mara' }, { pov: null }, { pov: 'the_lamp' }], new Set(['mara']))).toEqual([
      { kind: 'pov', message: 'Scene 2 names no point of view — pick one on the card.', data: { sceneIndex: 1, pov: null } },
      { kind: 'pov', message: 'Scene 3\'s point of view "the_lamp" is not a character in the Story Bible — pick one on the card.', data: { sceneIndex: 2, pov: 'the_lamp' } },
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
    expect(messages(await loadPlanDiagnostics(project().db as never, 7n, PLAN))).toEqual([
      `Scenes 1 and 3's point of view (Mara) knows "Lamp origin", which scene 2 (Ren) does not; ${ADVICE}`,
    ]);
  });

  it('should warn when an edited scene names a secret the plan cannot reveal yet, and not once its claim unlocks it', async () => {
    const leaky = { ...PLAN, scenes: PLAN.scenes?.map((scene, index) => (index === 1 ? { ...scene, beats: ['Ren waits.', 'He hums of the drowned king.'] } : scene)) };

    expect((await loadPlanDiagnostics(project().db as never, 7n, leaky))[0]).toEqual({
      kind: 'give_away',
      message: 'Give-away: scene 2\'s beat 2 names a term of "Lamp origin", which is still locked here — reword it before the writer reads it.',
      data: { factKey: 'lamp_origin', label: 'Lamp origin', sceneIndex: 1, field: 'beats', beatIndex: 1 },
    });
    expect(messages(await loadPlanDiagnostics(project().db as never, 7n, { ...leaky, claimedMilestones: ['lamp_rank_3'] }))).not.toContainEqual(
      expect.stringContaining('Give-away'),
    );
  });

  it('should judge a stored plan with no volume as the apply would keep it — outside every volume — rather than in the nearest one', async () => {
    const tables = planTables({
      volumes: [{ volumeKey: 'v1', ordinal: 1 }],
      briefs: [
        { chapter: 3, volumeKey: 'v1' },
        { chapter: 4, volumeKey: null },
      ],
      facts: [{ factKey: 'lamp_origin', text: 'The lamp holds a drowned king.', terms: ['drowned king'], unlock: { all: [{ volume: 'v1' }] } }],
      entities: [{ id: 101n, entityKey: 'mara', name: 'Mara', type: 'character' }],
    });
    const leaky: BriefUpdateOp = { op: 'brief.update', chapter: 4, scenes: [{ summary: 'Mara hums of the drowned king.', pov: 'mara' }] };

    expect(messages(await loadPlanDiagnostics(tables.db as never, 7n, leaky))).toContainEqual(expect.stringContaining('Give-away'));
    expect(messages(await loadPlanDiagnostics(tables.db as never, 7n, { ...leaky, volumeKey: 'v1' }))).not.toContainEqual(expect.stringContaining('Give-away'));
  });

  it('should have nothing to say about an empty plan', async () => {
    expect(await loadPlanDiagnostics(project().db as never, 7n, { op: 'brief.update', chapter: 4, body: '', scenes: [] })).toEqual([]);
  });
});

describe('proposalDiagnostics', () => {
  it('should list the untyped warnings as other, then the plan card’s own findings with their kind and data', () => {
    const density: PlanDiagnostic = { kind: 'density', message: 'Density: thin.' };

    expect(proposalDiagnostics(['drops "x"'], [density])).toEqual([{ kind: 'other', message: 'drops "x"' }, density]);
  });
});

describe('ProposalService — plan card diagnostics', () => {
  it('should judge a plan card’s diagnostics again when the author edits its scenes', async () => {
    const tables = project();
    const service = new ProposalService({ getPostgresClient: () => tables.db } as never);
    const card = await service.create(7n, { scopeType: 'novel', kind: 'chapter_plan', changeSet: [PLAN as ChangeOp], allowedOps: ['brief.update'] });
    expect(card.warnings).toEqual([expect.stringContaining('which scene 2 (Ren) does not')]);
    expect(card.diagnostics).toEqual([expect.objectContaining({ kind: 'pooling', message: card.warnings?.[0] })]);
    Object.assign(tables.rows(schema.refinementProposals)[0] ?? {}, { status: 'pending' });

    const edited = { ...PLAN, scenes: PLAN.scenes?.map(scene => ({ ...scene, pov: 'mara' })) };
    const updated = await service.updateChangeSet(7n, card.id, [edited]);

    expect(updated.warnings).toBeNull();
    expect(updated.diagnostics).toBeNull();
    expect(tables.rows(schema.refinementProposals)).toHaveLength(1);
  });

  it('should never quote a secret’s truth in a warning or a diagnostic message, only its title', async () => {
    const tables = project();
    const service = new ProposalService({ getPostgresClient: () => tables.db } as never);
    const leaky = { ...PLAN, scenes: PLAN.scenes?.map((scene, index) => (index === 1 ? { ...scene, beats: ['Ren waits.', 'He hums of the drowned king.'] } : scene)) };

    const card = await service.create(7n, { scopeType: 'novel', kind: 'chapter_plan', changeSet: [leaky as ChangeOp], allowedOps: ['brief.update'] });

    expect(card.diagnostics?.map(diagnostic => diagnostic.kind)).toEqual(expect.arrayContaining(['give_away', 'pooling']));
    for (const message of [...(card.warnings ?? []), ...(card.diagnostics ?? []).map(diagnostic => diagnostic.message)]) {
      expect(message).not.toContain('The lamp holds a drowned king.');
      expect(message).not.toContain('Lamps burn memories.');
    }
  });

  it('should refuse an edit that an apply or discard settled while it was being judged, and leave the card as settled', async () => {
    const tables = project();
    const service = new ProposalService({ getPostgresClient: () => tables.db } as never);
    const card = await service.create(7n, { scopeType: 'novel', kind: 'chapter_plan', changeSet: [PLAN as ChangeOp], allowedOps: ['brief.update'] });
    const row = tables.rows(schema.refinementProposals)[0] ?? {};
    Object.assign(row, { status: 'pending' });
    const facts = tables.db.query.canonFacts.findMany;
    tables.db.query.canonFacts.findMany = async query => {
      Object.assign(row, { status: 'applied' });
      return facts(query);
    };

    const edited = { ...PLAN, scenes: PLAN.scenes?.map(scene => ({ ...scene, pov: 'mara' })) };

    await expect(service.updateChangeSet(7n, card.id, [edited])).rejects.toMatchObject({ code: 'RFN_002' });
    expect(row['changeSet']).toEqual(card.changeSet);
    expect(row['changeSet']).toEqual([{ ...PLAN, ideaId: ideaIdOf(PLAN as ChangeOp) }]);
    expect(row['status']).toBe('applied');
  });
});
