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
  "Generate the foundation bible document for a new novel. The foundation covers: the core premise (what the story is fundamentally about), the central conflict (the force that drives the narrative), the world's hook (what makes this world distinct), and the authorial intent (theme and emotional truth). Write as concrete prose, not bullet points. This is the anchor document — every other section must be consistent with it.";

export const foundationPrompt: PromptModule<typeof BibleStageSchema._type> = {
  key: 'bible:foundation',
  version: '1.0.0',
  kind: 'analytical',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', 'Project brief:\n{projectBrief}'],
  ]),
  schema: BibleStageSchema,
};
