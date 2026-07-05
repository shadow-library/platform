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

const system = `${AUTHORING_STYLE}\n\nGenerate the characters bible document. For each major character: name, role, physical description (brief), personality (concrete, not abstract — how they speak, what they want, what they fear), power/ability (specific to the established power system), backstory (only what shapes present behavior), and their arc trajectory. Minor characters get shorter entries. This document is the ground truth for character voice — chapter authors will reference it directly.`;

export const charactersPrompt: PromptModule<typeof BibleStageSchema._type> = {
  key: 'bible:characters',
  version: '1.0.0',
  kind: 'authoring',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', 'Foundation:\n{foundation}\nWorld and power:\n{worldPower}\nFactions and locations:\n{factionsLocations}\n\nProject brief:\n{projectBrief}'],
  ]),
  schema: BibleStageSchema,
};
