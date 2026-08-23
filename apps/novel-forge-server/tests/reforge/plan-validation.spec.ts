import { describe, expect, it } from 'bun:test';

import { deriveOutputNumbering, type PlanSpanLike, spanKeyFor, validateTransformPlan } from '@modules/reforge/plan-validation';

function span(ordinal: number, from: number, to: number, action: PlanSpanLike['action'], targetChapters: number, extra: Partial<PlanSpanLike> = {}): PlanSpanLike {
  return { ordinal, fromChapter: from, toChapter: to, action, targetChapters, keptBeats: action === 'drop' ? [] : ['the duel lands'], ...extra };
}

// A 20-chapter source: keep 1-4, condense 5-12 into 3, drop 13-16, keep 17-20 with a bridge.
const PLAN: PlanSpanLike[] = [
  span(1, 1, 4, 'keep', 4),
  span(2, 5, 12, 'condense', 3),
  span(3, 13, 16, 'drop', 0),
  span(4, 17, 20, 'keep', 4, { continuityNotes: 'six months have passed; the tribunal is never mentioned again' }),
];

const OPTIONS = { sourceChapterCount: 20 };

describe('validateTransformPlan', () => {
  it('should accept a plan that partitions the source', () => {
    expect(validateTransformPlan(PLAN, OPTIONS)).toEqual([]);
  });

  it('should reject an empty plan', () => {
    expect(validateTransformPlan([], OPTIONS)[0]).toMatch(/at least one span/);
  });

  it('should reject a gap, an overlap, and a source chapter that never reaches a span', () => {
    const gapped = [PLAN[0] as PlanSpanLike, span(2, 7, 12, 'condense', 3), PLAN[2] as PlanSpanLike, PLAN[3] as PlanSpanLike];
    expect(validateTransformPlan(gapped, OPTIONS).some(i => /must partition the source/.test(i))).toBe(true);

    const overlapping = [PLAN[0] as PlanSpanLike, span(2, 4, 12, 'condense', 3), PLAN[2] as PlanSpanLike, PLAN[3] as PlanSpanLike];
    expect(validateTransformPlan(overlapping, OPTIONS).some(i => /must partition the source/.test(i))).toBe(true);

    const truncated = PLAN.slice(0, 3);
    expect(validateTransformPlan(truncated, OPTIONS).some(i => /must end at source chapter 20/.test(i))).toBe(true);

    const offset = [span(1, 2, 5, 'keep', 4), span(2, 6, 20, 'condense', 5)];
    expect(validateTransformPlan(offset, OPTIONS).some(i => /must start at source chapter 1/.test(i))).toBe(true);
  });

  it('should reject ordinals that do not run 1..K', () => {
    const misordered = [span(1, 1, 10, 'keep', 10), span(3, 11, 20, 'keep', 10)];
    expect(validateTransformPlan(misordered, OPTIONS).some(i => /ordinals must run/.test(i))).toBe(true);
  });

  it('should hold every action to its target-chapter arithmetic', () => {
    expect(validateTransformPlan([span(1, 1, 20, 'keep', 19)], OPTIONS)[0]).toMatch(/must produce exactly its 20 source chapters/);
    expect(validateTransformPlan([span(1, 1, 4, 'merge', 2), span(2, 5, 20, 'keep', 16)], OPTIONS)[0]).toMatch(/must produce exactly 1 output chapter/);
    expect(validateTransformPlan([span(1, 1, 16, 'keep', 16), span(2, 17, 20, 'drop', 1)], OPTIONS)[0]).toMatch(/must produce no output chapters/);
    expect(validateTransformPlan([span(1, 1, 4, 'condense', 4), span(2, 5, 20, 'keep', 16)], OPTIONS)[0]).toMatch(/between 1 and 3 output chapters/);
    expect(validateTransformPlan([span(1, 1, 4, 'condense', 0), span(2, 5, 20, 'keep', 16)], OPTIONS)[0]).toMatch(/between 1 and 3 output chapters/);
  });

  it('should refuse to open the novel on a dropped span', () => {
    const dropFirst = [span(1, 1, 4, 'drop', 0), span(2, 5, 20, 'keep', 16, { continuityNotes: 'the story opens mid-flight' })];
    expect(validateTransformPlan(dropFirst, OPTIONS).some(i => /needs an opening/.test(i))).toBe(true);
  });

  it('should require the bridge exactly where the seam is', () => {
    const unbridged = [...PLAN.slice(0, 3), span(4, 17, 20, 'keep', 4)];
    expect(validateTransformPlan(unbridged, OPTIONS).some(i => /needs continuity notes/.test(i))).toBe(true);

    const blank = [...PLAN.slice(0, 3), span(4, 17, 20, 'keep', 4, { continuityNotes: '   ' })];
    expect(validateTransformPlan(blank, OPTIONS).some(i => /needs continuity notes/.test(i))).toBe(true);

    // A trailing drop has nothing after it to bridge.
    const trailingDrop = [span(1, 1, 16, 'keep', 16), span(2, 17, 20, 'drop', 0)];
    expect(validateTransformPlan(trailingDrop, OPTIONS)).toEqual([]);
  });

  it('should enforce the source-chapters-per-output ceiling and the minimum span length', () => {
    const tooWide = [span(1, 1, 20, 'condense', 2)];
    expect(validateTransformPlan(tooWide, OPTIONS)[0]).toMatch(/over the ceiling of 6/);
    expect(validateTransformPlan(tooWide, { ...OPTIONS, maxSpanSourceChapters: 10 })).toEqual([]);

    const merged = [span(1, 1, 8, 'merge', 1), span(2, 9, 20, 'keep', 12)];
    expect(validateTransformPlan(merged, OPTIONS)[0]).toMatch(/8 source chapters, over the ceiling/);

    expect(validateTransformPlan(PLAN, { ...OPTIONS, minSpanChapters: 5 }).some(i => /shorter than the 5-chapter minimum/.test(i))).toBe(true);
  });

  it('should require kept beats on every span that produces output', () => {
    const beatless = [span(1, 1, 20, 'keep', 20, { keptBeats: [] })];
    expect(validateTransformPlan(beatless, OPTIONS)[0]).toMatch(/must name the beats it keeps/);
  });

  it('should skip the coverage check when the source chapter count is unknown, as a model draft is', () => {
    expect(validateTransformPlan(PLAN)).toEqual([]);
    expect(validateTransformPlan(PLAN.slice(0, 3))).toEqual([]);
  });
});

describe('deriveOutputNumbering', () => {
  it('should number output chapters as the running sum of targets, skipping drops', () => {
    const derived = deriveOutputNumbering(PLAN);
    expect(derived.outputChapterCount).toBe(11);
    expect(derived.spans.map(s => [s.firstOutputChapter, s.lastOutputChapter])).toEqual([
      [1, 4],
      [5, 7],
      [null, null],
      [8, 11],
    ]);
  });

  it('should keep a span key stable across an edit that leaves the span alone, and move it when the span changes', () => {
    const edited: PlanSpanLike[] = [
      PLAN[0] as PlanSpanLike,
      span(2, 5, 12, 'condense', 2),
      PLAN[2] as PlanSpanLike,
      span(4, 17, 20, 'keep', 4, { continuityNotes: 'rewritten bridge prose' }),
    ];

    const before = deriveOutputNumbering(PLAN).spans.map(s => s.spanKey);
    const after = deriveOutputNumbering(edited).spans.map(s => s.spanKey);

    expect(after[0]).toBe(before[0] as string);
    expect(after[1]).not.toBe(before[1] as string);
    expect(after[2]).toBe(before[2] as string);
    // Span 4's bounds, action, and target are untouched — only its prose changed, so its outputs carry forward.
    expect(after[3]).toBe(before[3] as string);
    // The edit does move span 4's output numbers, because span 2 now produces one chapter fewer.
    expect(deriveOutputNumbering(edited).spans[3]?.firstOutputChapter).toBe(7);
  });

  it('should derive a span key from bounds, action, and target alone', () => {
    expect(spanKeyFor({ fromChapter: 5, toChapter: 12, action: 'condense', targetChapters: 3 })).toBe(
      spanKeyFor({ fromChapter: 5, toChapter: 12, action: 'condense', targetChapters: 3 }),
    );
    expect(spanKeyFor({ fromChapter: 5, toChapter: 12, action: 'condense', targetChapters: 3 })).not.toBe(
      spanKeyFor({ fromChapter: 5, toChapter: 12, action: 'merge', targetChapters: 1 }),
    );
  });
});
