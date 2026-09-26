import { describe, expect, it } from 'bun:test';

import { type ContentOp, ProposalService } from '@modules/refinement';
import { type ImpactPlanRow, type ImpactRows, type UndoImpact, undoImpact, type UndoneChange, undoneChange } from '@modules/refinement/undo-impact';

function plan(chapter: number, fields: Partial<ImpactPlanRow> = {}): ImpactPlanRow {
  return { chapter, volumeKey: null, pov: null, scenes: null, knowledgeContract: null, claimedMilestones: null, contextRefs: null, ...fields };
}

const ROWS: ImpactRows = {
  plans: [
    plan(3, { pov: 'mira', volumeKey: 'v1' }),
    plan(4, { scenes: [{ summary: 'Kael at the forge', pov: 'kael' }], knowledgeContract: { pov: ['kael'], learns: [{ entityKey: 'kael', factKey: 'crown' }] } }),
    plan(5, { claimedMilestones: ['court_falls'], contextRefs: ['bible_doc:world/saltgate'] }),
    plan(6, { volumeKey: 'v2', pov: 'mira' }),
  ],
  drafts: [
    { chapter: 3, status: 'final' },
    { chapter: 4, status: 'draft' },
    { chapter: 5, status: 'draft' },
  ],
  knowledge: [
    { factKey: 'crown', entityKey: 'kael', learnedInChapter: 4, status: 'provisional' },
    { factKey: 'crown', entityKey: 'mira', learnedInChapter: 2, status: 'committed' },
    { factKey: 'tide', entityKey: 'mira', learnedInChapter: 1, status: 'committed' },
  ],
  suggestions: [
    { id: 41n, changeSet: [{ op: 'fact.upsert', factKey: 'tide', subjects: ['kael'] }], baseline: { 'fact:tide': {} } },
    { id: 42n, changeSet: [{ op: 'brief.update', chapter: 7, contextRefs: ['bible_doc:world/saltgate'] }], baseline: { 'chapter:7': {} } },
  ],
};

const created = (...refs: string[]): UndoneChange => ({ created: refs, updated: [] });
const updated = (...refs: string[]): UndoneChange => ({ created: [], updated: refs });

interface ImpactCase {
  name: string;
  change: UndoneChange;
  expected: UndoImpact;
}

const CASES: ImpactCase[] = [
  {
    name: 'a created character lists every plan that names it, their drafts, what it knows and the suggestions that name it',
    change: created('entity:kael'),
    expected: {
      dependents: [
        { kind: 'plan', ref: 'chapter:4', chapter: 4, because: 'entity:kael', final: false },
        { kind: 'draft', ref: 'draft:4', chapter: 4, because: 'chapter:4', final: false },
        { kind: 'knowledge', ref: 'knowledge:kael/crown', chapter: 4, because: 'entity:kael', final: false },
        { kind: 'suggestion', ref: 'proposal:41', chapter: null, because: 'entity:kael', final: false },
      ],
      finalUnaffected: 0,
    },
  },
  {
    name: 'a created character lists finalized history too, marked final',
    change: created('entity:mira'),
    expected: {
      dependents: [
        { kind: 'plan', ref: 'chapter:3', chapter: 3, because: 'entity:mira', final: true },
        { kind: 'plan', ref: 'chapter:6', chapter: 6, because: 'entity:mira', final: false },
        { kind: 'draft', ref: 'draft:3', chapter: 3, because: 'chapter:3', final: true },
        { kind: 'knowledge', ref: 'knowledge:mira/tide', chapter: 1, because: 'entity:mira', final: true },
        { kind: 'knowledge', ref: 'knowledge:mira/crown', chapter: 2, because: 'entity:mira', final: true },
      ],
      finalUnaffected: 0,
    },
  },
  {
    name: "an updated character's field counts finalized plans and drafts, and leaves knowledge out",
    change: updated('entity:mira'),
    expected: { dependents: [{ kind: 'plan', ref: 'chapter:6', chapter: 6, because: 'entity:mira', final: false }], finalUnaffected: 2 },
  },
  {
    name: 'an updated secret keeps the knowledge rows about it',
    change: updated('fact:crown'),
    expected: {
      dependents: [
        { kind: 'plan', ref: 'chapter:4', chapter: 4, because: 'fact:crown', final: false },
        { kind: 'draft', ref: 'draft:4', chapter: 4, because: 'chapter:4', final: false },
        { kind: 'knowledge', ref: 'knowledge:mira/crown', chapter: 2, because: 'fact:crown', final: true },
        { kind: 'knowledge', ref: 'knowledge:kael/crown', chapter: 4, because: 'fact:crown', final: false },
      ],
      finalUnaffected: 0,
    },
  },
  {
    name: 'a pending suggestion whose baseline holds an updated record is listed',
    change: updated('fact:tide'),
    expected: {
      dependents: [
        { kind: 'knowledge', ref: 'knowledge:mira/tide', chapter: 1, because: 'fact:tide', final: true },
        { kind: 'suggestion', ref: 'proposal:41', chapter: null, because: 'fact:tide', final: false },
      ],
      finalUnaffected: 0,
    },
  },
  {
    name: 'a Story Bible page lists the plans and suggestions that cite it in the stored ref format',
    change: created('doc:world/saltgate'),
    expected: {
      dependents: [
        { kind: 'plan', ref: 'chapter:5', chapter: 5, because: 'doc:world/saltgate', final: false },
        { kind: 'draft', ref: 'draft:5', chapter: 5, because: 'chapter:5', final: false },
        { kind: 'suggestion', ref: 'proposal:42', chapter: null, because: 'doc:world/saltgate', final: false },
      ],
      finalUnaffected: 0,
    },
  },
  {
    name: 'a volume lists the plans that serve it, undrafted ones included',
    change: created('volume:v2'),
    expected: { dependents: [{ kind: 'plan', ref: 'chapter:6', chapter: 6, because: 'volume:v2', final: false }], finalUnaffected: 0 },
  },
  {
    name: 'a milestone lists the plans that claim it',
    change: created('milestone:court_falls'),
    expected: {
      dependents: [
        { kind: 'plan', ref: 'chapter:5', chapter: 5, because: 'milestone:court_falls', final: false },
        { kind: 'draft', ref: 'draft:5', chapter: 5, because: 'chapter:5', final: false },
      ],
      finalUnaffected: 0,
    },
  },
  {
    name: 'an updated plan lists its own draft, not itself',
    change: updated('chapter:4'),
    expected: { dependents: [{ kind: 'draft', ref: 'draft:4', chapter: 4, because: 'chapter:4', final: false }], finalUnaffected: 0 },
  },
  {
    name: 'an updated draft lists the unfinalized drafts after it',
    change: updated('draft:2'),
    expected: {
      dependents: [
        { kind: 'draft', ref: 'draft:4', chapter: 4, because: 'draft:2', final: false },
        { kind: 'draft', ref: 'draft:5', chapter: 5, because: 'draft:2', final: false },
      ],
      finalUnaffected: 1,
    },
  },
  {
    name: 'a dependent a created record reaches is listed even when an updated one only counted it',
    change: { created: ['volume:v1'], updated: ['entity:mira'] },
    expected: {
      dependents: [
        { kind: 'plan', ref: 'chapter:3', chapter: 3, because: 'volume:v1', final: true },
        { kind: 'plan', ref: 'chapter:6', chapter: 6, because: 'entity:mira', final: false },
        { kind: 'draft', ref: 'draft:3', chapter: 3, because: 'chapter:3', final: true },
      ],
      finalUnaffected: 0,
    },
  },
  { name: 'a record nothing relies on lists nothing', change: created('entity:aldo', 'premise'), expected: { dependents: [], finalUnaffected: 0 } },
];

describe('undoImpact', () => {
  for (const testCase of CASES) {
    it(`should find that ${testCase.name}`, () => {
      expect(undoImpact(testCase.change, ROWS)).toEqual(testCase.expected);
    });
  }
});

describe('undoneChange', () => {
  it('should read a record whose inverse removes it as created, and every other as updated', () => {
    const inverse: ContentOp[] = [
      { op: 'entity.remove', entityKey: 'kael' },
      { op: 'entity.upsert', entityKey: 'mira', type: 'character', name: 'Mira' },
      { op: 'premise.update', premise: '' },
    ];

    expect(undoneChange(['entity:kael', 'entity:mira', 'premise'], inverse)).toEqual({ created: ['entity:kael'], updated: ['entity:mira', 'premise'] });
  });
});

describe('ProposalService.undoImpact', () => {
  function service(proposal: Record<string, unknown>) {
    const db = {
      query: {
        refinementProposals: { findFirst: async () => ({ id: 9n, projectId: 7n, ...proposal }), findMany: async () => [] },
        briefs: { findMany: async () => [plan(6, { volumeKey: 'v2' })] },
        drafts: { findMany: async () => [] },
      },
    };
    return new ProposalService({ getPostgresClient: () => db } as never);
  }

  it('should refuse a proposal that is not applied or has nothing to invert', async () => {
    await expect(service({ status: 'pending', inverseOps: [] }).undoImpact(7n, 9n)).rejects.toMatchObject({ code: 'RFN_007' });
    await expect(service({ status: 'applied', inverseOps: [] }).undoImpact(7n, 9n)).rejects.toMatchObject({ code: 'RFN_007' });
    await expect(service({ status: 'reverted', inverseOps: [{ op: 'volume.remove', volumeKey: 'v2' }] }).undoImpact(7n, 9n)).rejects.toMatchObject({ code: 'RFN_007' });
  });

  it('should list what relies on an applied proposal’s records', async () => {
    const applied = service({ status: 'applied', inverseOps: [{ op: 'volume.remove', volumeKey: 'v2' }], postState: { 'volume:v2': {} } });

    expect(await applied.undoImpact(7n, 9n)).toEqual({ dependents: [{ kind: 'plan', ref: 'chapter:6', chapter: 6, because: 'volume:v2', final: false }], finalUnaffected: 0 });
  });
});
