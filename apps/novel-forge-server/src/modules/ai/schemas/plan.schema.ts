/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Integer, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class VolumeSpecSchema {
  @Field({ minLength: 1, description: 'snake_case identifier, e.g. vol_01_awakening' })
  volumeKey: string;

  @Field(() => Integer, { minimum: 1 })
  ordinal: number;

  @Field({ minLength: 1 })
  title: string;

  @Field({ minLength: 1, description: 'what this volume arc must accomplish in the novel' })
  objective: string;

  @Field({ minLength: 1, description: 'the central conflict or obstacle of this volume' })
  conflict: string;

  @Field({ minLength: 1, description: 'how the conflict resolves at the end of this volume' })
  payoff: string;

  @Field(() => Integer, { minimum: 1 })
  startChapter: number;

  @Field(() => Integer, { minimum: 1 })
  endChapter: number;

  @Field(() => [String], { optional: true, description: 'entityKeys of primary characters in this volume' })
  cast?: string[];
}

export const PlanSchema = [VolumeSpecSchema] as [typeof VolumeSpecSchema];

export type PlanOutput = VolumeSpecSchema[];

// Cross-item constraint JSON Schema can't express declaratively (comparing adjacent array items) —
// kept as a plain post-validation check, wired into ModelRouterService.structured() via
// PromptModule.postValidate, the same way zod's `.refine()` used to gate this.
export function validatePlanContiguity(vols: VolumeSpecSchema[]): string[] {
  // Local models sometimes emit the same volume several times; collapse duplicate ordinals (the plan
  // upsert is keyed by volumeKey, so repeats become one row anyway) before checking contiguity.
  const byOrdinal = new Map<number, VolumeSpecSchema>();
  for (const v of vols) if (!byOrdinal.has(v.ordinal)) byOrdinal.set(v.ordinal, v);
  const sorted = [...byOrdinal.values()].sort((a, b) => a.ordinal - b.ordinal);
  const ok = sorted.every((v, i) => i === 0 || v.startChapter === (sorted[i - 1]?.endChapter ?? 0) + 1);
  return ok ? [] : ['volume chapter spans must be contiguous'];
}
