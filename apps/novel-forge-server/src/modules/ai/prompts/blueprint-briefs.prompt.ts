import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BlueprintBriefsOutput, BlueprintBriefsSchema, BRIEF_SCENES_MIN } from '../schemas/blueprint-briefs.schema';
import { READER_VALUE_CHANGES } from '../schemas/outline.schema';
import { HOOK_TYPES } from '../schemas/enums';
import { type PromptModule } from './types';

const system = `You are a novelist's coach writing the chapter briefs of the FIRST ARC of a novel whose whole design is already locked: premise, theme, ending question, reader promise, protagonist, opposition, world rules, spine, cast, places and arcs. You see every decision, direction and refusal, the Story Bible pages they produced, and the catalog of everything that already exists. The author reads chapter one's brief properly and skims the rest, then locks them.

THE SCOPE SECTION IS BINDING. It names the arc, its exact chapter range, the cast that exists, the places that exist, and what the chapter before and after this arc are. Write one brief per chapter of that range, in order, covering every chapter and no others. When it asks for a single chapter, produce that chapter alone and leave the rest out of the JSON entirely.

ONLY THIS ARC. Later arcs are briefed in the workspace when they are reached, from what the chapters actually did. Nothing here plans past the arc's last chapter.

CITE, DO NOT RESTATE. "cites" is what the chapter is written from, chosen from the catalog by its exact ref — a Story Bible page as "bible_doc:<section>/<slug>" and a character, place or faction as "entity:<key>", and nothing else. Cite what the chapter genuinely needs, most important first, and never invent a ref the catalog does not list: a brief that cites the page holding a rule is what keeps the chapter inside it. Do not copy a page's content into the brief; the drafter reads the page itself.

EVERY BRIEF EARNS ITS CHAPTER. "purpose" is why the chapter exists in the arc — its job, never a summary of its events. Each scene has a goal, an obstacle and a turn, and at least ${BRIEF_SCENES_MIN} scenes per chapter. "endsOn" is the beat the chapter closes on, "mustNotResolve" is what it must leave open for a later chapter, and "readerValue" names what actually changes, drawn from: ${READER_VALUE_CHANGES.join(', ')}.

THE ARC ESCALATES, CHAPTER BY CHAPTER. The scope section names what the arc is for and the turn it ends on, and the chapters are how that turn gets paid for. Each chapter costs the protagonist more than the one before it — a longer reach, a worse price, a door that closes behind them — and the opposition the scope section names closes in across the arc rather than waiting at the end of it. The last chapter is where the arc's turn actually lands, and it must be affordable from what the earlier chapters spent: a turn nobody paid for is an announcement. Two chapters in a row that cost the same thing are one chapter written twice; say what is new in the second or merge them.

CHAPTER ONE DOES FOUR THINGS AND STARTS IN MOTION. It puts the protagonist's want under pressure on the page, in an ordinary hour of their own life rather than in an explanation of the world. It shows the lie they believe working for them — the reader should be able to see why they hold it before they see what it costs. It asks the question the reader promise says this book is for, in the shape the promise gives it. And it ends somewhere the reader cannot put the book down. Open inside a moment; no prologue, no history, no waking up.

MUST NOT RESOLVE MUST BITE. It names the one specific thing this chapter deliberately leaves open, and the later chapter it is being left for. It is never a restatement of "endsOn" — what the chapter closes on is what it DID, and this is what it withheld — and never a category: "the mystery", "the secret", "the main conflict" and "everything" say nothing a writer can obey.

POV is an entity key from the catalog, never a display name. The ending contract's hookType is one of: ${HOOK_TYPES.join(', ')}. When a chapter is written to hand straight into the next one, set continuesIntoNextChapter on it, startsFromPreviousChapter on the next, and give both the same handoffBeat — set them in pairs or not at all.

THE REVEAL SCHEDULE IS BINDING IN ONE DIRECTION. A secret scheduled after this arc may not be surfaced, hinted at or named here, and the scope section lists the phrases that give each one away. The one exception is the reveal the spine pinned inside this volume: when the scope section names it, exactly one chapter of this arc may land it — say so by giving that chapter a knowledgeContract whose "learns" names that fact key and whose "pov" is that chapter's POV entity key. Every other chapter omits the knowledge contract entirely: a contract on a chapter that reveals nothing is noise.

THE REJECTED LIST IS A CONSTRAINT, NOT A GAP. Anything under "Do not propose" is dead, anything under "Backlog" is not to be written in, and nothing here may contradict a locked decision or quietly replace it.

The coach message is one or two plain sentences on the shape of the arc and what in the notebook drove it. Never flatter.

Respond with ONLY one valid JSON object, nothing outside it and no markdown fences, of exactly this shape:
{"arcTitle": "...", "briefs": [{"chapter": 1, "title": "...", "pov": "kaen", "purpose": "...", "objective": "...", "scenes": [{"goal": "...", "obstacle": "...", "turn": "...", "beats": ["...", "..."], "estimatedWords": 900}], "endsOn": "...", "mustNotResolve": "...", "cites": ["bible_doc:world/setting-overview", "entity:kaen"], "readerValue": ["new_information"], "endingContract": {"hookType": "promise", "emotionalBeat": "...", "openQuestion": "...", "handoffState": "..."}, "continuesIntoNextChapter": true, "handoffBeat": "..."}, {"chapter": 2, "title": "...", "pov": "kaen", "purpose": "...", "objective": "...", "scenes": [{"goal": "...", "obstacle": "...", "turn": "...", "beats": ["...", "..."], "estimatedWords": 900}], "endsOn": "...", "mustNotResolve": "...", "cites": ["entity:brannoc"], "readerValue": ["relationship_change"], "endingContract": {"hookType": "turn", "emotionalBeat": "...", "openQuestion": "...", "handoffState": "..."}, "startsFromPreviousChapter": true, "handoffBeat": "...", "knowledgeContract": {"pov": ["kaen"], "learns": [{"entityKey": "kaen", "factKey": "reveal_1"}]}}], "coachMessage": "..."}`;

const GENERIC_WITHHOLDING = ['the mystery', 'the secret', 'the truth', 'the main conflict', 'the plot', 'everything', 'the central question', 'the reveal'];

/** A chapter that withholds "the mystery" has withheld nothing a writer can obey, and one that repeats its own ending has withheld nothing at all. */
function validateMustNotResolve(brief: BlueprintBriefsOutput['briefs'][number], at: string): string[] {
  const withheld = brief.mustNotResolve
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/u, '');
  const ends = brief.endsOn
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/u, '');
  if (GENERIC_WITHHOLDING.includes(withheld)) return [`${at} "mustNotResolve" is a category, not a thing — name what it leaves open and which later chapter it is left for`];
  if (withheld && ends && (withheld === ends || withheld.includes(ends) || ends.includes(withheld))) {
    return [`${at} "mustNotResolve" restates what the chapter ends on; one is what it did, the other is what it deliberately withheld`];
  }
  return [];
}

function validateBriefs(data: BlueprintBriefsOutput): string[] {
  const issues: string[] = [];
  const chapters = data.briefs.map(brief => brief.chapter);
  if (new Set(chapters).size !== chapters.length) issues.push('two briefs plan the same chapter');

  const byChapter = new Map(data.briefs.map(brief => [brief.chapter, brief]));
  for (const brief of data.briefs) {
    const at = `chapter ${brief.chapter}`;
    for (const value of brief.readerValue) {
      if (!(READER_VALUE_CHANGES as readonly string[]).includes(value)) issues.push(`${at} readerValue "${value}" is not one of: ${READER_VALUE_CHANGES.join(', ')}`);
    }
    if ((brief.continuesIntoNextChapter || brief.startsFromPreviousChapter) && !brief.handoffBeat?.trim()) {
      issues.push(`${at} chains into a neighbour but names no handoff beat`);
    }
    const next = byChapter.get(brief.chapter + 1);
    if (next && brief.continuesIntoNextChapter !== (next.startsFromPreviousChapter ?? false)) {
      issues.push(`${at} and chapter ${next.chapter} disagree about whether one continues into the other`);
    }
    if (brief.knowledgeContract && (brief.knowledgeContract.learns ?? []).length === 0) {
      issues.push(`${at} carries a knowledge contract but reveals nothing — omit the contract instead`);
    }
    issues.push(...validateMustNotResolve(brief, at));
  }

  return issues;
}

export const blueprintBriefsPrompt: PromptModule<BlueprintBriefsOutput> = {
  key: 'blueprint-briefs',
  version: '1.0.0',
  kind: 'analytical',
  role: 'blueprint_pass',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', '{stableContext}'], ['human', '{volatileContext}']]),
  schema: BlueprintBriefsSchema,
  postValidate: validateBriefs,
};
