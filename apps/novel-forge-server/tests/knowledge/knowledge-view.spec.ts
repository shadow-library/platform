import { describe, expect, it } from 'bun:test';

import {
  type FactLike,
  parseKnowledgeContract,
  renderChapterReveals,
  renderForbiddenFacts,
  renderHiddenConstraints,
  renderKnownFacts,
  scanKnowledgeLeaks,
  splitKnowledgeView,
} from '@modules/bible/fact/knowledge-view';

const facts: FactLike[] = [
  {
    factKey: 'ledger_forgery',
    text: 'The ledger in the study is a forgery planted by Elias.',
    constraintNote: 'Elias steers conversation away from the study.',
    terms: ['forgery', 'planted'],
  },
  { factKey: 'service_door', text: 'The killer entered through the unlocked service door.', constraintNote: null, terms: ['service door'] },
  { factKey: 'motive_debt', text: 'Marlow owed Elias a ruinous gambling debt.', constraintNote: 'Elias flinches when gambling is mentioned.', terms: [] },
];

const [ledgerFact, doorFact] = facts as [FactLike, FactLike, FactLike];

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
    expect(view.hidden.map(f => f.factKey)).toEqual(['motive_debt']);
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
    expect(renderForbiddenFacts(facts).split('\n')).toHaveLength(3);
  });

  it('should render hidden constraints without ever leaking the fact key or text', () => {
    const rendered = renderHiddenConstraints(facts);
    expect(rendered).toBe('- Elias steers conversation away from the study.\n- Elias flinches when gambling is mentioned.');
    expect(rendered).not.toContain('forgery');
    expect(rendered).not.toContain('ledger_forgery');
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
