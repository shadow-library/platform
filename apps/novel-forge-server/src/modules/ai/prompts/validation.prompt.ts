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
import { ValidationSchema } from '../schemas/validation.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system =
  'You are a novel validation analyst. You receive the complete canon state (chapter summaries, entity tracker, plot threads, mysteries, world facts, timeline, power progression) and must identify continuity errors, timeline contradictions, character inconsistencies, unresolved threads that should be resolved, and power scaling violations. Classify each issue as error (must fix before publication) or warning (should review). Be specific: cite the conflicting chapters or tracker entries.';

export const validationPrompt: PromptModule<typeof ValidationSchema._type> = {
  key: 'validation',
  version: '1.0.0',
  kind: 'analytical',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', 'Validation scope: {scope}\n\n{contextPack}'],
  ]),
  schema: ValidationSchema,
};
