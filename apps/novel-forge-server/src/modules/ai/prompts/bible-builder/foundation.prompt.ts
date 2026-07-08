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

const system = `${AUTHORING_STYLE}\n\nGenerate the foundation bible document for a new novel. The foundation covers: the core premise (what the story is fundamentally about), the central conflict (the force that drives the narrative), the world's hook (what makes this world distinct), and the authorial intent (theme and emotional truth). Write as concrete prose, not bullet points. This is the anchor document — every other section must be consistent with it.\n\n${BIBLE_STAGE_OUTPUT_SHAPE}`;

export const foundationPrompt: PromptModule<BibleStageOutput> = {
  key: 'bible:foundation',
  version: '1.1.0',
  kind: 'authoring',
  role: 'bible',
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', 'Project brief:\n{projectBrief}']]),
  schema: BibleStageSchema,
};
