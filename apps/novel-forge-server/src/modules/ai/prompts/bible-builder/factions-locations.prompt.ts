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
import { AUTHORING_STYLE } from '../authoring-preamble';
import { type PromptModule } from '../types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system = `${AUTHORING_STYLE}\n\nGenerate the factions and locations bible document. For each major faction: its goals, methods, internal structure, and relationship to the protagonist and antagonist forces. For each major location: what it looks, sounds, and feels like, why it matters to the plot, and who controls it. Include only factions and locations that will appear in the story.`;

export const factionsLocationsPrompt: PromptModule<typeof BibleStageSchema._type> = {
  key: 'bible:factions-locations',
  version: '1.0.0',
  kind: 'authoring',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', 'Foundation:\n{foundation}\nWorld and power:\n{worldPower}\n\nProject brief:\n{projectBrief}'],
  ]),
  schema: BibleStageSchema,
};
