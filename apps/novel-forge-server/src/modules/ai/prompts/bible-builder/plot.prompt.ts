import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BibleStageOutput, BibleStageSchema } from '../../schemas/new-novel.schema';
import { AUTHORING_STYLE_PLANNING, BIBLE_STAGE_OUTPUT_SHAPE } from '../authoring-preamble';
import { type PromptModule } from '../types';
import { renderStageContract } from './stage-contract';

const system = `${AUTHORING_STYLE_PLANNING}\n\nGenerate the escalation map from what the author has given. Describe the opening conflict — the pressure the story starts under, who or what applies it, and why the protagonist cannot walk away — and how that pressure starts to build, with the causality behind it: why each early turn follows from a character's decision. Record later turning points, later volumes, an opponent's plan or an ending only when the project brief or the earlier sections contain them, and keep them to what those say. Never invent an endgame, a climactic confrontation or later volumes the author has not given: an open-ended map is a complete one. Do not outline individual chapters.\n\n${renderStageContract('plot')}\n\n${BIBLE_STAGE_OUTPUT_SHAPE}`;

export const plotPrompt: PromptModule<BibleStageOutput> = {
  key: 'bible:plot',
  version: '3.0.0',
  kind: 'authoring',
  role: 'bible',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'Foundation:\n{foundation}\nSetting:\n{world}\nPower system:\n{power}\nCast:\n{characters}\n\nProject brief:\n{projectBrief}'],
  ]),
  schema: BibleStageSchema,
};
