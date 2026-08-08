import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { renderOpVocabulary, validateChangeSet } from '../../refinement/change-set';
import { type ChapterExtractOutput, ChapterExtractSchema } from '../schemas/chapter-extract.schema';
import { type PromptModule } from './types';

const ALLOWED_OPS = ['entity.upsert', 'entity.remove', 'bible_document.upsert', 'bible_document.remove'] as const;

const system =
  'You are a canon extractor for a serialized web novel. You receive the current story-bible context and the prose of one chapter. Identify the canon this chapter ESTABLISHES OR CHANGES — new or changed characters, factions, locations, items, power rules, and durable world/plot facts — and return a changeSet that folds only that new canon back into the bible. Do NOT restate facts the bible already holds; include an op only when the chapter genuinely adds or changes something. Ground every entity field and document body strictly in what the chapter shows, never inventing beyond it. When the chapter introduces nothing new, return an empty changeSet. Nothing is applied until the author approves.\n\n' +
  renderOpVocabulary([...ALLOWED_OPS]) +
  '\n\nRespond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"summary": "one line on the new canon, or empty", "changeSet": [ops]}';

export const chapterExtractPrompt: PromptModule<ChapterExtractOutput> = {
  key: 'chapter-extract',
  version: '1.0.0',
  kind: 'analytical',
  role: 'extraction',
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', '{contextPack}'], ['human', 'Chapter {chapterNumber} prose:\n{chapterProse}']]),
  schema: ChapterExtractSchema,
  postValidate: data => (data.changeSet.length === 0 ? [] : validateChangeSet(data.changeSet, [...ALLOWED_OPS])),
};
