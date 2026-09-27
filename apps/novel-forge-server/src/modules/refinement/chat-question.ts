import { PROGRESS_ITEM_KEYS } from '@server/common';

import { clipAtBoundary } from '../ai/context/bible-docs';

export interface ChatQuestionAnswer {
  title: string;
  why?: string;
  tradeOff?: string;
  recommended?: boolean;
}

export interface ChatQuestion {
  question: string;
  why?: string;
  answers: ChatQuestionAnswer[];
  progressKey?: string;
}

const MIN_ANSWERS = 2;
const MAX_ANSWERS = 4;
const HISTORY_QUESTION_CHARS = 160;
const HISTORY_TITLE_CHARS = 60;

const NON_BLANK_TEXT = { type: 'string', minLength: 1 };

/** The card as a grammar-constrained reply must write it: the shape `sanitizeChatQuestion` keeps, which the loose in-band schema only describes. */
export const CHAT_QUESTION_WIRE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    question: NON_BLANK_TEXT,
    why: { type: 'string' },
    answers: {
      type: 'array',
      minItems: MIN_ANSWERS,
      maxItems: MAX_ANSWERS,
      items: {
        type: 'object',
        properties: { title: NON_BLANK_TEXT, why: { type: 'string' }, tradeOff: { type: 'string' }, recommended: { type: 'boolean' } },
        required: ['title'],
        additionalProperties: false,
      },
    },
    progressKey: { type: 'string', enum: [...PROGRESS_ITEM_KEYS] },
  },
  required: ['question', 'answers'],
  additionalProperties: false,
};

function isValidAnswer(answer: unknown): answer is { title: string; why?: unknown; tradeOff?: unknown; recommended?: unknown } {
  return typeof answer === 'object' && answer !== null && typeof (answer as { title?: unknown }).title === 'string' && (answer as { title: string }).title.trim().length > 0;
}

/**
 * The model's question card is schema-loose on purpose (see chat-refine.schema.ts) so a bad shape can never
 * fail ajv validation and take the reply or change-set down with it. This is where the real shape rules live:
 * a question without 2-4 titled answers is dropped whole, and a progressKey outside the checklist is dropped
 * on its own, keeping the rest of the card.
 */
export function sanitizeChatQuestion(candidate: unknown, allowedProgressKeys: readonly string[]): ChatQuestion | undefined {
  if (!candidate || typeof candidate !== 'object') return undefined;
  const raw = candidate as { question?: unknown; why?: unknown; answers?: unknown; progressKey?: unknown };
  if (typeof raw.question !== 'string' || raw.question.trim().length === 0) return undefined;
  if (!Array.isArray(raw.answers) || raw.answers.length < MIN_ANSWERS || raw.answers.length > MAX_ANSWERS) return undefined;
  if (!raw.answers.every(isValidAnswer)) return undefined;

  const answers: ChatQuestionAnswer[] = raw.answers.map(answer => ({
    title: answer.title,
    ...(typeof answer.why === 'string' ? { why: answer.why } : {}),
    ...(typeof answer.tradeOff === 'string' ? { tradeOff: answer.tradeOff } : {}),
    ...(answer.recommended === true ? { recommended: true } : {}),
  }));

  const progressKey = typeof raw.progressKey === 'string' && allowedProgressKeys.includes(raw.progressKey) ? raw.progressKey : undefined;

  return {
    question: raw.question,
    ...(typeof raw.why === 'string' ? { why: raw.why } : {}),
    answers,
    ...(progressKey ? { progressKey } : {}),
  };
}

/**
 * A short line for chat history so a later turn can refer to "the second option" without the whole card
 * riding every prompt. The stored value already went through sanitizeChatQuestion before it was written, but
 * this stays defensive since it reads straight off the jsonb column.
 */
export function renderQuestionForHistory(question: unknown): string | null {
  if (!question || typeof question !== 'object') return null;
  const raw = question as { question?: unknown; answers?: unknown };
  if (typeof raw.question !== 'string' || raw.question.trim().length === 0) return null;

  const answers = Array.isArray(raw.answers) ? raw.answers : [];
  const titles = answers.flatMap(answer => {
    const title = (answer as { title?: unknown } | null)?.title;
    return typeof title === 'string' && title.trim().length > 0 ? [clipAtBoundary(title, HISTORY_TITLE_CHARS)] : [];
  });

  const asked = clipAtBoundary(raw.question, HISTORY_QUESTION_CHARS);
  return titles.length > 0 ? `[Asked: ${asked} — options: ${titles.join(' / ')}]` : `[Asked: ${asked}]`;
}
