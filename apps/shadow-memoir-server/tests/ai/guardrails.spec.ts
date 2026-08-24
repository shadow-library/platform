import { describe, expect, it } from 'bun:test';

import {
  ALLOWED_SUGGESTION_KINDS,
  applyGuardrails,
  CRISIS_RESPONSE_ANSWER,
  findVerbatimQuote,
  type GuardrailInput,
  type GuardrailViolation,
  type InferenceDraft,
} from '@modules/ai-worker';

const JOURNAL_ENTRY = 'I skipped the evening run again because my manager kept me on a call until nearly nine and I felt completely wrung out afterwards';
const REASON_NOTE = 'too tired after the late standup meeting';

const CLEAN_DRAFT: InferenceDraft = {
  answer: 'Evening quests are missed about three times as often as morning ones, and almost always on days with a late work log.',
  patterns: ['Missed evening quests cluster on days with an expense logged after 20:00.'],
  suggestions: [{ kind: 'shift_time', questId: '11', text: 'Try moving the evening run 45 minutes earlier.' }],
  limitationNote: null,
};

function input(overrides: Partial<GuardrailInput> = {}): GuardrailInput {
  return {
    queryText: 'why do I keep failing evening quests?',
    sensitiveSources: [JOURNAL_ENTRY, REASON_NOTE],
    allowedQuestIds: ['11', '12'],
    draft: CLEAN_DRAFT,
    ...overrides,
  };
}

function withAnswer(answer: string): GuardrailInput {
  return input({ draft: { ...CLEAN_DRAFT, answer } });
}

describe('AI output guardrails (T-33, PRD §6.6, ARCHITECTURE §28.6)', () => {
  describe('clean output', () => {
    it('should pass an answer that paraphrases, names no identity, and only offers allowed suggestion kinds', () => {
      const outcome = applyGuardrails(input());
      expect(outcome.status).toBe('passed');
      if (outcome.status !== 'passed') return;
      expect(outcome.violations).toEqual([]);
      expect(outcome.result.suggestions).toHaveLength(1);
    });

    it('should accept every allowed suggestion kind, so the closed set and the filter cannot drift apart', () => {
      for (const kind of ALLOWED_SUGGESTION_KINDS) {
        const outcome = applyGuardrails(input({ draft: { ...CLEAN_DRAFT, suggestions: [{ kind, questId: '11', text: 'A neutral tweak worth trying.' }] } }));
        expect(outcome.status).toBe('passed');
      }
    });
  });

  describe('no verbatim quotes (PRD §6.6.1)', () => {
    const canaries: [string, string][] = [
      ['a long journal sentence reproduced whole', JOURNAL_ENTRY],
      ['a seven-word run lifted out of the middle of a journal entry', 'because my manager kept me on a call'],
      ['a short reason note reproduced whole', REASON_NOTE],
      ['a quote wrapped in quotation marks and punctuation', `You wrote: "${REASON_NOTE}."`],
      ['a quote with the casing changed', REASON_NOTE.toUpperCase()],
    ];

    for (const [name, quote] of canaries) {
      it(`should block ${name}`, () => {
        const outcome = applyGuardrails(withAnswer(`Your evenings look heavy. ${quote}`));
        expect(outcome.status).toBe('blocked');
        if (outcome.status !== 'blocked') return;
        expect(outcome.violations).toContain('verbatim_quote');
      });
    }

    it('should block a verbatim quote that hides in a suggestion rather than the answer', () => {
      const draft = { ...CLEAN_DRAFT, suggestions: [{ kind: 'shift_time', questId: '11', text: `Because ${REASON_NOTE}, move it earlier.` }] };
      expect(applyGuardrails(input({ draft })).status).toBe('blocked');
    });

    it('should pass a genuine paraphrase of the same entry', () => {
      const outcome = applyGuardrails(withAnswer('On the days you missed the run, your own notes point at work running late and leaving you drained.'));
      expect(outcome.status).toBe('passed');
    });

    it('should not treat an incidental short phrase as a quote', () => {
      expect(findVerbatimQuote('you were too tired', ['too tired'])).toBeNull();
    });
  });

  describe('no identity assertion or diagnosis (PRD §6.6.2)', () => {
    const shapes: [string, string][] = [
      ['a bare identity assertion', 'You are lazy about evenings.'],
      ['a contracted identity assertion', "You're a procrastinator when it comes to the gym."],
      ['a hedged identity assertion', 'You are probably just unmotivated in the evenings.'],
      ['a clinical label', 'You have depression, which explains the missed days.'],
      ['a diagnosis framing', 'This pattern is diagnosable as burnout.'],
      ['a type-of-person framing', "You're the kind of person who starts things and drops them."],
    ];

    for (const [name, answer] of shapes) {
      it(`should block ${name}`, () => {
        const outcome = applyGuardrails(withAnswer(answer));
        expect(outcome.status).toBe('blocked');
        if (outcome.status !== 'blocked') return;
        expect(outcome.violations).toContain('identity_assertion');
      });
    }

    it('should pass a behavioural statement about what the person did', () => {
      expect(applyGuardrails(withAnswer('You completed 4 of 12 evening quests last month, and 11 of 12 morning ones.')).status).toBe('passed');
    });
  });

  describe('no shame copy (PRD §6.6.5)', () => {
    const shapes = ['You failed again this week.', 'You should be ashamed of that streak.', 'Four misses is disappointing.', 'Stop being lazy about it.'];

    for (const answer of shapes) {
      it(`should block shame copy: "${answer}"`, () => {
        const outcome = applyGuardrails(withAnswer(answer));
        expect(outcome.status).toBe('blocked');
        if (outcome.status !== 'blocked') return;
        expect(outcome.violations).toContain('shame_copy');
      });
    }
  });

  describe('no mechanic mutation (PRD §6.6.4)', () => {
    it('should block an answer claiming it changed game state itself', () => {
      const outcome = applyGuardrails(withAnswer("I've moved your evening run to 18:00 and awarded 20 XP for the streak."));
      expect(outcome.status).toBe('blocked');
      if (outcome.status !== 'blocked') return;
      expect(outcome.violations).toContain('mechanic_mutation');
    });

    it('should drop a suggestion whose kind is outside the allowed set rather than shipping it', () => {
      const draft = {
        ...CLEAN_DRAFT,
        suggestions: [
          { kind: 'shift_time', questId: '11', text: 'Move it earlier.' },
          { kind: 'grant_xp', questId: '11', text: 'Give yourself 100 XP.' },
        ],
      };
      const outcome = applyGuardrails(input({ draft }));
      expect(outcome.status).toBe('sanitized');
      if (outcome.status !== 'sanitized') return;
      expect(outcome.result.suggestions).toHaveLength(1);
      expect(outcome.result.suggestions[0]!.kind).toBe('shift_time');
      expect(outcome.violations).toContain('mechanic_mutation' as GuardrailViolation);
    });

    it('should drop a suggestion pointing at a quest the account does not own', () => {
      const draft = { ...CLEAN_DRAFT, suggestions: [{ kind: 'shift_time', questId: '999', text: 'Move it earlier.' }] };
      const outcome = applyGuardrails(input({ draft }));
      expect(outcome.status).toBe('sanitized');
      if (outcome.status !== 'sanitized') return;
      expect(outcome.result.suggestions).toHaveLength(0);
    });
  });

  describe('crisis handoff (PRD §6.6.3)', () => {
    it('should replace the whole answer with the handoff response when the question indicates self-harm risk', () => {
      const outcome = applyGuardrails(input({ queryText: 'why do I keep thinking I want to die when I miss my quests' }));
      expect(outcome.status).toBe('crisis');
      if (outcome.status !== 'crisis') return;
      expect(outcome.result.answer).toBe(CRISIS_RESPONSE_ANSWER);
    });

    it('should hand off on risk found in the assembled data even when the question is ordinary', () => {
      const outcome = applyGuardrails(input({ sensitiveSources: ['some days I think everyone would be better off dead without me around'] }));
      expect(outcome.status).toBe('crisis');
    });

    it('should hand off on risk that appears only in the model output', () => {
      expect(applyGuardrails(withAnswer('Your notes mention self-harm on the days you miss quests.')).status).toBe('crisis');
    });

    it('should attach no coaching content to the handoff', () => {
      const outcome = applyGuardrails(input({ queryText: 'I keep thinking about killing myself, what should I change?' }));
      expect(outcome.status).toBe('crisis');
      if (outcome.status !== 'crisis') return;
      expect(outcome.result.suggestions).toEqual([]);
      expect(outcome.result.patterns).toEqual([]);
      expect(outcome.result.limitationNote).toBeNull();
    });

    it('should carry no violation for the executor to record, so nothing can mark the event in the user data (§6.6.3)', () => {
      const outcome = applyGuardrails(input({ queryText: 'I want to die' }));
      expect(outcome.status).toBe('crisis');
      expect('violations' in outcome).toBe(false);
    });
  });
});
