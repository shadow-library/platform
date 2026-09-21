import { describe, expect, it } from 'bun:test';

import {
  type CanonFact,
  emptyFactForm,
  factAttachments,
  factFormFromFact,
  factHiddenFromWriter,
  factReveal,
  factState,
  filterFacts,
  listToText,
  parseChapter,
  textToList,
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

describe('factReveal', () => {
  it('should read a hidden fact with no planned chapter as unscheduled', () => {
    expect(factReveal(fact({ factKey: 'a' }))).toEqual({ kind: 'unscheduled' });
  });

  it('should read a hidden fact with a planned chapter as planned — the field is an authoring aid, not truth', () => {
    expect(factReveal(fact({ factKey: 'a', revealChapter: 12 }))).toEqual({ kind: 'planned', chapter: 12 });
  });

  it('should read a revealed fact by the earliest chapter it was actually learned in', () => {
    const revealed = fact({
      factKey: 'a',
      revealChapter: 12,
      knowledge: [
        { entityKey: 'amara', learnedInChapter: 9 },
        { entityKey: 'boone', learnedInChapter: 5 },
      ],
    });
    expect(factReveal(revealed)).toEqual({ kind: 'revealed', chapter: 5 });
  });
});

describe('factHiddenFromWriter', () => {
  it('should mark a hidden fact with no writer note', () => {
    expect(factHiddenFromWriter(fact({ factKey: 'a', writerNote: null }))).toBe(true);
    expect(factHiddenFromWriter(fact({ factKey: 'a', writerNote: '   ' }))).toBe(true);
  });

  it('should not mark a hidden fact that has a writer note', () => {
    expect(factHiddenFromWriter(fact({ factKey: 'a', writerNote: 'Elias deflects questions about Tuesday night.' }))).toBe(false);
  });

  it('should never mark a revealed fact, even without a writer note', () => {
    expect(factHiddenFromWriter(fact({ factKey: 'a', writerNote: null, knowledge: [{ entityKey: 'amara' }] }))).toBe(false);
  });
});

describe('listToText', () => {
  it('should join values with a comma and space', () => {
    expect(listToText(['ledger', 'service corridor'])).toBe('ledger, service corridor');
  });

  it('should read a missing or empty list as an empty string', () => {
    expect(listToText(null)).toBe('');
    expect(listToText(undefined)).toBe('');
    expect(listToText([])).toBe('');
  });
});

describe('textToList', () => {
  it('should split, trim and drop blanks', () => {
    expect(textToList('ledger,  service corridor ,,')).toEqual(['ledger', 'service corridor']);
  });

  it('should read a blank string as unset rather than an empty list', () => {
    expect(textToList('   ')).toBeUndefined();
    expect(textToList('')).toBeUndefined();
  });
});

describe('emptyFactForm', () => {
  it('should start every field blank', () => {
    expect(emptyFactForm()).toEqual({ factKey: '', text: '', subjects: '', constraintNote: '', writerNote: '', terms: '', revealChapter: '' });
  });
});

describe('factFormFromFact', () => {
  it('should flatten a fact into editable text fields', () => {
    const response = {
      id: 'f1',
      projectId: 'p1',
      factKey: 'ledger_forgery',
      text: 'Boone forged the ledger.',
      subjects: ['detective_amara', 'sergeant_boone'],
      constraintNote: 'Never confirm before ch. 20',
      writerNote: null,
      terms: ['ledger', 'service corridor'],
      revealChapter: 20,
      knowledge: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    expect(factFormFromFact(response)).toEqual({
      factKey: 'ledger_forgery',
      text: 'Boone forged the ledger.',
      subjects: 'detective_amara, sergeant_boone',
      constraintNote: 'Never confirm before ch. 20',
      writerNote: '',
      terms: 'ledger, service corridor',
      revealChapter: '20',
    });
  });
});

describe('parseChapter', () => {
  it('should read a whole chapter number from 1', () => {
    expect(parseChapter('12')).toBe(12);
    expect(parseChapter(' 3 ')).toBe(3);
  });

  it('should reject blanks, zero, fractions and anything else', () => {
    expect(parseChapter('')).toBeUndefined();
    expect(parseChapter('0')).toBeUndefined();
    expect(parseChapter('2.5')).toBeUndefined();
    expect(parseChapter('-4')).toBeUndefined();
    expect(parseChapter('ch 4')).toBeUndefined();
  });
});
