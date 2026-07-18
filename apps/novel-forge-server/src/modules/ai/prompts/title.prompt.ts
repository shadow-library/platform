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
import { type TitleOutput, TitleSchema } from '../schemas/title.schema';
import { type PromptModule } from './types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system =
  'You are titling a chapter of a serialized novel. Given the chapter summary and the style of existing chapter titles, produce a title that is evocative, thematically resonant, and consistent in length and style with the existing titles. The title should hint at the chapter\'s central event or turning point without spoiling it.\n\nRespond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape: {"title": "..."}';

export const titlePrompt: PromptModule<TitleOutput> = {
  key: 'title',
  version: '1.1.0',
  kind: 'analytical',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'Existing chapter titles (for style reference):\n{existingTitles}\n\nChapter summary:\n{chapterSummary}'],
  ]),
  schema: TitleSchema,
};
