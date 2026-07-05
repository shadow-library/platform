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
import { OutlineSchema } from '../schemas/outline.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system = `${AUTHORING_STYLE}\n\nYou are a chapter outliner for a serialized novel. You receive the current volume plan, the available context catalog (titles-only view of entities, threads, chapters, world facts, and mysteries available as context), and the volume's cast and objectives. Produce a brief for each chapter in the volume, including: title, objective, key events in order, required context refs (most important first — select from the catalog only, do not invent refs), and the POV character. The requiredContext ordering is the eviction priority — put most essential items first.`;

export const outlinePrompt: PromptModule<typeof OutlineSchema._type> = {
  key: 'outline',
  version: '1.0.0',
  kind: 'authoring',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', 'Context catalog:\n{catalog}\n\nVolume plan:\n{volumePlan}\n\nChapters to outline: {startChapter}–{endChapter}'],
  ]),
  schema: OutlineSchema,
};
