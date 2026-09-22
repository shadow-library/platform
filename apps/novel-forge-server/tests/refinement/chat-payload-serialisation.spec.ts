import { describe, expect, it } from 'bun:test';

import { serialiseMessage } from '@modules/refinement/serialise';

interface MessageRow {
  id: bigint;
  sessionId: string;
  ordinal: number;
  role: string;
  content: string;
  payload?: Record<string, unknown> | null;
  proposalId?: bigint | null;
  createdAt: Date;
}

const row = (ordinal: number, role: string, payload?: Record<string, unknown> | null): MessageRow => ({
  id: BigInt(ordinal),
  sessionId: 'a1f54862-f0f2-433b-b660-898fba7149cb',
  ordinal,
  role,
  content: 'Got the spark',
  payload,
  proposalId: null,
  createdAt: new Date('2026-09-12T17:34:30.282Z'),
});

const questionsPayload = {
  kind: 'questions',
  questions: [
    {
      id: 'spark.idea',
      wording: 'Which of these is the one you will not let me soften?',
      coaching: 'Start anywhere.',
      options: ['The romance is the spine', 'The no-crossover rule'],
      youDecide: 'All three together.',
      select: 'many',
    },
  ],
  locks: [{ key: 'dual-lead', kind: 'shape', text: 'Villain and villainess are the two leads.' }],
};

const cardsPayload = {
  kind: 'cards',
  round: 1,
  cards: [{ id: 'c1', round: 1, title: 'T', logline: 'L', engine: 'E', ladder: 'La', posture: 'P', hookLine: 'H', fate: 'offered' }],
  filtersFailed: [{ playbookKey: 'no-harems', card: 'T', mustReplace: 'the harem beat' }],
};

const readinessPayload = { kind: 'readiness', readiness: [{ dimension: 'premise', verdict: 'thin', note: 'Say what it costs.', fix: 'Name the price.' }] };

const payloadOf = (message: MessageRow): unknown => serialiseMessage(message).payload;

describe('serialiseMessage', () => {
  it('should keep a questions payload whole, its bank select included', () => {
    expect(payloadOf(row(2, 'assistant', questionsPayload))).toStrictEqual(questionsPayload);
  });

  it('should keep a cards payload whole, its filter rejections included', () => {
    expect(payloadOf(row(2, 'assistant', cardsPayload))).toStrictEqual(cardsPayload);
  });

  it('should keep a readiness payload whole', () => {
    expect(payloadOf(row(2, 'assistant', readinessPayload))).toStrictEqual(readinessPayload);
  });

  it('should carry no payload for a prose-only message', () => {
    expect(payloadOf(row(1, 'user', null))).toBeUndefined();
    expect(payloadOf(row(2, 'assistant', undefined))).toBeUndefined();
  });

  it("should restore the bank's select on a legacy question that carries none", () => {
    const { select: _select, ...legacyQuestion } = questionsPayload.questions[0]!;
    expect(payloadOf(row(2, 'assistant', { ...questionsPayload, questions: [legacyQuestion] }))).toStrictEqual(questionsPayload);
  });

  it('should fall back to single-select for a question id the bank no longer owns', () => {
    const { select: _select, ...legacyQuestion } = questionsPayload.questions[0]!;
    const retired = { ...legacyQuestion, id: 'spark.retired' };
    expect(payloadOf(row(2, 'assistant', { ...questionsPayload, questions: [retired] }))).toStrictEqual({ ...questionsPayload, questions: [{ ...retired, select: 'one' }] });
  });

  it('should drop a payload of an unrecognised kind rather than fail the transcript', () => {
    expect(payloadOf(row(2, 'assistant', { kind: 'diverge', cards: [] }))).toBeUndefined();
  });
});
