import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BibleStageOutput, BibleStageSchema } from '../../schemas/new-novel.schema';
import { AUTHORING_STYLE_PLANNING, BIBLE_STAGE_OUTPUT_SHAPE } from '../authoring-preamble';
import { type PromptModule } from '../types';
import { renderStageContract } from './stage-contract';

const system = `${AUTHORING_STYLE_PLANNING}\n\nGenerate the volume plan overview from what the author has given. Describe the opening volume: its goal, the part of the story it covers, the central opposing force (a person, a faction, or the situation itself), the conflict it raises and the payoff it owes the reader by its end, and the protagonist's state entering it. Add a later volume only when the project brief or the escalation map names it, and keep it to what they say; never invent later volumes or an ending to make the plan look complete. This is prose, not a structured plan — write it as an author's guide to the novel's shape so far.\n\n${renderStageContract('volumes')}\n\n${BIBLE_STAGE_OUTPUT_SHAPE}`;

export const volumesPrompt: PromptModule<BibleStageOutput> = {
  key: 'bible:volumes',
  version: '3.0.0',
  kind: 'authoring',
  role: 'bible',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'Foundation:\n{foundation}\nEscalation map:\n{plot}\nCast:\n{characters}\n\nProject brief:\n{projectBrief}'],
  ]),
  schema: BibleStageSchema,
};
