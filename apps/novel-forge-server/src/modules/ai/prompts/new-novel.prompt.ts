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
import { AUTHORING_STYLE } from './authoring-preamble';
import { type PromptModule } from './types';
import { BibleStageSchema } from '../schemas/new-novel.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system = `${AUTHORING_STYLE}\n\nYou are a novel architect generating a bible section for a new serialized novel. You receive the project brief (premise, themes, tone, and instructions) and the outputs of earlier bible stages. Write the requested section as detailed, evocative prose that a chapter author can use as a reference. Be specific and concrete — avoid vague generalities.`;

export const newNovelPrompt: PromptModule<typeof BibleStageSchema._type> = {
  key: 'new-novel',
  version: '1.0.0',
  kind: 'authoring',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', 'Project brief:\n{projectBrief}\n\nSection to generate: {section}\n\nEarlier stages:\n{priorSections}'],
  ]),
  schema: BibleStageSchema,
};
