import { describe, expect, it } from 'bun:test';

import { computeProgress, PROGRESS_ITEM_KEYS, type ProgressFields, progressFieldsFrom, type ProgressOverride, progressOverridesFrom } from '@server/common';

const EMPTY: ProgressFields = {
  premise: null,
  protagonistKey: null,
  opposition: null,
  theme: null,
  readerPromise: null,
  endingQuestion: null,
  ending: null,
  firstVolumeGoal: null,
  nextChapterPlanned: false,
  chapterOneWritten: false,
};

describe('computeProgress', () => {
  it('should report every item open for a brand-new project', () => {
    const items = computeProgress(EMPTY, new Map());

    expect(items).toHaveLength(PROGRESS_ITEM_KEYS.length);
    expect(items.every(item => item.status === 'open')).toBe(true);
  });

  it('should count the ending answered from either the ending question or the planned ending', () => {
    const byQuestion = computeProgress({ ...EMPTY, endingQuestion: 'Will Mira pay the tide?' }, new Map());
    const byEnding = computeProgress({ ...EMPTY, ending: 'Mira keeps the lamp lit.' }, new Map());

    expect(byQuestion.find(item => item.key === 'ending')?.status).toBe('answered');
    expect(byEnding.find(item => item.key === 'ending')?.status).toBe('answered');
  });

  it('should treat a blank string the same as no answer', () => {
    const items = computeProgress({ ...EMPTY, premise: '   ' }, new Map());

    expect(items.find(item => item.key === 'premise')?.status).toBe('open');
  });

  it('should carry an override’s status and entry id, overriding a filled field', () => {
    const overrides = new Map<string, ProgressOverride>([['ending', { status: 'undecided', entryId: 9n }]]);

    const items = computeProgress({ ...EMPTY, endingQuestion: 'Will Mira pay the tide?' }, overrides);

    expect(items.find(item => item.key === 'ending')).toMatchObject({ status: 'undecided', overrideEntryId: 9n });
  });

  it('should keep a dismissed item dismissed on every later call, never nagging about it again', () => {
    const overrides = new Map<string, ProgressOverride>([['first_volume_goal', { status: 'dismissed', entryId: 3n }]]);

    const first = computeProgress(EMPTY, overrides);
    const second = computeProgress({ ...EMPTY }, overrides);

    expect(first.find(item => item.key === 'first_volume_goal')).toMatchObject({ status: 'dismissed', overrideEntryId: 3n });
    expect(second.find(item => item.key === 'first_volume_goal')).toMatchObject({ status: 'dismissed', overrideEntryId: 3n });
  });

  it('should stop listing the next-chapter item once chapter 1 is written', () => {
    const stillOpen = computeProgress(EMPTY, new Map());
    const written = computeProgress({ ...EMPTY, chapterOneWritten: true }, new Map());

    expect(stillOpen.find(item => item.key === 'next_chapter_planned')).toBeDefined();
    expect(written.find(item => item.key === 'next_chapter_planned')).toBeUndefined();
    expect(written).toHaveLength(PROGRESS_ITEM_KEYS.length - 1);
  });

  it('should count the next chapter answered only when a plan exists', () => {
    const items = computeProgress({ ...EMPTY, nextChapterPlanned: true }, new Map());

    expect(items.find(item => item.key === 'next_chapter_planned')?.status).toBe('answered');
  });
});

describe('progressOverridesFrom', () => {
  it('should read a server-owned override by its topic and payload', () => {
    const overrides = progressOverridesFrom([{ id: 9n, kind: 'system', topic: 'progress.ending', payload: { status: 'undecided' } }]);

    expect(overrides.get('ending')).toEqual({ status: 'undecided', entryId: 9n });
  });

  it('should ignore a forged entry that is not kind system, even with a well-formed payload', () => {
    const overrides = progressOverridesFrom([{ id: 9n, kind: 'direction', topic: 'progress.ending', payload: { status: 'undecided' } }]);

    expect(overrides.has('ending')).toBe(false);
  });

  it('should ignore an entry with no payload, a malformed payload, or a topic outside the checklist', () => {
    const overrides = progressOverridesFrom([
      { id: 1n, kind: 'system', topic: 'progress.ending', payload: null },
      { id: 2n, kind: 'system', topic: 'progress.ending', payload: { status: 'maybe' } },
      { id: 3n, kind: 'system', topic: 'world.rules', payload: { status: 'dismissed' } },
    ]);

    expect(overrides.size).toBe(0);
  });
});

describe('progressFieldsFrom', () => {
  it('should read the first volume by ordinal and treat a non-stale next-chapter brief as a plan', () => {
    const fields = progressFieldsFrom(
      { premise: null, protagonistKey: null, opposition: null, theme: null, readerPromise: null, endingQuestion: null, ending: null },
      [{ objective: 'Reach the tide court.' }, { objective: 'Never reached, later volume.' }],
      { chapter: 1, brief: { staleReason: null } },
    );

    expect(fields.firstVolumeGoal).toBe('Reach the tide court.');
    expect(fields.nextChapterPlanned).toBe(true);
    expect(fields.chapterOneWritten).toBe(false);
  });

  it('should not count a stale brief as a plan, and should know chapter one is already written', () => {
    const fields = progressFieldsFrom({ premise: null, protagonistKey: null, opposition: null, theme: null, readerPromise: null, endingQuestion: null, ending: null }, [], {
      chapter: 2,
      brief: { staleReason: 'the author replanned' },
    });

    expect(fields.nextChapterPlanned).toBe(false);
    expect(fields.chapterOneWritten).toBe(true);
  });

  it('should treat a missing brief as unplanned', () => {
    const fields = progressFieldsFrom({ premise: null, protagonistKey: null, opposition: null, theme: null, readerPromise: null, endingQuestion: null, ending: null }, [], {
      chapter: 1,
    });

    expect(fields.nextChapterPlanned).toBe(false);
  });
});
