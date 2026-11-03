import { describe, expect, it } from 'bun:test';

import { illustrationRequestOf } from '@modules/generation/run-inspection.service';

describe('illustrationRequestOf', () => {
  it("should return the author's request from a run that started an illustration", () => {
    const input = {
      subjectType: 'entity',
      subjectKey: 'wren',
      instructions: ['cold light'],
      references: [{ source: 'portrait', sourceId: 'wren', role: 'likeness' }],
      autoReferences: false,
      depictsChapter: 3,
    };

    expect(illustrationRequestOf({ graph: 'illustration', input })).toEqual(input as never);
  });

  it('should fill what an older run did not record', () => {
    expect(illustrationRequestOf({ graph: 'illustration', input: { subjectType: 'cover' } })).toEqual({
      subjectType: 'cover',
      subjectKey: null,
      instructions: [],
      references: [],
      autoReferences: true,
      depictsChapter: null,
    });
  });

  it('should not answer for a refine run, whose input is its edit', () => {
    expect(illustrationRequestOf({ graph: 'illustration', input: { edit: { add: 'more fog' } } })).toBeUndefined();
  });

  it('should keep the input of every other graph private', () => {
    expect(illustrationRequestOf({ graph: 'chat-turn', input: { subjectType: 'entity' } })).toBeUndefined();
  });

  it('should not answer for a run with no input', () => {
    expect(illustrationRequestOf({ graph: 'illustration', input: null })).toBeUndefined();
  });
});
