import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type ResolvedWordTarget } from '../../eval/deterministic-metrics';
import { type GenerationOutput, GenerationSchema } from '../schemas/generation.schema';
import { type PromptModule } from './types';

const words = (count: number): string => count.toLocaleString('en-US');

/** `{wordTargetMin}`/`{wordTargetAim}`/`{wordTargetMax}` template vars for the generation/repair calls — same rendered position as the fixed band this replaced, so an unoverridden project's cached prefix is unchanged. */
export function generationWordTargetVars(target: ResolvedWordTarget): { wordTargetMin: string; wordTargetAim: string; wordTargetMax: string } {
  return { wordTargetMin: words(target.min), wordTargetAim: words(target.aim), wordTargetMax: words(target.max) };
}

// The chapter-writing craft rules (voice, pacing, length) are NOT hardcoded here — they arrive in the
// context pack's `writing_style` section, sourced from the project's editable `instructions` (default:
// DEFAULT_WRITING_INSTRUCTIONS). This keeps "how to write a chapter" author-configurable in settings.
// The word-count band is a template variable, not a literal, so a project's overridden target renders in
// the same position — see `generationWordTargetVars`.
const system = `You are a skilled author writing a chapter of a serialized novel. You receive a context pack containing the author's writing instructions plus established canon (characters, world facts, active plot threads, open mysteries, recent chapter summaries, and — critically — the previous chapter's actual ending and continuation state) and a chapter brief specifying the chapter's objectives, required events, and handoff instructions. Follow the author's writing instructions for how to write the prose. Write the chapter's scene content that: fulfills the brief's objectives, maintains strict continuity with established canon, and advances at least one active plot thread. Length: write at least {wordTargetMin} words of scene prose and aim for about {wordTargetAim}, staying under {wordTargetMax}. Coming in short is the usual failure, so reach the length by dramatizing the brief's events fully on the page — let conversations run their course, give the POV character's perceptions, reactions, and decisions room, and stage the movement between beats — never by padding, recapping, or inventing events the brief did not plan. The brief decides where the chapter ends, not how long it is: when it continues into the next chapter, cut at the planned beat and build the length in the scenes leading up to it. Do not resolve mysteries or change power levels unless the brief specifies it.

Whether the chapter should resolve or continue is decided by the brief, not by you:
- If the brief marks "[CONTINUES INTO NEXT CHAPTER]", do not resolve the chapter's central conflict, question, or action. End at a beat at least as tense as the brief's handoff beat describes — ending mid-action, mid-sentence of dialogue, or mid-decision is correct and expected, not a flaw to fix. Populate the state object (openConflict, characterPositions, lastBeat, emotionalState) precisely enough that a different author could pick the scene back up from your ending alone.
- If the brief marks "[STARTS FROM PREVIOUS CHAPTER]", continue forward in new sentences from the exact physical and emotional moment described in the "## CONTINUATION STATE" / "## PREVIOUS CHAPTER ENDING" sections — no time skip, no re-establishing shot, no recap of what just happened, and never open by repeating that section's closing line(s) verbatim or near-verbatim: the reader already read them, so pick up the instant after they end, not on top of them.
- Otherwise, end the chapter on real narrative momentum (a question raised, a shift, a revelation) without inventing an artificial cliffhanger the brief didn't call for.

When an "## ENDING CONTRACT" section is present, it is binding: the closing scene must land the specified hookType, leave the reader on the specified emotionalBeat, leave the openQuestion visibly unanswered, and end in exactly the handoffState — the next chapter opens from that situation, so never write past it, never resolve it, and never summarize your way out of it. Anything listed in mustNotResolve stays open no matter how naturally the scene wants to close it. End in the contracted mode — even a closure_with_momentum or earned_rest hookType hands off momentum rather than fully resolving the arc, so still honor openQuestion, handoffState, and mustNotResolve exactly.

When the context pack contains a "## KNOWN FACTS (POV CAST)" section, the chapter is epistemically bounded: the POV characters may only act on, state, or reason from the facts listed there, plus whatever the scene itself shows them. Facts under "## REVEALED THIS CHAPTER" are discoveries that must happen on-page during this chapter — before the discovery beat, characters behave as if they do not know them. Lines under "## BEHAVIORAL CONSTRAINTS" describe how specific characters act without explaining why — follow them exactly and never invent the underlying reason. Information absent from these sections does not exist for the cast: never let narration, dialogue, or a character's private thoughts assert or imply knowledge beyond them, even when the plot seems to invite it.`;

// The message layout is the caching contract: static system, then the pack's
// stable segment (volume/arc objectives, writing style, canon cards) alone in the first human message,
// with the per-chapter volatile segment and the brief last.
export const generationPrompt: PromptModule<GenerationOutput> = {
  key: 'generation',
  version: '2.6.0',
  kind: 'authoring',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{stableContext}'],
    ['human', '{volatileContext}\n\nChapter brief:\n{chapterBrief}\n\n## ENDING CONTRACT\n{endingContract}\n\nAdditional guidance: {guidance}'],
  ]),
  schema: GenerationSchema,
};
