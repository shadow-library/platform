import { describe, expect, it } from 'bun:test';

import { ACTION_TYPES, type ChangeOp, changeSetRefs, isActionOp, renderActionVocabulary, validateChangeSet } from '@modules/refinement';

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

  it('should classify action ops and render their vocabulary with purposes', () => {
    expect(isActionOp({ op: 'action.audit_bible' })).toBe(true);
    expect(isActionOp({ op: 'draft.update', chapter: 1, body: 'x' })).toBe(false);
    const rendered = renderActionVocabulary(ACTION_TYPES);
    for (const action of ACTION_TYPES) expect(rendered).toContain(`"op": "${action}"`);
    expect(rendered).toContain('never auto-applied');
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
});
