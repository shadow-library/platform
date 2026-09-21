import { describe, expect, it } from 'bun:test';

import { type EntityType } from '../src/lib/apis/api-types.gen';
import {
  backLabel,
  type BibleEntity,
  type BibleFact,
  countByType,
  entityCaption,
  filterEntities,
  groupByType,
  orderTypesByCount,
  parseBibleView,
  parseEntityType,
  relatedEntities,
  sectionSlice,
  stripEntityHeading,
  subjectFacts,
} from '../src/lib/story-bible';

function entity(overrides: Partial<BibleEntity> & Pick<BibleEntity, 'entityKey'>): BibleEntity {
  return { id: overrides.entityKey, name: overrides.entityKey, type: 'character', ...overrides };
}

function fact(factKey: string, subjects: string[], knowledge: string[] = []): BibleFact {
  return { factKey, text: factKey, subjects, knowledge: knowledge.map(entityKey => ({ entityKey })) };
}

const cast: BibleEntity[] = [
  entity({ entityKey: 'amara', name: 'Detective Amara', significance: 'major', status: 'alive' }),
  entity({ entityKey: 'boone', name: 'Sergeant Boone' }),
  entity({ entityKey: 'velan', name: 'House Velan', type: 'faction' }),
  entity({ entityKey: 'tideglass', name: 'Tideglass', type: 'item' }),
  entity({ entityKey: 'debt', name: 'The Debt', type: 'concept' }),
  entity({ entityKey: 'ledger', name: 'The Ledger', type: 'concept' }),
];

describe('parseEntityType', () => {
  it('should accept a known type', () => {
    expect(parseEntityType('power_rule')).toBe('power_rule');
  });

  it('should reject anything the API does not define', () => {
    expect(parseEntityType('villain')).toBeUndefined();
    expect(parseEntityType(undefined)).toBeUndefined();
    expect(parseEntityType(7)).toBeUndefined();
  });
});

describe('orderTypesByCount', () => {
  it('should put the busiest type first', () => {
    expect(orderTypesByCount(countByType(cast))).toEqual(['character', 'concept', 'faction', 'item']);
  });

  it('should break ties with the canonical order', () => {
    const counts = new Map<EntityType, number>([
      ['location', 1],
      ['item', 1],
      ['power_rule', 1],
    ]);
    expect(orderTypesByCount(counts)).toEqual(['location', 'power_rule', 'item']);
  });

  it('should keep an emptied type that is still the active filter', () => {
    expect(orderTypesByCount(countByType(cast), 'location')).toContain('location');
  });

  it('should drop a type with no entities', () => {
    expect(orderTypesByCount(countByType(cast))).not.toContain('location');
  });
});

describe('filterEntities', () => {
  it('should narrow to one type', () => {
    expect(filterEntities(cast, 'concept', '').map(e => e.entityKey)).toEqual(['debt', 'ledger']);
  });

  it('should match a name case-insensitively', () => {
    expect(filterEntities(cast, 'all', 'AMARA').map(e => e.entityKey)).toEqual(['amara']);
  });

  it('should match the key and the status as well as the name', () => {
    expect(filterEntities(cast, 'all', 'boone').map(e => e.entityKey)).toEqual(['boone']);
    expect(filterEntities(cast, 'all', 'alive').map(e => e.entityKey)).toEqual(['amara']);
  });

  it('should compose the type filter with the text filter', () => {
    expect(filterEntities(cast, 'concept', 'amara')).toEqual([]);
  });

  it('should keep everything for a blank query', () => {
    expect(filterEntities(cast, 'all', '   ')).toHaveLength(cast.length);
  });
});

describe('groupByType', () => {
  it('should group in the order it was given and drop empty groups', () => {
    const sections = groupByType(cast, ['faction', 'location', 'character']);
    expect(sections.map(s => s.type)).toEqual(['faction', 'character']);
    expect(sections[1]?.items.map(e => e.entityKey)).toEqual(['amara', 'boone']);
  });
});

describe('sectionSlice', () => {
  it('should cap an unexpanded section at the preview size', () => {
    const many = Array.from({ length: 12 }, (_, i) => entity({ entityKey: `e${i}` }));
    expect(sectionSlice(many, false)).toHaveLength(8);
  });

  it('should show everything once the section is the only one on screen', () => {
    const many = Array.from({ length: 12 }, (_, i) => entity({ entityKey: `e${i}` }));
    expect(sectionSlice(many, true)).toHaveLength(12);
  });
});

describe('entityCaption', () => {
  it('should read as type then importance', () => {
    expect(entityCaption(cast[0] as BibleEntity)).toBe('Character · major');
  });

  it('should default an unset importance to minor', () => {
    expect(entityCaption(cast[1] as BibleEntity)).toBe('Character · minor');
  });
});

describe('backLabel', () => {
  it('should name the count the directory will show', () => {
    expect(backLabel(39)).toBe('All 39 entities');
  });

  it('should singularise one entity', () => {
    expect(backLabel(1)).toBe('All 1 entity');
  });

  it('should omit a count the collection query has not resolved', () => {
    expect(backLabel(undefined)).toBe('All entities');
  });
});

describe('stripEntityHeading', () => {
  it('should drop a leading heading that only repeats the name', () => {
    expect(stripEntityHeading('# Detective Amara\n\nShe keeps the ledger.', 'Detective Amara')).toBe('She keeps the ledger.');
  });

  it('should keep a heading that says something else', () => {
    expect(stripEntityHeading('# Background\n\nShe keeps the ledger.', 'Detective Amara')).toBe('# Background\n\nShe keeps the ledger.');
  });

  it('should ignore emphasis around the name', () => {
    expect(stripEntityHeading('## *Detective Amara*\nShe keeps the ledger.', 'detective amara')).toBe('She keeps the ledger.');
  });
});

describe('subjectFacts', () => {
  const facts = [fact('oath', ['amara', 'boone']), fact('debt-owed', ['velan']), fact('tideglass-price', ['tideglass'], ['amara'])];

  it('should collect the facts the entity is a subject of', () => {
    expect(subjectFacts(facts, 'boone').map(f => f.factKey)).toEqual(['oath']);
  });

  it('should not count merely being told a fact as a subject', () => {
    expect(subjectFacts(facts, 'amara').map(f => f.factKey)).toEqual(['oath']);
  });

  it('should return nothing for an entity no fact names as a subject', () => {
    expect(subjectFacts(facts, 'ledger')).toEqual([]);
    expect(subjectFacts(facts, 'tideglass').map(f => f.factKey)).toEqual(['tideglass-price']);
  });
});

describe('parseBibleView', () => {
  it('should accept the two views Story Bible offers', () => {
    expect(parseBibleView('entities')).toBe('entities');
    expect(parseBibleView('facts')).toBe('facts');
  });

  it('should reject anything else', () => {
    expect(parseBibleView(undefined)).toBeUndefined();
    expect(parseBibleView('all')).toBeUndefined();
    expect(parseBibleView(3)).toBeUndefined();
  });
});

describe('relatedEntities', () => {
  const facts = [fact('oath', ['amara', 'boone']), fact('siege', ['amara', 'boone', 'velan']), fact('price', ['tideglass'], ['amara'])];

  it('should rank co-subjects by the number of facts they share', () => {
    expect(relatedEntities(facts, 'amara')).toEqual([
      { entityKey: 'boone', shared: 2 },
      { entityKey: 'velan', shared: 1 },
    ]);
  });

  it('should not treat knowing a fact as a relationship', () => {
    expect(relatedEntities(facts, 'amara').map(r => r.entityKey)).not.toContain('tideglass');
  });

  it('should never relate an entity to itself', () => {
    expect(relatedEntities(facts, 'velan').map(r => r.entityKey)).toEqual(['amara', 'boone']);
  });
});
