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
import { type SkeletonOutput, SkeletonSchema } from '../schemas/skeleton.schema';
import { type PromptModule } from './types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system =
  'You are a novel architect generating a high-level story skeleton from a project brief. The skeleton defines the character development arcs and power progression curve for the entire novel, giving the planner the trajectory to structure volumes around. Character arcs should be specific and complete: where each character starts emotionally/morally, the key events that change them, and where they end. The power curve should specify escalation points, setbacks, and the final power level relative to the world.';

export const skeletonPrompt: PromptModule<SkeletonOutput> = {
  key: 'skeleton',
  version: '1.0.0',
  kind: 'analytical',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', 'Project brief:\n{projectBrief}\n\nGenre and themes:\n{themes}'],
  ]),
  schema: SkeletonSchema,
};
