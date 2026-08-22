import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type ContinuityOutput, ContinuitySchema } from '../schemas/continuity.schema';
import { type PromptModule } from './types';

const system =
  'You are analyzing a grok-generated chapter (written by a human author or imported from a source novel) to extract continuity data for the bible. You receive the chapter prose and the current knowledge base. Extract: which entities appeared, any new entities introduced, plot thread updates, mystery updates, timeline events, relationship updates, power progression changes, character states, and knowledge changes. Also write a chapter summary. This data will be staged for human review before applying to the bible.\n\n' +
  'Character states: for any character whose state materially changed in this chapter, report their current location, physical/emotional conditions, immediate goal, and a one-line status note. Each state you report replaces the prior recorded state for that character — it is not merged or appended, so state only what is now true.\n\n' +
  'Knowledge changes: for anything a character newly came to know in this chapter, report which character learned which canon fact and how they learned it (e.g. read it in a letter, overheard it, was told directly).\n\n' +
  "Extract only what the prose establishes, with an evidence excerpt; empty arrays are correct. Do not speculate or infer state beyond what's textually supported — every characterStates entry must include the evidence excerpt that justifies it.";

export const continuityPrompt: PromptModule<ContinuityOutput> = {
  key: 'continuity',
  version: '1.1.0',
  kind: 'analytical',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{contextPack}\n\nChapter {chapterNumber} prose:\n\n{chapterProse}'],
  ]),
  schema: ContinuitySchema,
};
