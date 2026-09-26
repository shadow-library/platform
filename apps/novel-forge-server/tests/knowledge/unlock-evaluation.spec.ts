import { describe, expect, it } from 'bun:test';

import { describeUnlockTerm, evaluateUnlock, type UnlockContext } from '@server/common';
import { type UnlockCondition, type UnlockTerm } from '@server/database';

const VOLUMES = new Map([
  ['the_marsh', 1],
  ['the_tower', 2],
  ['the_sea', 3],
]);

function at(overrides: Partial<UnlockContext> = {}): UnlockContext {
  return { chapter: 10, endingChapter: null, volumeKey: 'the_tower', volumeOrdinals: VOLUMES, reachedMilestones: new Set(), ...overrides };
}

const holds = (term: UnlockTerm, ctx: UnlockContext): boolean => evaluateUnlock({ all: [term] }, ctx).holds;

describe('evaluateUnlock', () => {
  it('should hold a milestone term only when that milestone counts as reached', () => {
    expect(holds({ milestone: 'lamp_rank_4' }, at({ reachedMilestones: new Set(['lamp_rank_4']) }))).toBe(true);
    expect(holds({ milestone: 'lamp_rank_4' }, at())).toBe(false);
  });

  it('should never let a later rank stand in for an earlier one', () => {
    const ctx = at({ reachedMilestones: new Set(['lamp_rank_5']) });

    expect(holds({ milestone: 'lamp_rank_4' }, ctx)).toBe(false);
    expect(holds({ milestone: 'lamp_rank_5' }, ctx)).toBe(true);
  });

  it('should hold a chapter term from that chapter on', () => {
    expect(holds({ chapter: 10 }, at())).toBe(true);
    expect(holds({ chapter: 9 }, at())).toBe(true);
    expect(holds({ chapter: 11 }, at())).toBe(false);
  });

  it('should hold a volume term once the plan is in that volume or a later one by ordinal', () => {
    expect(holds({ volume: 'the_marsh' }, at())).toBe(true);
    expect(holds({ volume: 'the_tower' }, at())).toBe(true);
    expect(holds({ volume: 'the_sea' }, at())).toBe(false);
  });

  it('should not hold a volume term for a plan outside every volume or a volume the novel does not have', () => {
    expect(holds({ volume: 'the_marsh' }, at({ volumeKey: null }))).toBe(false);
    expect(holds({ volume: 'the_marsh' }, at({ volumeKey: 'the_lost_volume' }))).toBe(false);
    expect(holds({ volume: 'the_lost_volume' }, at())).toBe(false);
  });

  it('should hold the ending term from the chapter planned as the ending on, so an epilogue may reveal it too', () => {
    expect(holds({ ending: true }, at({ endingChapter: 10 }))).toBe(true);
    expect(holds({ ending: true }, at({ endingChapter: 8 }))).toBe(true);
    expect(holds({ ending: true }, at({ endingChapter: 11 }))).toBe(false);
    expect(holds({ ending: true }, at({ chapter: 500 }))).toBe(false);
  });

  it('should hold a conjunction only when every term holds, and list each missing term', () => {
    const condition: UnlockCondition = { all: [{ milestone: 'lamp_rank_4' }, { volume: 'the_sea' }, { chapter: 12 }, { ending: true }] };
    const truthTable: [Partial<UnlockContext>, UnlockTerm[]][] = [
      [{}, condition.all],
      [{ reachedMilestones: new Set(['lamp_rank_4']) }, [{ volume: 'the_sea' }, { chapter: 12 }, { ending: true }]],
      [{ reachedMilestones: new Set(['lamp_rank_4']), volumeKey: 'the_sea', chapter: 12 }, [{ ending: true }]],
      [{ reachedMilestones: new Set(['lamp_rank_4']), volumeKey: 'the_sea', chapter: 12, endingChapter: 12 }, []],
      [{ volumeKey: 'the_sea', chapter: 12, endingChapter: 12 }, [{ milestone: 'lamp_rank_4' }]],
    ];

    for (const [ctx, missing] of truthTable) expect(evaluateUnlock(condition, at(ctx))).toEqual({ holds: missing.length === 0, missing });
  });
});

describe('describeUnlockTerm', () => {
  it('should name each kind of term for an error message', () => {
    expect([{ milestone: 'lamp_rank_4' }, { volume: 'the_sea' }, { chapter: 12 }, { ending: true } as const].map(describeUnlockTerm)).toEqual([
      'milestone lamp_rank_4 reached',
      'volume the_sea reached',
      'chapter 12 or later',
      'the planned ending or later',
    ]);
  });
});
