import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BibleStageOutput, BibleStageSchema } from '../../schemas/new-novel.schema';
import { AUTHORING_STYLE_PLANNING, BIBLE_STAGE_OUTPUT_SHAPE } from '../authoring-preamble';
import { type PromptModule } from '../types';
import { renderStageContract, validateStageCoverage } from './stage-contract';

const system = `${AUTHORING_STYLE_PLANNING}\n\nGenerate the escalation map. Cover how the stakes grow volume over volume, from the opening conflict to the endgame the whole serial steers toward, and state that endgame plainly — the promise the story is ultimately keeping. Include the major turning points and how they tie character arcs to external events, the antagonist's plan and how the protagonist stumbles onto it, and the logic of the climactic confrontation. Focus on causality: why each major event follows from a character's decision. Do not outline individual chapters.\n\n${renderStageContract('plot')}\n\n${BIBLE_STAGE_OUTPUT_SHAPE}`;

export const plotPrompt: PromptModule<BibleStageOutput> = {
  key: 'bible:plot',
  version: '2.0.0',
  kind: 'authoring',
  role: 'bible',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'Foundation:\n{foundation}\nSetting:\n{world}\nPower system:\n{power}\nCast:\n{characters}\n\nProject brief:\n{projectBrief}'],
  ]),
  schema: BibleStageSchema,
  postValidate: data => validateStageCoverage('plot', data),
};
