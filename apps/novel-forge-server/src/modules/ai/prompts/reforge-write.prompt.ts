import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type ReforgeWriteOutput, ReforgeWriteSchema } from '../schemas/reforge.schema';
import { AUTHORING_STYLE } from './authoring-preamble';
import { type PromptModule } from './types';

const system =
  `${AUTHORING_STYLE}\n\n` +
  "You write one chapter of a novel FROM THE OUTLINE below, in your own high-quality prose. Unlike a copy-edit, this is a full re-authoring: the source was a rough machine translation, so you render every beat fresh in the house style above. Cover the outline beat for beat, in order — keep each beat's purpose, the emotional turn, and the meaning of every dialogue anchor — but choose your own words, rhythm, and imagery. The plot, characters, and dialogue meaning are the source's; the prose is yours.\n\n" +
  'Follow the WORLD NOTES and GLOSSARY EXACTLY: every listed source name or variant becomes its replacement, every time, and you never invent a second replacement for a name the glossary already maps. Any proper noun NOT in the glossary that you had to name goes in `discoveredNames` with the replacement you used, so future chapters stay consistent.\n\n' +
  'Remove all nationalism and all discrimination based on country, ethnicity, or skin color, and never reference real countries, nationalities, or cultures — rivalry, contempt, or pride can survive, but never framed on real-world lines.\n\n' +
  'If AUTHOR INSTRUCTIONS ask you to cut certain content (filler, subplots, problematic or repetitive material), drop it and repair the surrounding beat so the chapter still flows — a removed beat must not leave a seam. Record what you cut in `changes.removals`.\n\n' +
  'If a DIRECTIVES section is present, weave that thread in where it fits naturally, continuing whatever the CARRY STATE says is already in motion rather than restarting it; record insertions in `changes.addedScenes` and return the updated `carryState`. Report the notable renames in `changes.renames` and a note on how you raised the prose in `changes.proseNotes`.\n\n' +
  'If repair notes are present, this is a repair pass: fix exactly the listed issues and change nothing else.\n\n' +
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"title": string, "body": string, "summary": string, "discoveredNames": [{"sourceName": string, "variants": [string], "replacement": string, "category": "character|place|country|culture|faction|technique|item|term", "notes": string}], "changes": {"renames": [string], "removals": [string], "addedScenes": [string], "proseNotes": string}, "carryState": {"activeThreads": string, "lastInsertedBeat": string, "pendingSetups": string}}';

// The message layout is the caching contract (refinement design §10.2): static system, then the stable
// pack (world notes + directives + author instructions) in the first human message, volatile outline last.
export const reforgeWritePrompt: PromptModule<ReforgeWriteOutput> = {
  key: 'reforge-write',
  version: '1.0.0',
  kind: 'authoring',
  role: 'reforge',
  cacheStrategy: { stableVars: ['contextPack'] },
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', '{contextPack}'],
    ['human', 'Faithful outline to write from:\n{outline}\n\nRepair notes: {repairNotes}'],
  ]),
  schema: ReforgeWriteSchema,
};
