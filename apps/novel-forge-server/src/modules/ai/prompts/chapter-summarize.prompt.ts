import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type ChapterSummarizeOutput, ChapterSummarizeSchema } from '../schemas/chapter-summarize.schema';
import { type PromptModule } from './types';

const system =
  'You are summarizing a chapter written outside the standard generation pipeline (a paste-your-own-prose import, or prose from a permissive/unrestricted writer) so its content can reach the rest of the novel without exposing the prose itself to later chapters. You receive only the chapter prose.\n\n' +
  'Write a 2-3 sentence past-tense summary of what happened — the same kind of summary the standard pipeline produces for every other chapter.\n\n' +
  "Then populate the continuation state precisely enough that a different author could pick up the story from your state alone, with no access to this prose: the unresolved conflict or tension active at the chapter's end (if any), where each on-scene character physically ends up, the exact last action, line, or decision the story must resume from, and the POV character's emotional state at the cutoff. Leave a field out only when the chapter genuinely gives you nothing to report for it — do not invent detail the prose does not support.";

export const chapterSummarizePrompt: PromptModule<ChapterSummarizeOutput> = {
  key: 'chapter-summarize',
  version: '1.0.0',
  kind: 'analytical',
  role: 'continuity',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', 'Chapter prose:\n\n{chapterProse}'],
  ]),
  schema: ChapterSummarizeSchema,
};
