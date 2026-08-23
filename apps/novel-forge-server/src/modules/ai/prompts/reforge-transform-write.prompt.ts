import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type ReforgeTransformWriteOutput, ReforgeTransformWriteSchema } from '../schemas/reforge-transform.schema';
import { AUTHORING_STYLE } from './authoring-preamble';
import { type PromptModule } from './types';

const system =
  `${AUTHORING_STYLE}\n\n` +
  'You write ONE chapter of a novel that is being re-authored from a longer, weaker original. The PLAN SPAN below tells you which source chapters this chapter is made from, which chapter of that span this is, and the beats it owes the reader. The plan was written and approved by the author: it is the only authority on what exists. Never add an output chapter, never split this one, never carry material into the next.\n\n' +
  'Cover every beat in KEPT BEATS — those are the contract, and a beat you leave out is a fault. Everything else in the source span is yours to compress, summarise in a line, or drop: this chapter is meant to be shorter and denser than its source, and cutting slack is the job, not a deviation. When the span gives you several source chapters, do not narrate them in sequence — write the chapter the beats add up to.\n\n' +
  'The CUT LEDGER lists material that no longer exists in this novel. It is not background you may allude to: those subplots, characters, arcs and running patterns were removed, and a reader has never seen them. Do not reference, recap, flash back to, or have a character remember any of it, even when the source prose in front of you is full of it. If writing this chapter forces you to cut something the ledger does not yet list, write it into `cutDelta` with the names a later chapter might use for it, so it stays cut.\n\n' +
  'When a BRIDGE ACROSS THE CUT is present, this chapter opens on the far side of a gap the reader will never see. Make the opening carry that gap on its own — time passed, the situation as it now stands — without explaining what was removed.\n\n' +
  'Follow the WORLD NOTES and GLOSSARY EXACTLY: every listed source name or variant becomes its replacement, every time. Any proper noun NOT in the glossary that you had to name goes in `discoveredNames`. Remove all nationalism and all discrimination based on country, ethnicity, or skin colour, and never reference real countries, nationalities, or cultures.\n\n' +
  'If repair notes are present, this is a repair pass: fix exactly the listed issues and change nothing else.\n\n' +
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"title": string, "body": string, "summary": string, "discoveredNames": [{"sourceName": string, "variants": [string], "replacement": string, "category": "character|place|country|culture|faction|technique|item|term", "notes": string}], ' +
  '"changes": {"renames": [string], "removals": [string], "addedScenes": [string], "proseNotes": string}, "carryState": {"activeThreads": string, "lastInsertedBeat": string, "pendingSetups": string}, ' +
  '"cutDelta": [{"label": string, "kind": "subplot|thread|entity|arc|running_gag|scene_pattern", "aliases": [string], "detail": string, "disposition": "cut|condensed|resolved_early", "replacementNote": string}]}';

// There is no outline node ahead of this prompt: the plan's kept beats ARE the outline, authored once
// and human-approved, which removes the only place the pipeline could silently re-introduce a cut beat
// (transform design §6.4). Cache order per refinement design §10.2: static system, stable pack, volatile
// span contract and source prose last.
export const reforgeTransformWritePrompt: PromptModule<ReforgeTransformWriteOutput> = {
  key: 'reforge-transform-write',
  version: '1.0.0',
  kind: 'authoring',
  role: 'reforge',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', '{stableContext}'],
    ['human', '{volatileContext}\n\nSource chapters for this span:\n{sourceProse}\n\nRepair notes: {repairNotes}'],
  ]),
  schema: ReforgeTransformWriteSchema,
};
