import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type EpitomeOutput, EpitomeSchema } from '../schemas/epitome.schema';
import { type PromptModule } from './types';

const system =
  "You are distilling a completed volume of a serialized novel into its epitome — the single paragraph a later volume's planner reads instead of the volume's chapters. You receive the volume plan and the summaries of every chapter in it, in order.\n\n" +
  'Record only what still matters after the volume ends: the arc it resolved, the state each major character was left in, what changed permanently in the world or power structure, and every thread it deliberately left open. Omit scene-level detail, prose flourishes, and anything a later volume would not need to stay consistent.\n\n' +
  'Write about 200 tokens (roughly 150 words) of plain declarative past-tense prose — no headings, no lists.\n\n' +
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape: {"epitome": "..."}';

export const epitomePrompt: PromptModule<EpitomeOutput> = {
  key: 'epitome',
  version: '1.0.0',
  kind: 'analytical',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'Volume plan:\n{volumePlan}\n\nChapter summaries (chapters {startChapter}-{endChapter}):\n{chapterSummaries}'],
  ]),
  schema: EpitomeSchema,
};
