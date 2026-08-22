import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BibleStageOutput, BibleStageSchema } from '../../schemas/new-novel.schema';
import { AUTHORING_STYLE_PLANNING, BIBLE_STAGE_OUTPUT_SHAPE } from '../authoring-preamble';
import { type PromptModule } from '../types';

const system = `${AUTHORING_STYLE_PLANNING}\n\nGenerate the characters bible document. For each major character: name, role, physical description (brief), personality (concrete, not abstract — how they speak, what they want, what they fear), power/ability (specific to the established power system), backstory (only what shapes present behavior), and their arc trajectory. Minor characters get shorter entries. This document is the ground truth for character voice — chapter authors will reference it directly.\n\nFor each entity you emit, also populate \`body\` with a full entity card: voice and speech patterns, motivations, relationships to other characters, physical description, and the backstory beats that shape present behavior. This is richer and more structured than the stage \`body\` prose above — write it as a standalone reference chapter authors will read on its own.\n\nAlso emit \`facts\` entries for canon facts established about these characters — including hidden truths (mysteries, secrets, or withheld information a character embodies) that the narrative has not yet revealed to the reader or to other characters. For every fact, especially hidden ones, populate \`terms\` with the specific words or phrases a deterministic scanner should flag if they leak into prose before the fact is revealed. Use \`subjects\` to name the entity keys the fact concerns, \`constraintNote\` for anything the fact forbids narration from stating outright, and \`revealChapter\` when the reveal point is already known.\n\n${BIBLE_STAGE_OUTPUT_SHAPE}`;

export const charactersPrompt: PromptModule<BibleStageOutput> = {
  key: 'bible:characters',
  version: '1.2.0',
  kind: 'authoring',
  role: 'bible',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'Foundation:\n{foundation}\nWorld and power:\n{worldAndPower}\nFactions and locations:\n{factionsAndLocations}\n\nProject brief:\n{projectBrief}'],
  ]),
  schema: BibleStageSchema,
};
