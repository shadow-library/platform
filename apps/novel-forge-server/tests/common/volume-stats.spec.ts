import { describe, expect, it } from 'bun:test';

import { deriveVolumePlanRange, deriveVolumeStats, EMPTY_VOLUME_PLAN_RANGE, EMPTY_VOLUME_STATS, nextVolumeToActivate, volumeToAutoActivate } from '@server/common';

describe('deriveVolumeStats', () => {
  it('should report zero counts for a volume with no chapters', () => {
    expect(deriveVolumeStats([])).toEqual(EMPTY_VOLUME_STATS);
  });

  it('should compute the chapter count, range and total word count', () => {
    const stats = deriveVolumeStats([
      { number: 4, wordCount: 1200 },
      { number: 2, wordCount: 900 },
      { number: 3, wordCount: null },
    ]);
    expect(stats).toEqual({ chapterCount: 3, firstChapter: 2, lastChapter: 4, wordCount: 2100 });
  });

  it('should treat a single chapter as its own range', () => {
    expect(deriveVolumeStats([{ number: 7, wordCount: 500 }])).toEqual({ chapterCount: 1, firstChapter: 7, lastChapter: 7, wordCount: 500 });
  });
});

describe('deriveVolumePlanRange', () => {
  it('should report a null range for a volume with no chapters anywhere in the plan', () => {
    expect(deriveVolumePlanRange([])).toEqual(EMPTY_VOLUME_PLAN_RANGE);
  });

  it('should widen the range with chapter numbers a final-only range would miss', () => {
    expect(deriveVolumePlanRange([5, 2, 3])).toEqual({ planChapterCount: 3, planFirstChapter: 2, planLastChapter: 5 });
  });
});

describe('nextVolumeToActivate', () => {
  const volumes = [
    { volumeKey: 'v1', ordinal: 1, state: 'goal_met' as const },
    { volumeKey: 'v2', ordinal: 2, state: 'active' as const },
    { volumeKey: 'v3', ordinal: 3, state: 'not_started' as const },
    { volumeKey: 'v4', ordinal: 4, state: 'not_started' as const },
  ];

  it('should pick the nearest not-started volume after the given one', () => {
    expect(nextVolumeToActivate(volumes, 'v2')).toBe('v3');
  });

  it('should return null when every later volume is already underway', () => {
    expect(nextVolumeToActivate(volumes, 'v3')).toBe('v4');
    expect(nextVolumeToActivate(volumes, 'v4')).toBeNull();
  });

  it('should return null for an unknown volume', () => {
    expect(nextVolumeToActivate(volumes, 'missing')).toBeNull();
  });

  it('should skip a later volume that is already active or goal met, in favour of the next not-started one', () => {
    const withGap = [
      { volumeKey: 'v1', ordinal: 1, state: 'active' as const },
      { volumeKey: 'v2', ordinal: 2, state: 'goal_met' as const },
      { volumeKey: 'v3', ordinal: 3, state: 'not_started' as const },
    ];
    expect(nextVolumeToActivate(withGap, 'v1')).toBe('v3');
  });
});

describe('volumeToAutoActivate', () => {
  it('should activate a project’s first volume', () => {
    expect(volumeToAutoActivate([{ volumeKey: 'v1', ordinal: 1, state: 'not_started' }])).toBe('v1');
  });

  it('should do nothing while a volume is already active', () => {
    const volumes = [
      { volumeKey: 'v1', ordinal: 1, state: 'active' as const },
      { volumeKey: 'v2', ordinal: 2, state: 'not_started' as const },
    ];
    expect(volumeToAutoActivate(volumes)).toBeNull();
  });

  it('should activate a newly inserted volume once every earlier one is goal met', () => {
    const volumes = [
      { volumeKey: 'v1', ordinal: 1, state: 'goal_met' as const },
      { volumeKey: 'v2', ordinal: 2, state: 'goal_met' as const },
      { volumeKey: 'v3', ordinal: 3, state: 'not_started' as const },
    ];
    expect(volumeToAutoActivate(volumes)).toBe('v3');
  });

  it('should not activate a not-started volume a goal-met one has already passed', () => {
    const volumes = [
      { volumeKey: 'v1', ordinal: 1, state: 'not_started' as const },
      { volumeKey: 'v2', ordinal: 2, state: 'goal_met' as const },
    ];
    expect(volumeToAutoActivate(volumes)).toBeNull();
  });

  it('should pick the lowest-ordinal eligible volume, not merely the first in the list', () => {
    const volumes = [
      { volumeKey: 'v3', ordinal: 3, state: 'not_started' as const },
      { volumeKey: 'v2', ordinal: 2, state: 'not_started' as const },
    ];
    expect(volumeToAutoActivate(volumes)).toBe('v2');
  });
});
