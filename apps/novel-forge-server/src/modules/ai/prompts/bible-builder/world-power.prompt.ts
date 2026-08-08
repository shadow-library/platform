import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BibleStageOutput, BibleStageSchema } from '../../schemas/new-novel.schema';
import { AUTHORING_STYLE, BIBLE_STAGE_OUTPUT_SHAPE } from '../authoring-preamble';
import { type PromptModule } from '../types';

const system = `${AUTHORING_STYLE}\n\nGenerate the world and power system bible document. Cover: the geography and geopolitical structure (only what matters to the plot), the power system (rules, costs, limits, and how it affects society), and the magic/technology ecosystem. Be specific enough that a chapter author knows exactly what characters can and cannot do. Contradictions in the power system are the most expensive bugs to fix — be precise.\n\n${BIBLE_STAGE_OUTPUT_SHAPE}`;

export const worldPowerPrompt: PromptModule<BibleStageOutput> = {
  key: 'bible:world-power',
  version: '1.1.0',
  kind: 'authoring',
  role: 'bible',
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', 'Foundation:\n{foundation}\n\nProject brief:\n{projectBrief}']]),
  schema: BibleStageSchema,
};
