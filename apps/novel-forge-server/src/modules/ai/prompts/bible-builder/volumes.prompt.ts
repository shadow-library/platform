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
import { type BibleStageOutput, BibleStageSchema } from '../../schemas/new-novel.schema';
import { AUTHORING_STYLE } from '../authoring-preamble';
import { type PromptModule } from '../types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system = `${AUTHORING_STYLE}\n\nGenerate the volumes overview document. For each planned volume: what arc it covers, the central antagonist force for that volume, the protagonist's emotional state at the start and end, and the power-level benchmarks. This is prose, not a plan (the planner generates the structured plan separately) — write it as an author's guide to the novel's shape.`;

export const volumesPrompt: PromptModule<BibleStageOutput> = {
  key: 'bible:volumes',
  version: '1.0.0',
  kind: 'authoring',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', 'Foundation:\n{foundation}\nPlot:\n{plot}\nCharacters:\n{characters}\n\nProject brief:\n{projectBrief}'],
  ]),
  schema: BibleStageSchema,
};
