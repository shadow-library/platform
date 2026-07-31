/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Importing user defined packages
 */
import { type RecombineOutput, RecombineSchema } from '../schemas/recombine.schema';
import { type PromptModule } from './types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system =
  'You are reassembling a translated web novel whose original chapters were split into parts by the translator. You receive a list of boundaries between adjacent scraped chapters that deterministic title parsing could not decide. For each boundary you see both chapters’ numbers, titles, word counts, and the closing/opening prose around the cut. Verdict "merge" means the second chapter is a continuation of the same original chapter (the prose flows on mid-scene, the title repeats because it IS the same chapter, the halves are short); verdict "split" means they are genuinely different chapters (a scene or time break at the cut, a reused title, full-length chapters). When in doubt, answer split — a wrong merge is worse than a missed one. Return exactly one decision per listed boundary, using the given chapter numbers.\n\n' +
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"decisions": [{"afterChapter": number, "verdict": "merge|split"}]}';

export const recombinePrompt: PromptModule<RecombineOutput> = {
  key: 'recombine',
  version: '1.0.0',
  kind: 'analytical',
  role: 'skeleton',
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', 'Boundaries to decide:\n{boundaries}']]),
  schema: RecombineSchema,
};
