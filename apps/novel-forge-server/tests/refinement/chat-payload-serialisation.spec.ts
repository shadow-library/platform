import { describe, expect, it } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';
import { ClassSchema } from '@shadow-library/class-schema';

import { ListChatMessagesResponse } from '@modules/refinement/chat.dto';
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

async function serve(messages: MessageRow[]): Promise<ListChatMessagesResponse> {
  const app: FastifyInstance = Fastify();
  app.get('/messages', { schema: { response: { 200: ClassSchema.generate(ListChatMessagesResponse) } } }, () => ({
    messages: messages.map(serialiseMessage),
    pendingTurn: null,
    failedTurn: null,
  }));
  const response = await app.inject({ method: 'GET', url: '/messages' });
  await app.close();
  expect(response.statusCode).toBe(200);
  return response.json();
}

describe('chat message payload serialisation', () => {
  it('should serialise a questions payload without dropping its questions, options or locks', async () => {
    const body = await serve([row(2, 'assistant', questionsPayload)]);
    expect(body.messages[0]?.payload).toStrictEqual(questionsPayload as never);
  });

  it('should serialise a cards payload without dropping its cards or filter rejections', async () => {
    const body = await serve([row(2, 'assistant', cardsPayload)]);
    expect(body.messages[0]?.payload).toStrictEqual(cardsPayload as never);
  });

  it('should serialise a readiness payload without dropping its entries', async () => {
    const body = await serve([row(2, 'assistant', readinessPayload)]);
    expect(body.messages[0]?.payload).toStrictEqual(readinessPayload as never);
  });

  it('should omit the payload of a prose-only message', async () => {
    const body = await serve([row(1, 'user', null), row(2, 'assistant', undefined)]);
    expect(body.messages[0]).not.toHaveProperty('payload');
    expect(body.messages[1]).not.toHaveProperty('payload');
  });

  it('should serialise a legacy questions payload whose questions carry no select', async () => {
    const { select: _select, ...legacyQuestion } = questionsPayload.questions[0]!;
    const body = await serve([row(2, 'assistant', { ...questionsPayload, questions: [legacyQuestion] })]);
    expect(body.messages[0]?.payload).toStrictEqual(questionsPayload as never);
  });

  it('should fall back to single-select for a question id the bank no longer owns', async () => {
    const { select: _select, ...legacyQuestion } = questionsPayload.questions[0]!;
    const retired = { ...legacyQuestion, id: 'spark.retired' };
    const body = await serve([row(2, 'assistant', { ...questionsPayload, questions: [retired] })]);
    expect(body.messages[0]?.payload).toStrictEqual({ ...questionsPayload, questions: [{ ...retired, select: 'one' }] } as never);
  });

  it('should drop a payload of an unrecognised kind rather than fail the transcript', async () => {
    const body = await serve([row(2, 'assistant', { kind: 'diverge', cards: [] })]);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).not.toHaveProperty('payload');
  });
});
