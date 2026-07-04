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
import { PlanSchema } from '../schemas/plan.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system =
  'You are a serialized novel planner. Given the novel skeleton (character arcs and power curve), the target volume count, and chapters_per_volume, produce a volume plan. Each volume is a self-contained arc with a clear objective, central conflict, and payoff. Volumes must together fulfill all major character arcs and the power curve trajectory. Chapter spans must be contiguous. Volumes should escalate in stakes.';

export const planPrompt: PromptModule<typeof PlanSchema._type> = {
  key: 'plan',
  version: '1.0.0',
  kind: 'analytical',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', 'Novel skeleton:\n{skeleton}\n\nTarget: {volumeCount} volumes, {chaptersPerVolume} chapters each.\nBrief: {projectBrief}'],
  ]),
  schema: PlanSchema,
};
