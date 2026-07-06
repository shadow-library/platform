/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { PROMPT_REGISTRY } from '@modules/ai/prompts';
import { AUTHORING_STYLE } from '@modules/ai/prompts/authoring-preamble';
import { ExtractionSchema, FixSchema, JudgeSchema, PlanSchema, validatePlanContiguity } from '@modules/ai/schemas';
import { parseSchema } from '@modules/ai/schemas/validate';

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
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [] }).success).toBe(true);
    });

    it('accepts contradiction verdict with hard finding', () => {
      expect(parseSchema(JudgeSchema, { verdict: 'contradiction', findings: [{ severity: 'hard', text: 'Contradicts chapter 3.' }] }).success).toBe(true);
    });

    it('rejects contradiction verdict with no hard findings', () => {
      expect(parseSchema(JudgeSchema, { verdict: 'contradiction', findings: [{ severity: 'soft', text: 'Minor issue.' }] }).success).toBe(false);
    });
  });

  describe('FixSchema', () => {
    it('accepts valid patch', () => {
      expect(parseSchema(FixSchema, { action: 'patch', patches: [{ find: 'old text', replace: 'new text' }] }).success).toBe(true);
    });

    it('rejects patch with no patches', () => {
      expect(parseSchema(FixSchema, { action: 'patch', patches: [] }).success).toBe(false);
    });

    it('accepts rewrite with body', () => {
      expect(parseSchema(FixSchema, { action: 'rewrite', body: 'Full replacement chapter prose.' }).success).toBe(true);
    });
  });

  describe('PlanSchema', () => {
    it('rejects non-contiguous chapter spans', () => {
      const vols = [
        { volumeKey: 'vol_1', ordinal: 1, title: 'V1', objective: 'x', conflict: 'y', payoff: 'z', startChapter: 1, endChapter: 5 },
        { volumeKey: 'vol_2', ordinal: 2, title: 'V2', objective: 'x', conflict: 'y', payoff: 'z', startChapter: 7, endChapter: 12 },
      ];
      const parsed = parseSchema(PlanSchema, vols);
      expect(parsed.success && validatePlanContiguity(parsed.data as never).length === 0).toBe(false);
    });

    it('accepts contiguous volumes', () => {
      const vols = [
        { volumeKey: 'vol_1', ordinal: 1, title: 'V1', objective: 'x', conflict: 'y', payoff: 'z', startChapter: 1, endChapter: 5 },
        { volumeKey: 'vol_2', ordinal: 2, title: 'V2', objective: 'x', conflict: 'y', payoff: 'z', startChapter: 6, endChapter: 12 },
      ];
      const parsed = parseSchema(PlanSchema, vols);
      expect(parsed.success && validatePlanContiguity(parsed.data as never).length === 0).toBe(true);
    });
  });

  describe('ExtractionSchema', () => {
    it('accepts minimal valid output', () => {
      const result = parseSchema(ExtractionSchema, {
        entities: [],
        relationships: [],
        beats: [],
        plotThreads: [],
        worldFacts: [],
        mysteries: [],
        chapterSummary: 'The hero arrives in the city.',
      });
      expect(result.success).toBe(true);
    });
  });
});
