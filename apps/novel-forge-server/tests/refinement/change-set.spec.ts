/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { type ChangeOp, changeSetRefs, validateChangeSet } from '@modules/refinement';

/**
 * Declaring the constants
 */

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
});

describe('changeSetRefs', () => {
  it('should derive deduplicated artifact refs', () => {
    const refs = changeSetRefs([...validOps, { op: 'volume.remove', volumeKey: 'vol_1' }]);
    expect(refs).toEqual(['premise', 'doc:project/reader-promise', 'volume:vol_1', 'arc:vol_1_arc_1', 'chapter:3']);
  });
});
