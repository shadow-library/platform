import { Field, Integer, Schema } from '@shadow-library/class-schema';

@Schema()
export class ArcPlanItem {
  @Field({ minLength: 1, pattern: '^[a-z0-9_]+$', description: 'stable snake_case id, e.g. "vol_2_arc_1"' })
  arcKey: string;

  @Field({ minLength: 1 })
  title: string;

  @Field({ minLength: 1, description: 'what this arc accomplishes for the volume objective' })
  objective: string;

  @Field({ minLength: 1, description: 'how conflict escalates across the arc' })
  escalation: string;

  @Field({ minLength: 1, description: 'how the arc resolves or pays off' })
  payoff: string;

  @Field({ minLength: 1, description: 'the handoff into the next arc (or the next volume for the final arc)' })
  hook: string;

  @Field(() => Integer, { description: 'absolute first chapter of the arc' })
  chapterStart: number;

  @Field(() => Integer, { description: 'absolute last chapter of the arc' })
  chapterEnd: number;

  @Field(() => [String], { description: 'entityKeys central to this arc' })
  cast: string[];

  @Field({ minLength: 1, description: 'arc prose: beats, subplots, and expansion material woven in where the volume is thin' })
  body: string;

  @Field(() => [String], { description: 'suggested materials/ideas the author can use to enrich this arc (subplots, character beats, world payoffs)' })
  ideas: string[];
}

@Schema()
export class ArcPlanSchema {
  @Field(() => [ArcPlanItem], { minItems: 1 })
  arcs: ArcPlanItem[];
}

export type ArcPlanOutput = ArcPlanSchema;

/**
 * Cross-item rules JSON Schema can't express: arcs ordered, contiguous, and non-overlapping. Exact
 * range coverage is enforced by the arc-plan chain's postValidate factory, which knows the volume.
 */
export function validateArcContiguity(arcs: ArcPlanItem[]): string[] {
  const errors: string[] = [];
  const sorted = [...arcs].sort((a, b) => a.chapterStart - b.chapterStart);
  for (const [index, arc] of sorted.entries()) {
    if (arc.chapterStart > arc.chapterEnd) errors.push(`arc ${arc.arcKey}: chapterStart must be <= chapterEnd`);
    const prev = sorted[index - 1];
    if (prev && arc.chapterStart !== prev.chapterEnd + 1) errors.push(`arc ${arc.arcKey}: must start at chapter ${prev.chapterEnd + 1} (right after ${prev.arcKey})`);
  }
  return errors;
}

export function validateArcCoverage(arcs: ArcPlanItem[], startChapter: number, endChapter: number): string[] {
  const errors = validateArcContiguity(arcs);
  const sorted = [...arcs].sort((a, b) => a.chapterStart - b.chapterStart);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first && first.chapterStart !== startChapter) errors.push(`first arc must start at chapter ${startChapter}, got ${first.chapterStart}`);
  if (last && last.chapterEnd !== endChapter) errors.push(`last arc must end at chapter ${endChapter}, got ${last.chapterEnd}`);
  return errors;
}
