import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BibleStageOutput, BibleStageSchema } from '../schemas/new-novel.schema';
import { AUTHORING_STYLE_PLANNING, BIBLE_STAGE_OUTPUT_SHAPE } from './authoring-preamble';
import { type PromptModule } from './types';

const system = `${AUTHORING_STYLE_PLANNING}\n\nYou are a novel architect generating a bible section for a new serialized novel. You receive the project brief (premise, themes, tone, and instructions) and the outputs of earlier bible stages. Write the requested section as detailed, evocative prose that a chapter author can use as a reference. Be specific and concrete — avoid vague generalities.\n\n${BIBLE_STAGE_OUTPUT_SHAPE}`;

export const newNovelPrompt: PromptModule<BibleStageOutput> = {
  key: 'new-novel',
  version: '1.1.0',
  kind: 'authoring',
  role: 'bible',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'Project brief:\n{projectBrief}\n\nSection to generate: {section}\n\nEarlier stages:\n{priorSections}'],
  ]),
  schema: BibleStageSchema,
};
