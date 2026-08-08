import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type ContinuityOutput, ContinuitySchema } from '../schemas/continuity.schema';
import { type PromptModule } from './types';

const system =
  'You are analyzing a grok-generated chapter (written by a human author or imported from a source novel) to extract continuity data for the bible. You receive the chapter prose and the current knowledge base. Extract: which entities appeared, any new entities introduced, plot thread updates, mystery updates, timeline events, relationship updates, and power progression changes. Also write a chapter summary. This data will be staged for human review before applying to the bible.';

export const continuityPrompt: PromptModule<ContinuityOutput> = {
  key: 'continuity',
  version: '1.0.0',
  kind: 'analytical',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{contextPack}\n\nChapter {chapterNumber} prose:\n\n{chapterProse}'],
  ]),
  schema: ContinuitySchema,
};
