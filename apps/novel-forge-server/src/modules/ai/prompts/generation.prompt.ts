/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Importing user defined packages
 */
import { AUTHORING_STYLE } from './authoring-preamble';
import { type PromptModule } from './types';
import { type GenerationOutput, GenerationSchema } from '../schemas/generation.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system = `${AUTHORING_STYLE}\n\nYou are a skilled author writing a chapter of a serialized novel. You receive a context pack containing established canon (characters, world facts, active plot threads, open mysteries, recent chapter summaries, and — critically — the previous chapter's actual ending and continuation state) and a chapter brief specifying the chapter's objectives, required events, and handoff instructions. Write the chapter's scene content that: fulfills the brief's objectives, maintains strict continuity with established canon, and advances at least one active plot thread. Do not resolve mysteries or change power levels unless the brief specifies it.

Whether the chapter should resolve or continue is decided by the brief, not by you:
- If the brief marks "[CONTINUES INTO NEXT CHAPTER]", do not resolve the chapter's central conflict, question, or action. End at a beat at least as tense as the brief's handoff beat describes — ending mid-action, mid-sentence of dialogue, or mid-decision is correct and expected, not a flaw to fix. Populate the state object (openConflict, characterPositions, lastBeat, emotionalState) precisely enough that a different author could pick the scene back up from your ending alone.
- If the brief marks "[STARTS FROM PREVIOUS CHAPTER]", open in the exact physical and emotional moment described in the "## CONTINUATION STATE" / "## PREVIOUS CHAPTER ENDING" sections — no time skip, no re-establishing shot, no recap of what just happened.
- Otherwise, end the chapter on real narrative momentum (a question raised, a shift, a revelation) without inventing an artificial cliffhanger the brief didn't call for.`;

export const generationPrompt: PromptModule<GenerationOutput> = {
  key: 'generation',
  version: '1.0.0',
  kind: 'authoring',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{contextPack}\n\nChapter brief:\n{chapterBrief}\n\nAdditional guidance: {guidance}'],
  ]),
  schema: GenerationSchema,
};
