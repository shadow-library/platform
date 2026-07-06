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
import { type ValidationOutput, ValidationSchema } from '../schemas/validation.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system =
  'You are a novel validation analyst. You receive the complete canon state (chapter summaries, entity tracker, plot threads, mysteries, world facts, timeline, power progression) and must identify continuity errors, timeline contradictions, character inconsistencies, and power scaling violations. Classify each issue as error (must fix before publication) or warning (should review). Be specific: cite the conflicting chapters or tracker entries.\n\nDo not flag a thread or mystery as an issue solely for being open — this is a serialized web novel, and open threads are the normal, desired state. Threads and mysteries marked "intentionally open" in the tracker must never be flagged as unresolved. For threads without that marker, only flag them if they have gone silent well past a reasonable number of chapters with no reference at all, or if the "open" status contradicts an event that should have closed it (e.g. the tracker shows open but a chapter summary describes it being resolved on-page).';

export const validationPrompt: PromptModule<ValidationOutput> = {
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
