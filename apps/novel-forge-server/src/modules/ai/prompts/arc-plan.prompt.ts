import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { findArcRevealViolations, renderRevealViolation, type ScheduledReveal } from '../context/canon-guard';
import { type ArcPlanOutput, ArcPlanSchema, validateArcContiguity, validateArcCoverage } from '../schemas/arc-plan.schema';
import { AUTHORING_STYLE_PLANNING, EDIT_BY_DELETION } from './authoring-preamble';
import { type PromptModule } from './types';

const system = `${AUTHORING_STYLE_PLANNING}\n\n${EDIT_BY_DELETION}\n\nYou are a senior web novelist planning the arcs of one volume. You receive the volume (objective, conflict, payoff, cast, chapter range), the premise, the previous volume's handoff hook, the next volume's objective, the context catalog, and the bible documents that govern the story — premise, reader promise, plot, world and power — each cut to fit, so a document may stop early. Build the arcs on what those documents establish rather than on the catalog's one-line descriptions alone. Partition the volume's chapters into arcs: contiguous, non-overlapping blocks that together cover the range EXACTLY — the first arc starts at the volume's first chapter, the last arc ends at its last chapter, no gaps.\n\nDecide the arc count from the material unless one is requested. Each arc needs its own objective, a real escalation over the previous arc, a payoff, and a hook — a specific moment that hands off to the next arc (the final arc's hook hands off to the next volume). Where the volume's material is thin for its chapter count, EXPAND rather than pad: weave in subplots, character development beats, and world-building payoffs that serve the premise and the author's vision, and surface them in each arc's ideas list so the author can pick materials. Cast per arc: only the entities that arc actually serves. Use only entityKeys listed in the catalog's ENTITIES section, written exactly as listed — never a canon fact key, a thread key, a document ref or a display name; any other entry is dropped from the cast.\n\nThe catalog's REVEAL SCHEDULE is binding: an arc that ends before a fact's reveal chapter must not surface that fact — not in its objective, escalation, payoff, hook, body or ideas, and not by writing its key or any of the words listed after "never name". Plan each reveal into the arc whose range contains its chapter, and never pull one forward to make an earlier arc more eventful. The catalog's HARD LIMITS are the power system's and the world's rules as written: no arc may have a character do what a limit forbids — a limit on direction, range, cost, rank or who may use it binds exactly as stated, and a workaround the limit does not grant is a break.\n\nRespond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:
{"arcs": [{"arcKey": "<snake_case id>", "title": "...", "objective": "...", "escalation": "...", "payoff": "...", "hook": "...", "chapterStart": <int>, "chapterEnd": <int>, "cast": ["entityKey"], "body": "...", "ideas": ["..."]}]}`;

export const arcPlanPrompt: PromptModule<ArcPlanOutput> = {
  key: 'arc-plan',
  version: '1.3.0',
  kind: 'authoring',
  role: 'arc',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', '{stableContext}'],
    ['human', 'Volume to plan: {volumeKey}, chapters {startChapter}–{endChapter}. Requested arc count: {arcCount}\n\nAdditional guidance: {guidance}'],
  ]),
  schema: ArcPlanSchema,
  postValidate: data => validateArcContiguity(data.arcs),
};

/** Range-bound variant used by the arc-plan chain: exact coverage re-enters the repair ladder, and an early reveal buys one repair without failing the call. */
export function buildArcPlanPrompt(startChapter: number, endChapter: number, reveals: readonly ScheduledReveal[] = []): PromptModule<ArcPlanOutput> {
  return {
    ...arcPlanPrompt,
    postValidate: data => validateArcCoverage(data.arcs, startChapter, endChapter),
    advise: data => findArcRevealViolations(data.arcs, reveals).map(renderRevealViolation),
  };
}
