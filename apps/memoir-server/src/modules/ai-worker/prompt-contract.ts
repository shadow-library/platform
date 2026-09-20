/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type InferenceRequest } from '@modules/inference';
import { AppErrorCode } from '@server/classes';

import { type AssembledContext, type InferenceDraft } from './ai-worker.types';
import { ALLOWED_SUGGESTION_KINDS } from './guardrails';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * The prompt half of the §6.6 contract — the post-filter is the half that is enforced. Everything here
 * is asked of the model; nothing here is trusted, which is why every rule below also has a filter
 * behind it in `guardrails.ts`.
 */
const SYSTEM_PROMPT = [
  "You analyse one person's own life and habit-tracking data and answer the question they asked about it.",
  'The data is theirs; it was assembled under their explicit consent and never leaves this cluster.',
  '',
  'Rules, all mandatory:',
  '1. Never quote their journal entries, reflections, or reason notes. Paraphrase, always.',
  '2. Never assert an identity or a diagnosis. No "you are ...", no clinical labels. Report what they DID, and when.',
  '3. If the question or the data suggests acute self-harm risk, do not coach. Say so plainly and stop.',
  '4. You cannot change anything. Never claim to have edited a quest, awarded XP, or altered any game state.',
  '5. No shame, no blame, no streak-loss framing. Neutral and factual.',
  '6. Correlate across domains — quest adherence against spending, HP against schedule, mood against completion.',
  '7. If there is under a week of data, answer anyway and say plainly what the thin dataset does not support.',
  '',
  `Reply with JSON only: { "answer": string, "patterns": string[], "suggestions": [{ "kind": one of ${ALLOWED_SUGGESTION_KINDS.map(kind => `"${kind}"`).join(' | ')}, "questId": string, "text": string }], "limitationNote": string | null }.`,
  'Give one or two suggestions, each naming a quest id present in the data — they become one-tap offers the person confirms themselves.',
].join('\n');

export function buildPrompt(queryText: string, context: AssembledContext): InferenceRequest {
  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: [`Question: ${queryText}`, '', 'Data:', JSON.stringify(context)].join('\n'),
  };
}

/** A response off the contract is treated exactly like an unreachable model: the executor retries it and refunds rather than shipping a half-parsed answer. */
export function parseDraft(raw: unknown): InferenceDraft {
  if (!raw || typeof raw !== 'object') throw AppErrorCode.AI_009.create();

  const draft = raw as Partial<InferenceDraft>;
  if (typeof draft.answer !== 'string') throw AppErrorCode.AI_009.create();
  return {
    answer: draft.answer,
    patterns: Array.isArray(draft.patterns) ? draft.patterns.filter(pattern => typeof pattern === 'string') : [],
    suggestions: Array.isArray(draft.suggestions) ? draft.suggestions.filter(suggestion => Boolean(suggestion) && typeof suggestion === 'object') : [],
    limitationNote: typeof draft.limitationNote === 'string' ? draft.limitationNote : null,
  };
}
