import { describe, expect, it } from 'bun:test';

import { assertTeacherSettled, untilFirstTeacher } from '@server/common';

import { planTables } from '../knowledge/plan-tables';
import { draftRow, fakeGenerationDb, knowledgeFixture, makeGenerationService } from './generation-fixtures';

const TEACHES = { pov: ['mira'], learns: [{ entityKey: 'mira', factKey: 'lamp_rank_4_rule' }] };

function project(teacher: Record<string, unknown>, draft?: Record<string, unknown>, finalized = false) {
  return planTables({
    briefs: [{ chapter: 5, ...teacher }, { chapter: 6 }],
    drafts: draft ? [{ chapter: 5, ...draft }] : [],
    chapters: finalized ? [{ number: 5 }] : [],
  });
}

describe('assertTeacherSettled', () => {
  it('should refuse an AI draft of the next chapter while a chapter that teaches something awaits approval', async () => {
    const tables = project({ knowledgeContract: TEACHES }, { reviewStatus: 'needs_review' });

    await expect(assertTeacherSettled(tables.db as never, 7n, 6)).rejects.toMatchObject({ code: 'DRF_016' });
  });

  it('should keep refusing past a hand-written chapter while an earlier lesson is still unapproved', async () => {
    const tables = planTables({
      briefs: [{ chapter: 4, knowledgeContract: TEACHES }, { chapter: 5 }, { chapter: 6 }],
      drafts: [
        { chapter: 4, reviewStatus: 'needs_review' },
        { chapter: 5, reviewStatus: 'needs_review', generator: 'human' },
      ],
    });

    await expect(assertTeacherSettled(tables.db as never, 7n, 6)).rejects.toMatchObject({ code: 'DRF_016', message: expect.stringContaining('until chapter 4 is approved') });
  });

  it.each([
    ['approved', { knowledgeContract: TEACHES }, { reviewStatus: 'approved' }, false],
    ['final', { knowledgeContract: TEACHES }, { status: 'final', reviewStatus: 'final' }, false],
    ['finalized without a draft', { knowledgeContract: TEACHES }, undefined, true],
    ['teaching nothing', { knowledgeContract: { pov: ['mira'], learns: [] } }, { reviewStatus: 'needs_review' }, false],
  ] as const)('should let the next chapter through when the previous one is %s', async (_, teacher, draft, finalized) => {
    const tables = project(teacher, draft, finalized);

    await assertTeacherSettled(tables.db as never, 7n, 6);
  });
});

describe('untilFirstTeacher', () => {
  it('should end a batch at the first chapter whose plan teaches something', () => {
    const plans = new Map<number, { knowledgeContract?: unknown }>([
      [4, {}],
      [5, { knowledgeContract: TEACHES }],
      [6, {}],
    ]);

    expect(untilFirstTeacher([4, 5, 6], plans)).toEqual([4, 5]);
    expect(untilFirstTeacher([6], plans)).toEqual([6]);
  });
});

describe('GenerationService — writing by hand after an unapproved lesson', () => {
  it('should let the author write the next chapter themselves', async () => {
    const fake = fakeGenerationDb({ draftReads: [undefined], draftWriteResult: [draftRow({ chapter: 6 })], knowledge: knowledgeFixture() });

    await makeGenerationService(fake.db).updateDraft(1n, 6, { title: 'By Hand', body: 'Mira writes it herself.', summary: 'Written by hand.' });

    expect(fake.outcome()).toBe('committed');
  });
});
