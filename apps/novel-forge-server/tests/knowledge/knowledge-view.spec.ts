import { describe, expect, it } from 'bun:test';

import {
  type FactLike,
  parseKnowledgeContract,
  renderChapterReveals,
  renderForbiddenFacts,
  renderHiddenConstraints,
  renderKnownFacts,
  scanKnowledgeLeaks,
  scrubForWriter,
  splitKnowledgeView,
} from '@modules/bible/fact/knowledge-view';

const facts: FactLike[] = [
  {
    factKey: 'ledger_forgery',
    text: 'The ledger in the study is a forgery planted by Elias.',
    constraintNote: 'Protects the forged-ledger reveal in the study.',
    writerNote: 'Elias steers conversation away from the study.',
    terms: ['forgery', 'planted'],
  },
  { factKey: 'service_door', text: 'The killer entered through the unlocked service door.', constraintNote: null, terms: ['service door'] },
  {
    factKey: 'motive_debt',
    text: 'Marlow owed Elias a ruinous gambling debt.',
    constraintNote: 'The debt is the motive.',
    writerNote: 'Elias flinches when gambling is mentioned.',
    terms: [],
  },
  { factKey: 'secret_twin', text: 'Elias has a twin.', constraintNote: 'Hides the twin until the finale.', writerNote: '   ', terms: ['twin'] },
];

const [ledgerFact, doorFact] = facts as [FactLike, FactLike, FactLike, FactLike];

describe('parseKnowledgeContract', () => {
  it('should return null for missing, non-object, or POV-less contracts', () => {
    expect(parseKnowledgeContract(null)).toBeNull();
    expect(parseKnowledgeContract('pov')).toBeNull();
    expect(parseKnowledgeContract({})).toBeNull();
    expect(parseKnowledgeContract({ pov: [] })).toBeNull();
    expect(parseKnowledgeContract({ pov: [42, ''] })).toBeNull();
  });

  it('should keep string POV keys and well-formed learns entries only', () => {
    const contract = parseKnowledgeContract({ pov: ['amara', 7, 'boone'], learns: [{ entityKey: 'amara', factKey: 'ledger_forgery' }, { entityKey: 'amara' }, 'junk'] });
    expect(contract).toEqual({ pov: ['amara', 'boone'], learns: [{ entityKey: 'amara', factKey: 'ledger_forgery' }] });
  });

  it('should default learns to an empty array', () => {
    expect(parseKnowledgeContract({ pov: ['amara'] })).toEqual({ pov: ['amara'], learns: [] });
  });
});

describe('splitKnowledgeView', () => {
  it('should partition facts into known, reveals, and hidden', () => {
    const view = splitKnowledgeView(facts, new Set(['ledger_forgery']), new Set(['service_door']));
    expect(view.known.map(f => f.factKey)).toEqual(['ledger_forgery']);
    expect(view.reveals.map(f => f.factKey)).toEqual(['service_door']);
    expect(view.hidden.map(f => f.factKey)).toEqual(['motive_debt', 'secret_twin']);
  });

  it('should treat an already-known fact as known even when the brief re-declares it as a reveal', () => {
    const view = splitKnowledgeView(facts, new Set(['ledger_forgery']), new Set(['ledger_forgery']));
    expect(view.known.map(f => f.factKey)).toEqual(['ledger_forgery']);
    expect(view.reveals).toEqual([]);
  });
});

describe('knowledge renderers', () => {
  it('should render an explicit placeholder when nothing is known', () => {
    expect(renderKnownFacts([])).toContain('(none established');
  });

  it('should render known facts, reveals, and forbidden facts as key-tagged lines', () => {
    expect(renderKnownFacts([ledgerFact])).toBe('- [ledger_forgery] The ledger in the study is a forgery planted by Elias.');
    expect(renderChapterReveals([doorFact])).toBe('- [service_door] The killer entered through the unlocked service door.');
    expect(renderForbiddenFacts(facts).split('\n')).toHaveLength(4);
  });

  it('should render only writer notes, never the fact key, text or author note', () => {
    const rendered = renderHiddenConstraints(facts);
    expect(rendered).toBe('- Elias steers conversation away from the study.\n- Elias flinches when gambling is mentioned.');
    expect(rendered).not.toContain('forgery');
    expect(rendered).not.toContain('ledger_forgery');
    expect(rendered).not.toContain('Protects the forged-ledger reveal');
  });

  it('should withhold a hidden fact whose writer note is missing or blank', () => {
    expect(renderHiddenConstraints([doorFact])).toBe('');
    expect(renderHiddenConstraints(facts)).not.toContain('twin');
  });
});

describe('scrubForWriter', () => {
  it('should replace leak findings with writer-safe lines and withhold every secret mention', () => {
    const note = [
      '[soft] knowledge leak: "forgery" exposes [ledger_forgery] — …a forgery…',
      '[soft] brief: the study scene is skipped',
      'Keep ledger_forgery quiet: The ledger in the study is a forgery planted by Elias. (Protects the forged-ledger reveal in the study.)',
    ].join('\n');
    const scrubbed = scrubForWriter(note, [ledgerFact]);
    expect(scrubbed).toBe(
      [
        '[soft] brief: the study scene is skipped',
        'Keep [withheld] quiet: [withheld] ([withheld])',
        '- remove or avoid "forgery" — Elias steers conversation away from the study.',
      ].join('\n'),
    );
  });

  it('should withhold a short key only as a whole word', () => {
    const heir: FactLike = { factKey: 'heir', text: 'Mara is the lost heir of the tide court.', writerNote: null };
    expect(scrubForWriter('Keep their plan, but never name the heir or fact:heir. During the storm, bring the Heir back.', [heir])).toBe(
      'Keep their plan, but never name the [withheld] or [withheld]. During the storm, bring the [withheld] back.',
    );
  });

  it('should leave text alone when nothing is forbidden', () => {
    expect(scrubForWriter('knowledge leak: anything', [])).toBe('knowledge leak: anything');
  });

  it('should be stable when run twice', () => {
    const once = scrubForWriter('[soft] knowledge leak: [motive_debt] acts on the debt', facts);
    expect(scrubForWriter(once, facts)).toBe(once);
  });
});

describe('scanKnowledgeLeaks', () => {
  it('should find a hidden term case-insensitively on word boundaries with an excerpt', () => {
    const issues = scanKnowledgeLeaks('She stared at the page. A Forgery, she realized.', [ledgerFact]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ factKey: 'ledger_forgery', term: 'forgery' });
    expect(issues[0]?.excerpt).toContain('Forgery');
  });

  it('should not match inside larger words', () => {
    expect(scanKnowledgeLeaks('The forgeryproof seal held.', [ledgerFact])).toEqual([]);
  });

  it('should report at most one issue per fact and skip facts without usable terms', () => {
    const issues = scanKnowledgeLeaks('The forgery was planted near the service door, settling the debt.', facts);
    expect(issues.map(i => i.factKey)).toEqual(['ledger_forgery', 'service_door']);
  });

  it('should skip terms shorter than three characters', () => {
    expect(scanKnowledgeLeaks('an ax at dawn', [{ factKey: 'weapon', text: 'x', terms: ['ax'] }])).toEqual([]);
  });
});
