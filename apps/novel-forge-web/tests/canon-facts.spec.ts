import { describe, expect, it } from 'bun:test';

import {
  backLabel,
  type CanonFact,
  countByState,
  factAttachments,
  factCaption,
  factState,
  filterFacts,
  initialSpoilerState,
  parseFactState,
  sortFactsByKey,
  spoilerToggleLabel,
} from '../src/lib/canon-facts';

function fact(overrides: Partial<CanonFact> & Pick<CanonFact, 'factKey'>): CanonFact {
  return { id: overrides.factKey, knowledge: [], ...overrides };
}

const ledger: CanonFact[] = [
  fact({ factKey: 'ledger_forgery', subjects: ['detective_amara', 'sergeant_boone'], terms: ['ledger', 'service corridor'] }),
  fact({ factKey: 'families_survived_me', subjects: ['house_velan'], knowledge: [{ entityKey: 'detective_amara' }] }),
  fact({ factKey: 'boone_took_the_bribe', terms: ['envelope'], knowledge: [{ entityKey: 'detective_amara' }, { entityKey: 'sergeant_boone' }] }),
];

describe('factState', () => {
  it('should read a fact nobody knows as hidden', () => {
    expect(factState(fact({ factKey: 'a' }))).toBe('hidden');
  });

  it('should read a fact with a ledger entry as revealed', () => {
    expect(factState(fact({ factKey: 'a', knowledge: [{ entityKey: 'amara' }] }))).toBe('revealed');
  });
});

describe('parseFactState', () => {
  it('should accept the two states the segmented control offers', () => {
    expect(parseFactState('hidden')).toBe('hidden');
    expect(parseFactState('revealed')).toBe('revealed');
  });

  it('should reject anything else, including the all pseudo-state', () => {
    expect(parseFactState('all')).toBeUndefined();
    expect(parseFactState(undefined)).toBeUndefined();
    expect(parseFactState(3)).toBeUndefined();
  });
});

describe('countByState', () => {
  it('should count both states, including the one with nothing in it', () => {
    expect(countByState(ledger)).toEqual({ hidden: 1, revealed: 2 });
    expect(countByState([])).toEqual({ hidden: 0, revealed: 0 });
  });
});

describe('sortFactsByKey', () => {
  it('should order by key without mutating its input', () => {
    const input = [...ledger];
    expect(sortFactsByKey(input).map(f => f.factKey)).toEqual(['boone_took_the_bribe', 'families_survived_me', 'ledger_forgery']);
    expect(input.map(f => f.factKey)).toEqual(['ledger_forgery', 'families_survived_me', 'boone_took_the_bribe']);
  });
});

describe('filterFacts', () => {
  it('should return everything for the all category and an empty query', () => {
    expect(filterFacts(ledger, 'all', '')).toHaveLength(3);
    expect(filterFacts(ledger, 'all', '   ')).toHaveLength(3);
  });

  it('should narrow to one state', () => {
    expect(filterFacts(ledger, 'hidden', '').map(f => f.factKey)).toEqual(['ledger_forgery']);
    expect(filterFacts(ledger, 'revealed', '')).toHaveLength(2);
  });

  it('should match on the key, a subject or a leak-scan term', () => {
    expect(filterFacts(ledger, 'all', 'survived').map(f => f.factKey)).toEqual(['families_survived_me']);
    expect(filterFacts(ledger, 'all', 'house_velan').map(f => f.factKey)).toEqual(['families_survived_me']);
    expect(filterFacts(ledger, 'all', 'service corridor').map(f => f.factKey)).toEqual(['ledger_forgery']);
  });

  it('should ignore a fact whose only match would be its truth text', () => {
    const secret = fact({ factKey: 'quiet_key', subjects: [], terms: [] });
    expect(filterFacts([secret, ...ledger], 'all', 'bribe').map(f => f.factKey)).toEqual(['boone_took_the_bribe']);
  });

  it('should combine the state and the query', () => {
    expect(filterFacts(ledger, 'revealed', 'ledger')).toEqual([]);
  });
});

describe('factCaption', () => {
  it('should read hidden when no character knows it', () => {
    expect(factCaption(fact({ factKey: 'a' }))).toBe('hidden');
  });

  it('should count the characters who know it, singular and plural', () => {
    expect(factCaption(fact({ factKey: 'a', knowledge: [{ entityKey: 'amara' }] }))).toBe('revealed to 1 character');
    expect(factCaption(fact({ factKey: 'a', knowledge: [{ entityKey: 'amara' }, { entityKey: 'boone' }] }))).toBe('revealed to 2 characters');
  });
});

describe('backLabel', () => {
  it('should name the collection size, singular and plural', () => {
    expect(backLabel(7)).toBe('All 7 facts');
    expect(backLabel(1)).toBe('All 1 fact');
    expect(backLabel(0)).toBe('All 0 facts');
  });

  it('should drop the count while the collection has not resolved', () => {
    expect(backLabel(undefined)).toBe('All facts');
  });
});

describe('factAttachments', () => {
  const names = new Map([['detective_amara', 'Detective Amara']]);

  it('should resolve a subject that is still in the bible', () => {
    expect(factAttachments({ subjects: ['detective_amara'] }, names)).toEqual([{ kind: 'linked', entityKey: 'detective_amara', name: 'Detective Amara' }]);
  });

  it('should mark a subject whose entity has been deleted rather than dropping it', () => {
    expect(factAttachments({ subjects: ['ghost_key'] }, names)).toEqual([{ kind: 'missing', entityKey: 'ghost_key' }]);
  });

  it('should return nothing for a fact with no subjects', () => {
    expect(factAttachments({ subjects: null }, names)).toEqual([]);
    expect(factAttachments({}, names)).toEqual([]);
  });
});

describe('initialSpoilerState', () => {
  it('should conceal a hidden fact and open a revealed one', () => {
    expect(initialSpoilerState('hidden')).toBe('concealed');
    expect(initialSpoilerState('revealed')).toBe('shown');
  });
});

describe('spoilerToggleLabel', () => {
  it('should name the fact the control acts on', () => {
    expect(spoilerToggleLabel('concealed', 'families_survived_me')).toBe('Reveal the judge-only truth of families_survived_me');
    expect(spoilerToggleLabel('shown', 'families_survived_me')).toBe('Hide the judge-only truth of families_survived_me');
  });
});
