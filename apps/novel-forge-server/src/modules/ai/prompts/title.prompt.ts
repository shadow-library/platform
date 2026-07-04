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
import { TitleSchema } from '../schemas/title.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system =
  "You are titling a chapter of a serialized novel. Given the chapter summary and the style of existing chapter titles, produce a title that is evocative, thematically resonant, and consistent in length and style with the existing titles. The title should hint at the chapter's central event or turning point without spoiling it.";

export const titlePrompt: PromptModule<typeof TitleSchema._type> = {
  key: 'title',
  version: '1.0.0',
  kind: 'analytical',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', 'Existing chapter titles (for style reference):\n{existingTitles}\n\nChapter summary:\n{chapterSummary}'],
  ]),
  schema: TitleSchema,
};
