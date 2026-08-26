import { describe, expect, it } from 'bun:test';

import { ACTION_TYPES, type ChangeOp, changeSetRefs, HUB_ACTION_TYPES, isActionOp, renderActionVocabulary, renderOpVocabulary, validateChangeSet } from '@modules/refinement';

const validOps: ChangeOp[] = [
  { op: 'premise.update', premise: 'a cultivator returns from death', themes: ['revenge'] },
  { op: 'bible_document.upsert', section: 'project', slug: 'reader-promise', body: 'weekly power-ups' },
  { op: 'volume.upsert', volumeKey: 'vol_1', objective: 'survive the sect trials', targetChapterCount: 12 },
  { op: 'arc.upsert', arcKey: 'vol_1_arc_1', volumeKey: 'vol_1', chapterStart: 1, chapterEnd: 6 },
  {
    op: 'brief.update',
    chapter: 3,
    endingContract: { hookType: 'cliffhanger', emotionalBeat: 'dread', openQuestion: 'who betrayed him?', handoffState: 'trapped in the vault' },
  },
];

describe('validateChangeSet', () => {
  it('should accept a well-formed change-set', () => {
    expect(validateChangeSet(validOps)).toEqual([]);
  });

  it('should reject non-arrays and empty change-sets', () => {
    expect(validateChangeSet({})).toEqual(['changeSet must be an array of operations']);
    expect(validateChangeSet([])).toEqual(['changeSet must contain at least one operation']);
  });

  it('should reject unknown ops and unexpected fields', () => {
    expect(validateChangeSet([{ op: 'chapter.delete', chapter: 1 }])[0]).toMatch(/unknown op 'chapter.delete'/);
    expect(validateChangeSet([{ op: 'volume.remove', volumeKey: 'vol_1', extra: true }])[0]).toMatch(/unexpected field 'extra'/);
  });

  it('should reject missing required fields and wrong types', () => {
    expect(validateChangeSet([{ op: 'arc.upsert', arcKey: 'a1' }])[0]).toMatch(/required field 'volumeKey'/);
    expect(validateChangeSet([{ op: 'brief.update', chapter: 'three' }])[0]).toMatch(/required field 'chapter'/);
    expect(validateChangeSet([{ op: 'premise.update', themes: 'revenge' }])[0]).toMatch(/invalid field 'themes'/);
  });

  it('should enforce the scope allowlist', () => {
    const errors = validateChangeSet([{ op: 'volume.upsert', volumeKey: 'vol_1' }], ['brief.update']);
    expect(errors[0]).toMatch(/not allowed for this scope/);
  });

  it('should accept closure hook types on ending contracts', () => {
    for (const hookType of ['closure_with_momentum', 'earned_rest']) {
      expect(validateChangeSet([{ op: 'brief.update', chapter: 1, endingContract: { hookType, emotionalBeat: 'calm', openQuestion: 'x', handoffState: 'y' } }])).toEqual([]);
    }
  });

  it('should validate ending contracts and arc chapter ranges', () => {
    expect(
      validateChangeSet([{ op: 'brief.update', chapter: 1, endingContract: { hookType: 'happy_end', emotionalBeat: 'joy', openQuestion: 'x', handoffState: 'y' } }])[0],
    ).toMatch(/hookType/);
    expect(validateChangeSet([{ op: 'arc.upsert', arcKey: 'a1', volumeKey: 'v1', chapterStart: 9, chapterEnd: 3 }])[0]).toMatch(/chapterStart must be <= chapterEnd/);
    expect(validateChangeSet([{ op: 'bible_document.remove', section: 'poetry', slug: 'x' }])[0]).toMatch(/section must be one of/);
  });

  it('should normalize path-style bible_document refs local models emit', () => {
    const combined = { op: 'bible_document.upsert', section: 'project/premise', slug: 'project/premise', body: 'x' };
    expect(validateChangeSet([combined])).toEqual([]);
    expect(combined).toMatchObject({ section: 'project', slug: 'premise' });

    const prefixedSlug = { op: 'bible_document.remove', section: 'world', slug: 'world/factions' };
    expect(validateChangeSet([prefixedSlug])).toEqual([]);
    expect(prefixedSlug).toMatchObject({ section: 'world', slug: 'factions' });

    const docPrefixed = { op: 'bible_document.upsert', section: 'doc:plot/ending-vision', slug: 'doc:plot/ending-vision', body: 'x' };
    expect(validateChangeSet([docPrefixed])).toEqual([]);
    expect(docPrefixed).toMatchObject({ section: 'plot', slug: 'ending-vision' });

    // An unknown section is not guessable — leave it for validation to reject.
    expect(validateChangeSet([{ op: 'bible_document.remove', section: 'poetry/haiku', slug: 'haiku' }])[0]).toMatch(/section must be one of/);
  });
});

describe('hub ops and actions', () => {
  it('should accept well-formed draft, brief-remove, and action ops', () => {
    const ops: ChangeOp[] = [
      { op: 'draft.update', chapter: 4, body: 'rewritten prose' },
      { op: 'brief.remove', chapter: 9 },
      { op: 'action.generate_chapters', count: 5 },
      { op: 'action.plan_arcs', volumeKey: 'vol_1', arcCount: 2 },
      { op: 'action.revise_draft', chapter: 4, note: 'tighten the pacing' },
      { op: 'action.validate', scope: 'chapter', chapter: 4 },
      { op: 'action.finalize', upTo: 3 },
    ];
    expect(validateChangeSet(ops)).toEqual([]);
  });

  it('should reject malformed hub ops', () => {
    expect(validateChangeSet([{ op: 'draft.update', chapter: 4 }])[0]).toMatch(/at least one of title, body, summary/);
    expect(validateChangeSet([{ op: 'action.generate_chapters', count: 0 }])[0]).toMatch(/count must be >= 1/);
    expect(validateChangeSet([{ op: 'action.validate', scope: 'volume' }])[0]).toMatch(/scope must be one of novel, chapter/);
    expect(validateChangeSet([{ op: 'action.revise_draft', chapter: 4 }])[0]).toMatch(/required field 'note'/);
    expect(validateChangeSet([{ op: 'action.audit_bible', target: 'all' }])[0]).toMatch(/unexpected field 'target'/);
  });

  it('should validate graduation like any other action and keep it out of the hub vocabulary', () => {
    expect(validateChangeSet([{ op: 'action.graduate_seed', title: 'The Wreck Singer' }])).toEqual([]);
    expect(validateChangeSet([{ op: 'action.graduate_seed' }])[0]).toMatch(/required field 'title'/);
    expect(validateChangeSet([{ op: 'action.graduate_seed', title: '  ' }])[0]).toMatch(/title must be a non-empty string/);
    expect(validateChangeSet([{ op: 'action.graduate_seed', title: 'x' }], ['seed.update'])[0]).toMatch(/not allowed for this scope/);
    expect(HUB_ACTION_TYPES).not.toContain('action.graduate_seed');
  });

  it('should classify action ops and render their vocabulary with purposes', () => {
    expect(isActionOp({ op: 'action.audit_bible' })).toBe(true);
    expect(isActionOp({ op: 'draft.update', chapter: 1, body: 'x' })).toBe(false);
    const rendered = renderActionVocabulary(ACTION_TYPES);
    for (const action of ACTION_TYPES) expect(rendered).toContain(`"op": "${action}"`);
    expect(rendered).toContain('never auto-applied');
  });
});

describe('epistemic ops', () => {
  it('should accept well-formed fact ops and knowledge contracts', () => {
    const ops: ChangeOp[] = [
      {
        op: 'fact.upsert',
        factKey: 'heir_is_illegitimate',
        body: 'the heir is not the duke’s son',
        subjects: ['heir'],
        constraintNote: 'never let the duke look at him twice',
        terms: ['bastard', 'birth ledger'],
        revealChapter: 41,
      },
      { op: 'fact.remove', factKey: 'stale_secret' },
      { op: 'brief.update', chapter: 41, knowledgeContract: { pov: ['heir'], learns: [{ entityKey: 'heir', factKey: 'heir_is_illegitimate' }] } },
      { op: 'brief.update', chapter: 42, knowledgeContract: { pov: ['heir', 'duchess'] } },
      { op: 'brief.update', chapter: 43, knowledgeContract: null },
    ];
    expect(validateChangeSet(ops)).toEqual([]);
  });

  it('should reject malformed fact ops', () => {
    expect(validateChangeSet([{ op: 'fact.upsert' }])[0]).toMatch(/required field 'factKey'/);
    expect(validateChangeSet([{ op: 'fact.upsert', factKey: 'f1', terms: 'bastard' }])[0]).toMatch(/invalid field 'terms'/);
    expect(validateChangeSet([{ op: 'fact.upsert', factKey: 'f1', revealChapter: 0 }])[0]).toMatch(/revealChapter must be >= 1/);
    expect(validateChangeSet([{ op: 'fact.upsert', factKey: 'f1', source: 'brief_reveal' }])[0]).toMatch(/unexpected field 'source'/);
    expect(validateChangeSet([{ op: 'fact.remove', factKey: 'f1', entityKey: 'heir' }])[0]).toMatch(/unexpected field 'entityKey'/);
  });

  it('should reject malformed knowledge contracts', () => {
    const contractError = (knowledgeContract: unknown): string | undefined => validateChangeSet([{ op: 'brief.update', chapter: 1, knowledgeContract }])[0];
    expect(contractError('heir')).toMatch(/invalid field 'knowledgeContract' \(expected object\|null\)/);
    expect(contractError({ learns: [] })).toMatch(/knowledgeContract.pov must be a non-empty array/);
    expect(contractError({ pov: [] })).toMatch(/knowledgeContract.pov must be a non-empty array/);
    expect(contractError({ pov: [''] })).toMatch(/knowledgeContract.pov must be a non-empty array/);
    expect(contractError({ pov: ['heir'], learns: {} })).toMatch(/knowledgeContract.learns must be an array/);
    expect(contractError({ pov: ['heir'], learns: [{ entityKey: 'heir' }] })).toMatch(/learns\[0\].factKey must be a non-empty string/);
    expect(contractError({ pov: ['heir'], learns: [{ entityKey: 'heir', factKey: 'f1', chapter: 3 }] })).toMatch(/learns\[0\]: unexpected field 'chapter'/);
    expect(contractError({ pov: ['heir'], reveals: [] })).toMatch(/unexpected field 'knowledgeContract.reveals'/);
  });

  it('should render the fact and knowledge-contract vocabulary only for the scopes that allow them', () => {
    const rendered = renderOpVocabulary(['fact.upsert', 'fact.remove', 'brief.update']);
    expect(rendered).toContain('"op": "fact.upsert", "factKey": <string, required>');
    expect(rendered).toContain('"pov": <non-empty array of entity keys>');
    expect(rendered).toContain('NEVER in bible prose');
    expect(rendered).toContain('the reveal schedule IS the plot');
    expect(renderOpVocabulary(['volume.upsert'])).not.toContain('knowledgeContract');
    expect(renderOpVocabulary(['brief.update'])).not.toContain('spoiler ledger');
  });
});

describe('changeSetRefs', () => {
  it('should derive deduplicated artifact refs', () => {
    const refs = changeSetRefs([...validOps, { op: 'volume.remove', volumeKey: 'vol_1' }]);
    expect(refs).toEqual(['premise', 'doc:project/reader-promise', 'volume:vol_1', 'arc:vol_1_arc_1', 'chapter:3']);
  });

  it('should map draft ops to draft: refs and actions to none', () => {
    const refs = changeSetRefs([
      { op: 'draft.update', chapter: 4, body: 'x' },
      { op: 'brief.remove', chapter: 9 },
      { op: 'action.generate_chapters', count: 5 },
      { op: 'action.audit_bible' },
    ]);
    expect(refs).toEqual(['draft:4', 'chapter:9']);
  });

  it('should map fact ops to fact: refs', () => {
    const refs = changeSetRefs([
      { op: 'fact.upsert', factKey: 'heir_is_illegitimate', body: 'x' },
      { op: 'fact.remove', factKey: 'heir_is_illegitimate' },
      { op: 'fact.remove', factKey: 'stale_secret' },
    ]);
    expect(refs).toEqual(['fact:heir_is_illegitimate', 'fact:stale_secret']);
  });
});
