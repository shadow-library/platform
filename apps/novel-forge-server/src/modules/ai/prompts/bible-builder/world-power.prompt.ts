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
  'Generate the world and power system bible document. Cover: the geography and geopolitical structure (only what matters to the plot), the power system (rules, costs, limits, and how it affects society), and the magic/technology ecosystem. Be specific enough that a chapter author knows exactly what characters can and cannot do. Contradictions in the power system are the most expensive bugs to fix — be precise.';

export const worldPowerPrompt: PromptModule<typeof BibleStageSchema._type> = {
  key: 'bible:world-power',
  version: '1.0.0',
  kind: 'analytical',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', 'Foundation:\n{foundation}\n\nProject brief:\n{projectBrief}'],
  ]),
  schema: BibleStageSchema,
};
