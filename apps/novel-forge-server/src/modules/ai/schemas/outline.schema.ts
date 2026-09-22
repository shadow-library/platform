import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { type ResolvedWordTarget } from '../../eval/deterministic-metrics';
import { EndingContractSchema } from './ending-contract.schema';
import { KnowledgeContractSchema } from './knowledge-contract.schema';

// class-schema's @Field has no declarative "array of EnumType" overload (only a single scalar EnumType,
// or an array of Schema classes) — so readerValue stays a plain string array here and its membership is
// enforced in validateOutlineCoverage, the same postValidate seam that already enforces span/chaining
// invariants JSON Schema can't express.
export const READER_VALUE_CHANGES = ['new_information', 'relationship_change', 'power_or_stakes_change', 'goal_or_plan_change', 'world_state_change', 'emotional_turn'] as const;
export type ReaderValueChange = (typeof READER_VALUE_CHANGES)[number];

// A dramatized web-novel scene with a goal, an obstacle and a turn rarely lands under ~700 words, so the
// target band's aim fixes how many a chapter needs before the drafter has to invent material to reach it.
export const WORDS_PER_SCENE = 750;
const MIN_SCENES = 2;

export function minScenesFor(target: ResolvedWordTarget): number {
  return Math.max(MIN_SCENES, Math.round(target.aim / WORDS_PER_SCENE));
}

@Schema()
export class ChapterSceneSchema {
  @Field({ minLength: 1, description: 'what the POV character wants in this scene' })
  goal: string;

  @Field({ minLength: 1, description: 'who or what stands in the way — the scene has no length without resistance' })
  obstacle: string;

  @Field({ minLength: 1, description: 'how the situation has changed when the scene ends' })
  turn: string;

  @Field(() => [String], { minItems: 2, description: 'the on-page beats of the scene, in order' })
  beats: string[];

  @Field(() => Integer, { minimum: 1, description: 'the share of the chapter length this scene will fill when dramatized' })
  estimatedWords: number;
}

@Schema()
export class ChapterBriefSchema {
  @Field(() => Integer)
  chapter: number;

  @Field({ minLength: 1 })
  volumeKey: string;

  @Field({ minLength: 1 })
  title: string;

  @Field({ minLength: 1, description: 'what this chapter must accomplish in the story arc' })
  objective: string;

  @Field(() => [ChapterSceneSchema], { minItems: 1, description: 'the scenes of this chapter, in order' })
  scenes: ChapterSceneSchema[];

  @Field(() => [String], {
    description:
      'context ref strings this chapter needs (e.g. "entity:iron_covenant", "thread:heir_mystery", "chapter:12") — select from the catalog provided, most important first; ordering determines eviction priority',
  })
  requiredContext: string[];

  @Field({ optional: true, description: 'entityKey of the POV character' })
  pov?: string;

  @Field({
    optional: true,
    default: false,
    description: 'this chapter should end without resolving its central action/tension — expected and desirable for serialized pacing, not a fallback',
  })
  continuesIntoNextChapter?: boolean;

  @Field({ optional: true, default: false, description: 'this chapter must open in the exact beat the previous chapter handed off' })
  startsFromPreviousChapter?: boolean;

  @Field({
    optional: true,
    description: 'the specific moment/action/line where continuation picks up — required when continuesIntoNextChapter or startsFromPreviousChapter is true',
  })
  handoffBeat?: string;

  @Field(() => EndingContractSchema, {
    description:
      'how the chapter must end — end in the contracted hookType; closure modes (closure_with_momentum, earned_rest) still hand off momentum rather than fully resolving the arc',
  })
  endingContract: EndingContractSchema;

  @Field(() => KnowledgeContractSchema, {
    optional: true,
    description: 'the cast whose ledgered knowledge bounds this chapter and the canon facts they learn on-page — omit when the chapter reveals nothing previously hidden',
  })
  knowledgeContract?: KnowledgeContractSchema;

  @Field({ minLength: 1, description: "one sentence: why this chapter exists — its narrative job in the arc, not a restatement of the objective's events" })
  chapterPurpose: string;

  @Field(() => [String], {
    minItems: 1,
    description: `at least one concrete, falsifiable thing that changes this chapter, each drawn from: ${READER_VALUE_CHANGES.join(', ')} — forces real movement instead of a chapter that merely maintains the status quo`,
  })
  readerValue: ReaderValueChange[];

  @Field(() => [String], { optional: true, description: 'scene patterns or beats this chapter must avoid repeating from recent chapters (e.g. "another tavern negotiation")' })
  repetitionRisks?: string[];

  @Field({
    optional: true,
    minLength: 1,
    description:
      'set only when the planned material cannot honestly fill the length target — what is missing and what the author could do (merge with a neighbour, add a named subplot)',
  })
  densityRisk?: string;
}

export const OutlineSchema = [ChapterBriefSchema] as [typeof ChapterBriefSchema];

export type OutlineOutput = ChapterBriefSchema[];
export type ChapterBriefOutput = ChapterBriefSchema;

/**
 * Cross-item rules JSON Schema can't express: the returned briefs must exactly, contiguously cover
 * the requested span with no gaps, no out-of-range chapters, and no duplicates, and the
 * continuesIntoNextChapter/startsFromPreviousChapter flags must chain across every adjacent pair the
 * prompt already promises will chain. Given a word target, every brief without a densityRisk must
 * plan enough scenes to fill it.
 */
export function validateOutlineCoverage(briefs: ChapterBriefOutput[], startChapter: number, endChapter: number, target?: ResolvedWordTarget): string[] {
  const errors: string[] = [];
  const byChapter = new Map<number, ChapterBriefOutput>();

  for (const brief of briefs) {
    if (byChapter.has(brief.chapter)) errors.push(`chapter ${brief.chapter} appears more than once in the outline`);
    else byChapter.set(brief.chapter, brief);
    if (brief.chapter < startChapter || brief.chapter > endChapter) errors.push(`chapter ${brief.chapter} is outside the requested span ${startChapter}-${endChapter}`);
    for (const value of brief.readerValue ?? []) {
      if (!READER_VALUE_CHANGES.includes(value)) errors.push(`chapter ${brief.chapter} readerValue '${value}' is not one of: ${READER_VALUE_CHANGES.join(', ')}`);
    }
    if (target) errors.push(...validateBriefDensity(brief, target));
  }

  for (let chapter = startChapter; chapter <= endChapter; chapter++) {
    if (!byChapter.has(chapter)) errors.push(`chapter ${chapter} is missing from the outline`);
  }

  for (let chapter = startChapter; chapter < endChapter; chapter++) {
    const current = byChapter.get(chapter);
    const next = byChapter.get(chapter + 1);
    if (!current || !next) continue;
    if (current.continuesIntoNextChapter && !next.startsFromPreviousChapter) {
      errors.push(`chapter ${chapter} sets continuesIntoNextChapter, but chapter ${chapter + 1} does not set startsFromPreviousChapter`);
    }
    if (!current.continuesIntoNextChapter && next.startsFromPreviousChapter) {
      errors.push(`chapter ${chapter + 1} sets startsFromPreviousChapter, but chapter ${chapter} does not set continuesIntoNextChapter`);
    }
  }

  return errors;
}

function validateBriefDensity(brief: ChapterBriefOutput, target: ResolvedWordTarget): string[] {
  if (brief.densityRisk?.trim()) return [];
  const errors: string[] = [];
  const scenes = brief.scenes ?? [];
  const minScenes = minScenesFor(target);
  const plannedWords = scenes.reduce((sum, scene) => sum + (scene.estimatedWords ?? 0), 0);
  const remedy = 'plan more on-page material from the arc, or set densityRisk instead of padding';
  if (scenes.length < minScenes)
    errors.push(`chapter ${brief.chapter} plans ${scenes.length} scene(s); a ${target.min}–${target.max} word chapter needs at least ${minScenes} — ${remedy}`);
  if (plannedWords < target.min) errors.push(`chapter ${brief.chapter} scenes are estimated at ${plannedWords} words, under the ${target.min}-word floor — ${remedy}`);
  if (plannedWords > target.max)
    errors.push(`chapter ${brief.chapter} scenes are estimated at ${plannedWords} words, over the ${target.max}-word ceiling — move a scene into a neighbouring chapter`);
  return errors;
}
