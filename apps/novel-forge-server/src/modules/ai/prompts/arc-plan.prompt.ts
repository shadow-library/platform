import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type ArcPlanOutput, ArcPlanSchema, validateArcContiguity, validateArcCoverage } from '../schemas/arc-plan.schema';
import { AUTHORING_STYLE_PLANNING } from './authoring-preamble';
import { type PromptModule } from './types';

const system = `${AUTHORING_STYLE_PLANNING}\n\nYou are a senior web novelist planning the arcs of one volume. You receive the volume (objective, conflict, payoff, cast, chapter range), the premise, the previous volume's handoff hook, the next volume's objective, and the context catalog. Partition the volume's chapters into arcs: contiguous, non-overlapping blocks that together cover the range EXACTLY — the first arc starts at the volume's first chapter, the last arc ends at its last chapter, no gaps.\n\nDecide the arc count from the material unless one is requested. Each arc needs its own objective, a real escalation over the previous arc, a payoff, and a hook — a specific moment that hands off to the next arc (the final arc's hook hands off to the next volume). Where the volume's material is thin for its chapter count, EXPAND rather than pad: weave in subplots, character development beats, and world-building payoffs that serve the premise and the author's vision, and surface them in each arc's ideas list so the author can pick materials. Cast per arc: only the entities that arc actually serves. Use only entityKeys present in the catalog.\n\nRespond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:
{"arcs": [{"arcKey": "<snake_case id>", "title": "...", "objective": "...", "escalation": "...", "payoff": "...", "hook": "...", "chapterStart": <int>, "chapterEnd": <int>, "cast": ["entityKey"], "body": "...", "ideas": ["..."]}]}`;

export const arcPlanPrompt: PromptModule<ArcPlanOutput> = {
  key: 'arc-plan',
  version: '1.0.0',
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

/** Range-bound variant used by the arc-plan chain: exact coverage re-enters the repair ladder. */
export function buildArcPlanPrompt(startChapter: number, endChapter: number): PromptModule<ArcPlanOutput> {
  return { ...arcPlanPrompt, postValidate: data => validateArcCoverage(data.arcs, startChapter, endChapter) };
}
