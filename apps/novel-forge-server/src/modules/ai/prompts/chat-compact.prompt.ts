/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Importing user defined packages
 */
import { type PromptModule } from './types';
import { type ChatCompactOutput, ChatCompactSchema } from '../schemas/chat-refine.schema';

/**
 * Declaring the constants
 */

const system =
  'You compact a story-refinement conversation into a rolling summary the next turns can rely on. Fold the given transcript into the prior summary. Preserve, densely and factually: decisions the author accepted, directions explicitly rejected (and why), proposals still pending, and open questions. Drop pleasantries, restatements, and anything superseded by a later decision. The summary substitutes for the folded turns, so a wrong or missing fact here corrupts the whole conversation — be precise, never embellish.';

export const chatCompactPrompt: PromptModule<ChatCompactOutput> = {
  key: 'chat-compact',
  version: '1.0.0',
  kind: 'analytical',
  role: 'compact',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', 'Prior summary:\n{priorSummary}\n\nTranscript to fold in:\n{transcript}'],
  ]),
  schema: ChatCompactSchema,
};
