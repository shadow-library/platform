/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Importing user defined packages
 */
import { type BibleStageOutput, BibleStageSchema } from '../../schemas/new-novel.schema';
import { AUTHORING_STYLE, BIBLE_STAGE_OUTPUT_SHAPE } from '../authoring-preamble';
import { type PromptModule } from '../types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system = `${AUTHORING_STYLE}\n\nGenerate the characters bible document. For each major character: name, role, physical description (brief), personality (concrete, not abstract — how they speak, what they want, what they fear), power/ability (specific to the established power system), backstory (only what shapes present behavior), and their arc trajectory. Minor characters get shorter entries. This document is the ground truth for character voice — chapter authors will reference it directly.\n\n${BIBLE_STAGE_OUTPUT_SHAPE}`;

export const charactersPrompt: PromptModule<BibleStageOutput> = {
  key: 'bible:characters',
  version: '1.1.0',
  kind: 'authoring',
  role: 'bible',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'Foundation:\n{foundation}\nWorld and power:\n{worldAndPower}\nFactions and locations:\n{factionsAndLocations}\n\nProject brief:\n{projectBrief}'],
  ]),
  schema: BibleStageSchema,
};
