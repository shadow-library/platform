import { describe, expect, it } from 'bun:test';

import {
  groupSecrets,
  isSecret,
  knownFactsAbout,
  revealTimeline,
  secretCountLabel,
  secretCountsBySubject,
  secretRevealLabel,
  secretsAbout,
  secretTitle,
  sortSecrets,
  subjectsLabel,
  timelinePosition,
} from '../src/lib/bible-secrets';
import { type CanonFact } from '../src/lib/canon-facts';

function fact(overrides: Partial<CanonFact> & Pick<CanonFact, 'factKey'>): CanonFact {
  return { id: overrides.factKey, knowledge: [], ...overrides };
}

const ledger: CanonFact[] = [
  fact({ factKey: 'forged_ledger', subjects: ['amara', 'boone'], revealChapter: 40 }),
  fact({ factKey: 'boone_owes_velan', subjects: ['boone', 'velan'], revealChapter: 12 }),
  fact({ factKey: 'the_tide_remembers', subjects: ['velan'] }),
  fact({ factKey: 'amara_was_a_thief', subjects: ['amara'], knowledge: [{ entityKey: 'boone', learnedInChapter: 7 }] }),
  fact({ factKey: 'also_ch_12', subjects: ['amara'], revealChapter: 12 }),
];

describe('isSecret', () => {
  it('should hold a fact secret until the ledger records someone learning it', () => {
    expect(isSecret(fact({ factKey: 'a', revealChapter: 3 }))).toBe(true);
    expect(isSecret(fact({ factKey: 'a', knowledge: [{ entityKey: 'amara' }] }))).toBe(false);
  });
});

describe('secretsAbout', () => {
  it('should keep only unrevealed facts naming the record as a subject, soonest reveal first', () => {
    expect(secretsAbout(ledger, 'amara').map(item => item.factKey)).toEqual(['also_ch_12', 'forged_ledger']);
  });

  it('should not count merely learning a fact as being its subject', () => {
    expect(secretsAbout(ledger, 'boone').map(item => item.factKey)).toEqual(['boone_owes_velan', 'forged_ledger']);
  });
});

describe('knownFactsAbout', () => {
  it('should keep only the revealed facts about the record', () => {
    expect(knownFactsAbout(ledger, 'amara').map(item => item.factKey)).toEqual(['amara_was_a_thief']);
    expect(knownFactsAbout(ledger, 'velan')).toEqual([]);
  });
});

describe('secretCountsBySubject', () => {
  it('should count each secret once per subject and skip revealed facts', () => {
    expect(Object.fromEntries(secretCountsBySubject(ledger))).toEqual({ amara: 2, boone: 2, velan: 2 });
  });

  it('should not double count a subject listed twice', () => {
    expect(secretCountsBySubject([fact({ factKey: 'x', subjects: ['amara', 'amara'] })]).get('amara')).toBe(1);
  });
});

describe('sortSecrets and groupSecrets', () => {
  it('should order by reveal chapter, tie-break by key, and put unplanned last', () => {
    expect(sortSecrets(ledger).map(item => item.factKey)).toEqual(['also_ch_12', 'boone_owes_velan', 'forged_ledger', 'amara_was_a_thief', 'the_tide_remembers']);
  });

  it('should split secrets into planned and unplanned and drop revealed facts', () => {
    const groups = groupSecrets(ledger);
    expect(groups.planned.map(item => item.factKey)).toEqual(['also_ch_12', 'boone_owes_velan', 'forged_ledger']);
    expect(groups.unplanned.map(item => item.factKey)).toEqual(['the_tide_remembers']);
  });
});

describe('secretTitle', () => {
  it('should read a key as a sentence', () => {
    expect(secretTitle('boone_owes-velan')).toBe('Boone owes velan');
    expect(secretTitle('ledger.forgery')).toBe('Ledger forgery');
  });

  it('should keep a key with no words as it is', () => {
    expect(secretTitle('__')).toBe('__');
  });
});

describe('secretRevealLabel', () => {
  it('should say when a planned secret opens, that an unplanned one never does, and when a known fact was learned', () => {
    expect(secretRevealLabel(fact({ factKey: 'a', revealChapter: 42 }))).toBe('Hidden until ch 42');
    expect(secretRevealLabel(fact({ factKey: 'a' }))).toBe('Never revealed');
    expect(secretRevealLabel(fact({ factKey: 'a', knowledge: [{ entityKey: 'b', learnedInChapter: 9 }] }))).toBe('Known since ch 9');
  });
});

describe('secretCountLabel', () => {
  it('should use the singular for exactly one and the plural otherwise', () => {
    expect(secretCountLabel(1)).toBe('1 secret');
    expect(secretCountLabel(3)).toBe('3 secrets');
  });
});

describe('subjectsLabel', () => {
  it('should name up to two records and count the rest', () => {
    expect(subjectsLabel(['Amara'])).toBe('On Amara');
    expect(subjectsLabel(['Amara', 'Boone'])).toBe('On Amara, Boone');
    expect(subjectsLabel(['Amara', 'Boone', 'Velan', 'Tideglass'])).toBe('On Amara, Boone + 2 more');
  });

  it('should say when a secret sits on no record', () => {
    expect(subjectsLabel([])).toBe('On no record yet');
  });
});

describe('timelinePosition', () => {
  it('should place chapter 1 at the start and the last reveal at the end', () => {
    expect(timelinePosition(1, 41)).toBe(0);
    expect(timelinePosition(21, 41)).toBe(50);
    expect(timelinePosition(41, 41)).toBe(100);
  });

  it('should clamp chapters outside the strip', () => {
    expect(timelinePosition(0, 10)).toBe(0);
    expect(timelinePosition(99, 10)).toBe(100);
  });

  it('should put everything at the start when the only reveal is chapter 1', () => {
    expect(timelinePosition(1, 1)).toBe(0);
  });
});

describe('revealTimeline', () => {
  it('should make one mark per planned chapter, shared by secrets revealed together', () => {
    const timeline = revealTimeline(ledger);
    expect(timeline.last).toBe(40);
    expect(timeline.marks.map(mark => [mark.chapter, mark.factKeys])).toEqual([
      [12, ['also_ch_12', 'boone_owes_velan']],
      [40, ['forged_ledger']],
    ]);
    expect(timeline.marks[1]?.position).toBe(100);
  });

  it('should leave out revealed and unplanned facts', () => {
    expect(revealTimeline([fact({ factKey: 'a' }), fact({ factKey: 'b', revealChapter: 3, knowledge: [{ entityKey: 'x' }] })])).toEqual({ last: 1, marks: [] });
  });
});
