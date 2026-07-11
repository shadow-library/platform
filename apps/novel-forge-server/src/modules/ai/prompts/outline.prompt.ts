/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Importing user defined packages
 */
import { AUTHORING_STYLE } from './authoring-preamble';
import { type PromptModule } from './types';
import { type OutlineOutput, OutlineSchema } from '../schemas/outline.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system = `${AUTHORING_STYLE}\n\nYou are a chapter outliner for a serialized novel. You receive the current volume plan, the available context catalog (titles-only view of entities, threads, chapters, world facts, and mysteries available as context), and the volume's cast and objectives. Produce a brief for each chapter in the volume, including: title, objective, key events in order, required context refs (most important first — select from the catalog only, do not invent refs), and the POV character. The requiredContext ordering is the eviction priority — put most essential items first.

For each chapter, decide whether it resolves its central action or hands it off to the next chapter — this is a planning decision, not something to leave to the chapter author. Set continuesIntoNextChapter: true when the scene's tension, action, or conversation should still be live when the chapter ends; this is expected and desirable for serialized pacing, not a fallback. When you set it, populate handoffBeat with the specific moment where the next chapter must pick up — e.g. "mid-swing, blade an inch from the guard's throat," not "the fight continues." A chapter with startsFromPreviousChapter: true must open in the same physical/emotional moment the prior chapter's handoffBeat describes — no time skip, no cutaway, no summary past it. Do not mark every chapter as continuing — reserve it for action, dialogue, or confrontation beats that genuinely span more than one chapter's worth of prose; a chapter that completes its own beat should leave both flags false.

Every chapter also gets an endingContract — the binding specification of how it must end, so the chapter author never wraps up hurriedly or conclusively. Choose the hookType (cliffhanger, revelation, quiet_dread, promise, or turn) to vary across the span — five cliffhangers in a row numbs the reader. Make emotionalBeat the feeling of the last line, openQuestion the question that drags the reader into the next chapter, and handoffState the concrete situation the next chapter opens from — contracts must CHAIN: each chapter's handoffState is where the next chapter's opening stands. List in mustNotResolve any thread or mystery the ending is forbidden to close. When arc context is provided, the arc's final chapter inherits the arc's hook as its handoffState.\n\nRespond with ONLY one valid JSON array — nothing outside the JSON, no markdown fences — containing exactly one brief per chapter in the requested span (never an empty array), of exactly this shape:\n[{"chapter": 1, "volumeKey": "vol_01_...", "title": "...", "objective": "...", "events": ["..."], "requiredContext": ["entity:..."], "pov": "entity-key", "continuesIntoNextChapter": false, "startsFromPreviousChapter": false, "handoffBeat": "...", "endingContract": {"hookType": "cliffhanger|revelation|quiet_dread|promise|turn", "emotionalBeat": "...", "openQuestion": "...", "handoffState": "...", "mustNotResolve": ["..."]}}]`;

export const outlinePrompt: PromptModule<OutlineOutput> = {
  key: 'outline',
  version: '2.1.0',
  kind: 'authoring',
  system,
  template: ChatPromptTemplate.fromMessages([
    // The system text embeds a literal JSON example, so it must be a message instance — a
    // ['system', string] tuple would be parsed for {variables} and throw.
    new SystemMessage(system),
    ['human', 'Context catalog:\n{catalog}\n\nVolume plan:\n{volumePlan}\n\nChapters to outline: {startChapter}–{endChapter}\n\nAdditional guidance: {extraContext}'],
  ]),
  schema: OutlineSchema,
  // An empty array is schema-valid (root array) but means the model refused the task — reject it
  // so the repair ladder retries instead of reporting success with zero briefs.
  postValidate: briefs => (briefs.length === 0 ? ['outline must contain at least one chapter brief'] : []),
};
