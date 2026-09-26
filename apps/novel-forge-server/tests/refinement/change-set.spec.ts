import { describe, expect, it } from 'bun:test';

import {
  ACTION_TYPES,
  type ChangeOp,
  changeSetRefs,
  isActionOp,
  renderActionVocabulary,
  renderOpVocabulary,
  validateChangeSet,
  validatePluginChangeSet,
} from '@modules/refinement';

const validOps: ChangeOp[] = [
  { op: 'premise.update', premise: 'a cultivator returns from death', themes: ['revenge'] },
  { op: 'bible_document.upsert', section: 'project', slug: 'reader-promise', body: 'weekly power-ups' },
  { op: 'volume.upsert', volumeKey: 'vol_1', objective: 'survive the sect trials' },
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
    expect(validateChangeSet([{ op: 'volume.upsert', title: 'Ascent' }])[0]).toMatch(/required field 'volumeKey'/);
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

  it('should validate ending contracts and bible sections', () => {
    expect(
      validateChangeSet([{ op: 'brief.update', chapter: 1, endingContract: { hookType: 'happy_end', emotionalBeat: 'joy', openQuestion: 'x', handoffState: 'y' } }])[0],
    ).toMatch(/hookType/);
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

describe('the working title, which no change-set may set', () => {
  it('should refuse a title on premise.update for every scope', () => {
    const rename = [{ op: 'premise.update', title: 'A Name The Chat Chose' }];
    expect(validateChangeSet(rename)).toEqual(["changeSet[0]: unexpected field 'title'"]);
    expect(validateChangeSet(rename, ['premise.update', 'bible_document.upsert'])).toEqual(["changeSet[0]: unexpected field 'title'"]);
  });

  it('should leave the rest of premise.update alone', () => {
    expect(validateChangeSet([{ op: 'premise.update', premise: 'a clerk audits the dead' }])).toEqual([]);
  });

  it('should not advertise a title field', () => {
    const vocabulary = renderOpVocabulary(['premise.update']);
    expect(vocabulary).toContain('"premise": <string, optional>');
    expect(vocabulary).not.toContain('"title"');
  });
});

describe('hub ops and actions', () => {
  it('should accept well-formed draft, brief-remove, and action ops', () => {
    const ops: ChangeOp[] = [
      { op: 'draft.update', chapter: 4, body: 'rewritten prose' },
      { op: 'brief.remove', chapter: 9 },
      { op: 'action.generate_chapter', chapter: 5 },
      { op: 'action.revise_draft', chapter: 4, note: 'tighten the pacing' },
      { op: 'action.validate', scope: 'chapter', chapter: 4 },
      { op: 'action.finalize', upTo: 3 },
    ];
    expect(validateChangeSet(ops)).toEqual([]);
  });

  it('should reject malformed hub ops', () => {
    expect(validateChangeSet([{ op: 'draft.update', chapter: 4 }])[0]).toMatch(/at least one of title, body, summary/);
    expect(validateChangeSet([{ op: 'action.generate_chapter', chapter: 0 }])[0]).toMatch(/chapter must be >= 1/);
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

  it('should accept an explicit null revealChapter as distinct from omitting it', () => {
    expect(validateChangeSet([{ op: 'fact.upsert', factKey: 'f1', revealChapter: null }])).toEqual([]);
    expect(validateChangeSet([{ op: 'fact.upsert', factKey: 'f1' }])).toEqual([]);
  });

  it('should reject malformed fact ops', () => {
    expect(validateChangeSet([{ op: 'fact.upsert' }])[0]).toMatch(/required field 'factKey'/);
    expect(validateChangeSet([{ op: 'fact.upsert', factKey: 'f1', terms: 'bastard' }])[0]).toMatch(/invalid field 'terms'/);
    expect(validateChangeSet([{ op: 'fact.upsert', factKey: 'f1', revealChapter: 0 }])[0]).toMatch(/revealChapter must be >= 1/);
    expect(validateChangeSet([{ op: 'fact.upsert', factKey: 'f1', revealChapter: 'soon' }])[0]).toMatch(/invalid field 'revealChapter' \(expected number\|null\)/);
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
    expect(rendered).toContain('"revealChapter": <number|null, optional>');
    expect(rendered).toContain('"pov": <non-empty array of entity keys>');
    expect(rendered).toContain('NEVER in bible prose');
    expect(rendered).toContain('the reveal schedule IS the plot');
    expect(rendered).toContain('pass null to undate the fact — an undated fact without an unlock stays hidden and no plan may reveal it');
    expect(renderOpVocabulary(['volume.upsert'])).not.toContain('knowledgeContract');
    expect(renderOpVocabulary(['brief.update'])).not.toContain('spoiler ledger');
  });
});

describe('the rationale every op may carry', () => {
  it('should accept a rationale on content ops, action ops, and scope-restricted ops alike', () => {
    const ops: ChangeOp[] = [
      { op: 'premise.update', premise: 'sharper', rationale: 'the pitch buried the hook' },
      { op: 'brief.update', chapter: 3, body: 'a brief', rationale: 'the chapter had no brief' },
      { op: 'action.generate_chapter', chapter: 2, rationale: 'the plan is ready' },
    ];
    expect(validateChangeSet(ops)).toEqual([]);
    expect(validateChangeSet([{ op: 'brief.update', chapter: 3, rationale: 'why' }], ['brief.update'])).toEqual([]);
  });

  it('should reject a rationale that is not a string', () => {
    expect(validateChangeSet([{ op: 'fact.remove', factKey: 'f1', rationale: 3 }])[0]).toMatch(/invalid field 'rationale'/);
  });

  it('should advertise the rationale field once for every op it renders', () => {
    const rendered = renderOpVocabulary(['fact.upsert', 'brief.update']);
    expect(rendered.match(/"rationale": <string, optional>/g)).toHaveLength(2);
    expect(rendered).toContain('never written into the story itself');
    expect(renderActionVocabulary(['action.audit_bible'])).toContain('"rationale": <string, optional>');
  });
});

describe('changeSetRefs', () => {
  it('should derive deduplicated artifact refs', () => {
    const refs = changeSetRefs([...validOps, { op: 'volume.remove', volumeKey: 'vol_1' }]);
    expect(refs).toEqual(['premise', 'doc:project/reader-promise', 'volume:vol_1', 'chapter:3']);
  });

  it('should map draft ops to draft: refs and actions to none', () => {
    const refs = changeSetRefs([
      { op: 'draft.update', chapter: 4, body: 'x' },
      { op: 'brief.remove', chapter: 9 },
      { op: 'action.generate_chapter', chapter: 5 },
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

describe('validateChangeSet draft containment', () => {
  it.each([
    ['isolated', { isolated: false }],
    ['generator', { generator: 'standard' }],
  ])('should refuse a draft.update that tries to set %s, which only the revert engine carries', (field, extra) => {
    expect(validateChangeSet([{ op: 'draft.update', chapter: 4, body: 'The ferry leaves.', ...extra }])).toContain(`changeSet[0]: unexpected field '${field}'`);
  });
});

describe('removed planning vocabulary', () => {
  it.each([
    [{ op: 'arc.upsert', arcKey: 'a1', volumeKey: 'v1' }],
    [{ op: 'arc.remove', arcKey: 'a1' }],
    [{ op: 'action.plan_volumes', volumeCount: 2, chaptersPerVolume: 10 }],
    [{ op: 'action.plan_arcs', volumeKey: 'v1' }],
    [{ op: 'action.outline_arc', arcKey: 'a1' }],
    [{ op: 'action.approve_volume_plan' }],
    [{ op: 'action.approve_arcs', volumeKey: 'v1' }],
    [{ op: 'action.generate_chapters', count: 2 }],
  ])('should refuse %o as an unknown op', op => {
    expect(validateChangeSet([op])[0]).toMatch(/unknown op/);
  });

  it.each(['conflict', 'payoff', 'targetChapterCount', 'cast', 'startChapter'])('should refuse a volume.upsert that sets %s, since a volume is only a goal', field => {
    expect(validateChangeSet([{ op: 'volume.upsert', volumeKey: 'v1', [field]: 1 }])).toContain(`changeSet[0]: unexpected field '${field}'`);
  });

  it('should refuse an arc key on a brief', () => {
    expect(validateChangeSet([{ op: 'brief.update', chapter: 3, arcKey: 'a1' }])).toContain("changeSet[0]: unexpected field 'arcKey'");
  });

  it('should keep a plugin from moving a brief to another volume', () => {
    expect(validatePluginChangeSet([{ op: 'brief.update', chapter: 3, volumeKey: 'v2' }])).toContain("changeSet[0]: field 'volumeKey' is not allowed for this scope");
    expect(validatePluginChangeSet([{ op: 'brief.update', chapter: 3, body: 'x' }])).toEqual([]);
  });
});
