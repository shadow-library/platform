import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BibleStageOutput, BibleStageSchema } from '../../schemas/new-novel.schema';
import { AUTHORING_STYLE_PLANNING, BIBLE_STAGE_OUTPUT_SHAPE } from '../authoring-preamble';
import { type PromptModule } from '../types';
import { renderStageContract, validateStageCoverage } from './stage-contract';

const system = `${AUTHORING_STYLE_PLANNING}\n\nGenerate the volume plan overview. For each planned volume: its objective, the arc it covers, the central antagonist force, the conflict it raises and the payoff it owes the reader by its end, the protagonist's emotional state entering and leaving it, and the power-level benchmarks. This is prose, not a structured plan (the planner generates that separately) — write it as an author's guide to the novel's shape.\n\n${renderStageContract('volumes')}\n\n${BIBLE_STAGE_OUTPUT_SHAPE}`;

export const volumesPrompt: PromptModule<BibleStageOutput> = {
  key: 'bible:volumes',
  version: '2.0.0',
  kind: 'authoring',
  role: 'bible',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'Foundation:\n{foundation}\nEscalation map:\n{plot}\nCast:\n{characters}\n\nProject brief:\n{projectBrief}'],
  ]),
  schema: BibleStageSchema,
  postValidate: data => validateStageCoverage('volumes', data),
};
