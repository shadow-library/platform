/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { type ChapterLike, applyBoundaryMerges, buildGroupingPlan, parseTitleParts } from '@modules/source';

/**
 * Declaring the constants
 */

function ch(number: number, title: string | null, words = 2000): ChapterLike {
  return { number, title, words };
}

describe('title parts', () => {
  describe('parseTitleParts', () => {
    it('should parse part-of-total markers', () => {
      expect(parseTitleParts('Chapter 700 - The Gate (1/2)')).toEqual({ base: 'The Gate', sourceChapter: 700, part: 1, partTotal: 2 });
      expect(parseTitleParts('The Gate [2/3]')).toEqual({ base: 'The Gate', sourceChapter: null, part: 2, partTotal: 3 });
    });

    it('should parse "Part N" markers wherever they sit', () => {
      expect(parseTitleParts('Chapter 700 Part 2: The Gate')).toEqual({ base: 'The Gate', sourceChapter: 700, part: 2, partTotal: null });
      expect(parseTitleParts('The Gate Pt. 3')).toEqual({ base: 'The Gate', sourceChapter: null, part: 3, partTotal: null });
    });

    it('should parse chapter-dot-part prefixes', () => {
      expect(parseTitleParts('Chapter 700.2 The Gate')).toEqual({ base: 'The Gate', sourceChapter: 700, part: 2, partTotal: null });
      expect(parseTitleParts('c700.3')).toEqual({ base: '', sourceChapter: 700, part: 3, partTotal: null });
    });

    it('should parse trailing paren and dash parts', () => {
      expect(parseTitleParts('The Gate (2)')).toEqual({ base: 'The Gate', sourceChapter: null, part: 2, partTotal: null });
      expect(parseTitleParts('The Gate - 2')).toEqual({ base: 'The Gate', sourceChapter: null, part: 2, partTotal: null });
    });

    it('should parse bare numeric prefixes without eating the title', () => {
      expect(parseTitleParts('700: The Gate')).toEqual({ base: 'The Gate', sourceChapter: 700, part: null, partTotal: null });
      expect(parseTitleParts('1. The Beginning')).toEqual({ base: 'The Beginning', sourceChapter: 1, part: null, partTotal: null });
    });

    it('should leave plain titles and null titles alone', () => {
      expect(parseTitleParts('The Gate')).toEqual({ base: 'The Gate', sourceChapter: null, part: null, partTotal: null });
      expect(parseTitleParts(null)).toEqual({ base: '', sourceChapter: null, part: null, partTotal: null });
    });
  });

  describe('buildGroupingPlan', () => {
    it('should group by embedded source chapter number', () => {
      const plan = buildGroupingPlan([ch(1, 'Chapter 700 - The Gate (1/2)'), ch(2, 'Chapter 700 - The Gate (2/2)'), ch(3, 'Chapter 701 - The Road')]);
      expect(plan).toMatchObject({ before: 3, after: 2, ambiguous: [] });
      expect(plan.groups[0]?.members.map(m => m.number)).toEqual([1, 2]);
      expect(plan.groups[0]?.title).toBe('The Gate');
    });

    it('should group same-base part sequences and treat an unmarked first part as part 1', () => {
      const plan = buildGroupingPlan([ch(1, 'The Gate'), ch(2, 'The Gate (2)'), ch(3, 'The Gate (3)'), ch(4, 'The Road')]);
      expect(plan.after).toBe(2);
      expect(plan.groups[0]?.members).toHaveLength(3);
    });

    it('should continue an unmet part-of-total even when a later part loses its marker', () => {
      const plan = buildGroupingPlan([ch(1, 'The Gate (1/3)'), ch(2, 'The Gate (2/3)'), ch(3, 'The Gate')]);
      expect(plan.after).toBe(1);
      expect(plan.groups[0]?.flags).toEqual([]);
    });

    it('should flag bare repeated titles as ambiguous instead of merging', () => {
      const plan = buildGroupingPlan([ch(1, 'The Gate'), ch(2, 'The Gate'), ch(3, 'The Road')]);
      expect(plan.after).toBe(3);
      expect(plan.ambiguous).toEqual([{ afterNumber: 1, reason: 'bare_repeat' }]);
    });

    it('should flag part gaps and short untitled chapters', () => {
      const gap = buildGroupingPlan([ch(1, 'The Gate (1/3)'), ch(2, 'The Gate (3/3)')]);
      expect(gap.after).toBe(2);
      expect(gap.ambiguous[0]?.reason).toBe('part_gap');

      const untitled = buildGroupingPlan([ch(1, 'The Gate'), ch(2, null, 800)]);
      expect(untitled.ambiguous[0]?.reason).toBe('untitled_short');
    });

    it('should never merge across differing source chapter numbers', () => {
      const plan = buildGroupingPlan([ch(1, 'Chapter 700 - The Gate'), ch(2, 'Chapter 701 - The Gate')]);
      expect(plan.after).toBe(2);
      expect(plan.ambiguous).toEqual([]);
    });
  });

  describe('applyBoundaryMerges', () => {
    it('should merge only the verdicted boundaries and support chained merges', () => {
      const plan = buildGroupingPlan([ch(1, 'The Gate'), ch(2, 'The Gate'), ch(3, 'The Gate'), ch(4, 'The Road')]);
      expect(plan.after).toBe(4);

      const merged = applyBoundaryMerges(plan, [1, 2]);
      expect(merged.after).toBe(2);
      expect(merged.groups[0]?.members.map(m => m.number)).toEqual([1, 2, 3]);
      expect(merged.groups[0]?.flags).toContain('ai_merged');
      expect(merged.ambiguous).toEqual([]);
    });

    it('should leave the plan untouched for empty verdicts', () => {
      const plan = buildGroupingPlan([ch(1, 'The Gate'), ch(2, 'The Gate')]);
      expect(applyBoundaryMerges(plan, [])).toBe(plan);
    });
  });
});
