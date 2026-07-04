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
import { BibleStageSchema } from '../../schemas/new-novel.schema';
import { type PromptModule } from '../types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system =
  "Generate the plot bible document. Cover: the three-act structure at the novel level, the major turning points and how they connect character arcs to external events, the antagonist's plan and how the protagonist stumbles onto it, and the climactic confrontation logic. Focus on causality — why each major event follows from character decisions. Do not outline individual chapters.";

export const plotPrompt: PromptModule<typeof BibleStageSchema._type> = {
  key: 'bible:plot',
  version: '1.0.0',
  kind: 'analytical',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', 'Foundation:\n{foundation}\nWorld and power:\n{worldPower}\nCharacters:\n{characters}\n\nProject brief:\n{projectBrief}'],
  ]),
  schema: BibleStageSchema,
};
