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
import { ReviewSchema } from '../schemas/review.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system =
  'You are an editorial reviewer for a serialized novel chapter. You receive the chapter draft, the brief it was written against, and the established canon. Evaluate: does the chapter fulfill its brief objectives? Does it maintain canon? Is the prose quality consistent with the established style? Rate each issue as blocking (must revise) or suggestion (would strengthen). If the chapter meets its brief and maintains canon, approve it.';

export const reviewPrompt: PromptModule<typeof ReviewSchema._type> = {
  key: 'review',
  version: '1.0.0',
  kind: 'analytical',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{contextPack}\n\nChapter brief:\n{chapterBrief}\n\nChapter draft:\n{draftBody}'],
  ]),
  schema: ReviewSchema,
};
