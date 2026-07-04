/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { PROMPT_REGISTRY } from '@modules/ai/prompts';
import { AUTHORING_STYLE } from '@modules/ai/prompts/authoring-preamble';
import { ExtractionSchema, FixSchema, JudgeSchema, PlanSchema } from '@modules/ai/schemas';

/**
 * Declaring the constants
 */

describe('Prompt modules', () => {
  describe('AUTHORING_STYLE invariant', () => {
    it('authoring prompts contain AUTHORING_STYLE', () => {
      const authoring = Object.values(PROMPT_REGISTRY).filter(p => p.kind === 'authoring');
      expect(authoring.length).toBeGreaterThan(0);
      for (const p of authoring) {
        expect(p.system).toContain(AUTHORING_STYLE.slice(0, 40));
      }
    });

    it('analytical prompts do not contain AUTHORING_STYLE', () => {
      const analytical = Object.values(PROMPT_REGISTRY).filter(p => p.kind === 'analytical');
      expect(analytical.length).toBeGreaterThan(0);
      for (const p of analytical) {
        expect(p.system).not.toContain(AUTHORING_STYLE.slice(0, 40));
      }
    });
  });

  describe('JudgeSchema', () => {
    it('accepts consistent verdict with no findings', () => {
      expect(() => JudgeSchema.parse({ verdict: 'consistent', findings: [] })).not.toThrow();
    });

    it('accepts contradiction verdict with hard finding', () => {
      expect(() => JudgeSchema.parse({ verdict: 'contradiction', findings: [{ severity: 'hard', text: 'Contradicts chapter 3.' }] })).not.toThrow();
    });

    it('rejects contradiction verdict with no hard findings', () => {
      expect(() => JudgeSchema.parse({ verdict: 'contradiction', findings: [{ severity: 'soft', text: 'Minor issue.' }] })).toThrow();
    });
  });

  describe('FixSchema', () => {
    it('accepts valid patch', () => {
      expect(() => FixSchema.parse({ action: 'patch', patches: [{ find: 'old text', replace: 'new text' }] })).not.toThrow();
    });

    it('rejects patch with no patches', () => {
      expect(() => FixSchema.parse({ action: 'patch', patches: [] })).toThrow();
    });

    it('accepts rewrite with body', () => {
      expect(() => FixSchema.parse({ action: 'rewrite', body: 'Full replacement chapter prose.' })).not.toThrow();
    });
  });

  describe('PlanSchema', () => {
    it('rejects non-contiguous chapter spans', () => {
      expect(() =>
        PlanSchema.parse([
          { volumeKey: 'vol_1', ordinal: 1, title: 'V1', objective: 'x', conflict: 'y', payoff: 'z', startChapter: 1, endChapter: 5 },
          { volumeKey: 'vol_2', ordinal: 2, title: 'V2', objective: 'x', conflict: 'y', payoff: 'z', startChapter: 7, endChapter: 12 },
        ]),
      ).toThrow();
    });

    it('accepts contiguous volumes', () => {
      expect(() =>
        PlanSchema.parse([
          { volumeKey: 'vol_1', ordinal: 1, title: 'V1', objective: 'x', conflict: 'y', payoff: 'z', startChapter: 1, endChapter: 5 },
          { volumeKey: 'vol_2', ordinal: 2, title: 'V2', objective: 'x', conflict: 'y', payoff: 'z', startChapter: 6, endChapter: 12 },
        ]),
      ).not.toThrow();
    });
  });

  describe('ExtractionSchema', () => {
    it('accepts minimal valid output', () => {
      expect(() =>
        ExtractionSchema.parse({
          entities: [],
          relationships: [],
          beats: [],
          plotThreads: [],
          worldFacts: [],
          mysteries: [],
          chapterSummary: 'The hero arrives in the city.',
        }),
      ).not.toThrow();
    });
  });
});
