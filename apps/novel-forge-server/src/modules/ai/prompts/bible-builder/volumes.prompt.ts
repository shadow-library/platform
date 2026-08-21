import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BibleStageOutput, BibleStageSchema } from '../../schemas/new-novel.schema';
import { AUTHORING_STYLE_PLANNING, BIBLE_STAGE_OUTPUT_SHAPE } from '../authoring-preamble';
import { type PromptModule } from '../types';

const system = `${AUTHORING_STYLE_PLANNING}\n\nGenerate the volumes overview document. For each planned volume: what arc it covers, the central antagonist force for that volume, the protagonist's emotional state at the start and end, and the power-level benchmarks. This is prose, not a plan (the planner generates the structured plan separately) — write it as an author's guide to the novel's shape.\n\n${BIBLE_STAGE_OUTPUT_SHAPE}`;

export const volumesPrompt: PromptModule<BibleStageOutput> = {
  key: 'bible:volumes',
  version: '1.1.0',
  kind: 'authoring',
  role: 'bible',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'Foundation:\n{foundation}\nPlot:\n{plot}\nCharacters:\n{characters}\n\nProject brief:\n{projectBrief}'],
  ]),
  schema: BibleStageSchema,
};
