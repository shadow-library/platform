import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type RebrandConvertOutput, RebrandConvertSchema } from '../schemas/rebrand.schema';
import { AUTHORING_STYLE } from './authoring-preamble';
import { type PromptModule } from './types';

const system =
  `${AUTHORING_STYLE}\n\n` +
  'You rewrite one chapter of a translated Chinese web novel for a fictional alternate world, following the WORLD NOTES and GLOSSARY provided. Apply the glossary EXACTLY: every listed source name or variant becomes its replacement, every time, and you never invent a second replacement for a name the glossary already maps. Any proper noun NOT in the glossary that you had to rename goes in `discoveredNames` with the replacement you used, so future chapters stay consistent.\n\n' +
  'Remove all nationalism and all discrimination based on country, ethnicity, or skin color. Rewrite such passages so they still serve the same plot beat — rivalry, contempt, or pride can survive, but never framed on real-world national, ethnic, or racial lines — and never reference real countries, nationalities, or cultures.\n\n' +
  "Everything else is a light copy-edit, not a rewrite: fix misspelled names, dialogue or actions attributed to the wrong character, and translation-artifact grammar, and report the notable ones in `fixes`. Preserve the story content, scene order, dialogue meaning, pacing, and the source's own prose style — the style preamble above governs ONLY material you insert, never how you render existing prose.\n\n" +
  'If a DIRECTIVES section is present, weave that thread into the chapter where it fits naturally — new scenes are allowed and should continue whatever the CARRY STATE says is already in motion, never restart it. Report each insertion in `addedScenes` and return the updated `carryState`. No directives means no added scenes.\n\n' +
  'If repair notes are present, this is a repair pass: fix exactly the listed issues and change nothing else.\n\n' +
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"title": string, "body": string, "summaryOfChanges": string, "discoveredNames": [{"sourceName": string, "variants": [string], "replacement": string, "category": "character|place|country|culture|faction|technique|item|term", "notes": string}], "carryState": {"activeThreads": string, "lastInsertedBeat": string, "pendingSetups": string}, "fixes": [{"kind": "name|attribution|grammar", "detail": string}], "addedScenes": [{"placement": string, "purpose": string}]}';

// The message layout is the caching contract (refinement design §10.2): static system, then the stable
// pack (world notes + directives) in the first human message, volatile chapter material last.
export const rebrandConvertPrompt: PromptModule<RebrandConvertOutput> = {
  key: 'rebrand-convert',
  version: '1.1.0',
  kind: 'authoring',
  role: 'rebrand',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', '{stableContext}'],
    ['human', '{volatileContext}\n\nSource chapter to convert:\n{chapterProse}\n\nRepair notes: {repairNotes}'],
  ]),
  schema: RebrandConvertSchema,
};
