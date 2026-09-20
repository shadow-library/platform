import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BibleStageOutput, BibleStageSchema } from '../../schemas/new-novel.schema';
import { AUTHORING_STYLE_PLANNING, BIBLE_STAGE_OUTPUT_SHAPE } from '../authoring-preamble';
import { type PromptModule } from '../types';
import { renderStageContract, validateStageCoverage } from './stage-contract';

const system = `${AUTHORING_STYLE_PLANNING}\n\nGenerate the cast bible document. Name the protagonist, the antagonist, and the supporting cast, and map the relationships that generate conflict between them. For each: role, brief physical description, personality made concrete (how they speak, what they want, what they fear), ability as the established power system defines it, backstory only where it shapes present behaviour, and arc trajectory. This document is the ground truth for character voice — chapter authors reference it directly.\n\nPopulate each entity's \`body\` with a full card: voice and speech patterns, motivations, relationships, physical description, and the backstory beats that drive present behaviour. Write it as a standalone reference read on its own, richer than the stage prose above.\n\nAlso emit \`facts\` entries for canon established about these characters — including hidden truths a character embodies that the narrative has not yet revealed to the reader or to the rest of the cast. For every fact, especially a hidden one, populate \`terms\` with the words or phrases a deterministic scanner should flag if they leak into prose before the reveal. Use \`subjects\` for the entity keys the fact concerns, \`constraintNote\` for anything it forbids narration from stating outright, and \`revealChapter\` when the reveal point is already known.\n\n${renderStageContract('characters')}\n\n${BIBLE_STAGE_OUTPUT_SHAPE}`;

export const charactersPrompt: PromptModule<BibleStageOutput> = {
  key: 'bible:characters',
  version: '2.0.0',
  kind: 'authoring',
  role: 'bible',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'Foundation:\n{foundation}\nSetting:\n{world}\nPower system:\n{power}\nFactions and locations:\n{factionsAndLocations}\n\nProject brief:\n{projectBrief}'],
  ]),
  schema: BibleStageSchema,
  postValidate: data => validateStageCoverage('characters', data),
};
