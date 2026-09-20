import { describe, expect, it } from 'bun:test';

import { type OpType, validateChangeSet } from '@modules/refinement/change-set';

const POWER_DOC = { op: 'bible_document.upsert', section: 'power', slug: 'supers-and-rifts', body: 'Awakening creates an internal Core. Ranks run F through S.' };
const POWER_RULE = { op: 'entity.upsert', entityKey: 'rank_ladder', type: 'power_rule', name: 'Rank ladder' };

describe('validateChangeSet entity materialization', () => {
  it('should reject a power document written as prose with no records', () => {
    const errors = validateChangeSet([POWER_DOC]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("bible_document.upsert into 'power/supers-and-rifts'");
    expect(errors[0]).toContain('entity.upsert op(s) of type power_rule or concept');
  });

  it('should accept the same document once its records accompany it', () => {
    expect(validateChangeSet([POWER_DOC, POWER_RULE])).toEqual([]);
  });

  it('should accept any of the section’s declared types, not only the first', () => {
    const concept = { op: 'entity.upsert', entityKey: 'aether', type: 'concept', name: 'Aether' };
    expect(validateChangeSet([POWER_DOC, concept])).toEqual([]);
  });

  it('should hold a manifest chapter to its own declared types', () => {
    const cast = { op: 'bible_document.upsert', section: 'project', slug: 'cast', body: 'Kael leads. Mira follows.' };
    const errors = validateChangeSet([cast]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('entity.upsert op(s) of type character');
  });

  it('should leave a chapter that materializes nothing alone', () => {
    const premise = { op: 'bible_document.upsert', section: 'project', slug: 'premise', body: 'A rift opens over Eden.' };
    expect(validateChangeSet([premise])).toEqual([]);
  });

  it('should leave an undeclared slug in a mixed section alone', () => {
    const readerPromise = { op: 'bible_document.upsert', section: 'project', slug: 'reader-promise', body: 'A fight every chapter, a rank every arc.' };
    expect(validateChangeSet([readerPromise])).toEqual([]);
  });

  it('should leave a plot document alone, since escalation structure is not a record', () => {
    const plot = { op: 'bible_document.upsert', section: 'plot', slug: 'escalation-map', body: 'Volume one raises the siege.' };
    expect(validateChangeSet([plot])).toEqual([]);
  });

  it('should exempt a frontmatter-only edit that establishes no prose canon', () => {
    const metadataOnly = { op: 'bible_document.upsert', section: 'power', slug: 'system-and-limits', frontmatter: { status: 'draft' } };
    expect(validateChangeSet([metadataOnly])).toEqual([]);
  });

  it('should exempt an upsert whose body is only whitespace', () => {
    const blank = { op: 'bible_document.upsert', section: 'power', slug: 'system-and-limits', body: '   ' };
    expect(validateChangeSet([blank])).toEqual([]);
  });

  it('should stay silent for a scope whose vocabulary cannot express entity.upsert', () => {
    const premiseScope: OpType[] = ['premise.update', 'bible_document.upsert'];
    expect(validateChangeSet([POWER_DOC], premiseScope)).toEqual([]);
  });

  it('should still enforce when the scope does allow entity.upsert', () => {
    const projectScope: OpType[] = ['bible_document.upsert', 'entity.upsert'];
    expect(validateChangeSet([POWER_DOC], projectScope)).toHaveLength(1);
  });

  it('should report the structural error first and not stack the materialization error on top', () => {
    const malformed = [{ op: 'bible_document.upsert', section: 'power', slug: 'x', body: 'prose', unexpected: 1 }];
    const errors = validateChangeSet(malformed);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("unexpected field 'unexpected'");
  });
});
