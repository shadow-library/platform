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
import { ReforgeJudgeIssueType, ReforgeJudgeVerdict } from './enums';
import { RebrandCarryState, RebrandMapping } from './rebrand.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class ReforgeBeat {
  @Field({ minLength: 1, maxLength: 600, description: 'what happens in this beat, in the alternate-world (renamed) frame' })
  summary: string;

  @Field({ minLength: 1, description: 'why this beat matters — its narrative function in the chapter or wider story' })
  purpose: string;

  @Field(() => [String], { optional: true, description: 'the renamed entities that take part in this beat' })
  entities?: string[];

  @Field({ optional: true, description: 'the emotional shift across the beat, e.g. "wary → resolved"' })
  emotionalTurn?: string;

  @Field(() => [String], { optional: true, description: 'key lines captured by MEANING (not verbatim) that the re-author must preserve' })
  dialogueAnchors?: string[];
}

@Schema()
export class ReforgeOutlineSchema {
  @Field({ minLength: 1, maxLength: 500, description: 'the chapter title, in the alternate-world (renamed) frame' })
  title: string;

  @Field({ minLength: 1, description: '1-2 sentence chapter-level throughline the beats add up to' })
  throughline: string;

  @Field(() => [ReforgeBeat], { minItems: 1, description: 'the ordered scene/beat outline — the fidelity contract every downstream check measures against' })
  beats: ReforgeBeat[];
}

@Schema()
export class ReforgeChanges {
  @Field(() => [String], { optional: true, description: 'notable source names renamed to their alternate-world replacements' })
  renames?: string[];

  @Field(() => [String], { optional: true, description: 'content cut per the author instructions, each with the beat repaired around the cut' })
  removals?: string[];

  @Field(() => [String], { optional: true, description: 'scenes or seams added to bridge a removal or weave a directive' })
  addedScenes?: string[];

  @Field({ optional: true, description: 'a sentence on how the prose was elevated beyond the source' })
  proseNotes?: string;
}

@Schema()
export class ReforgeWriteSchema {
  @Field({ minLength: 1, maxLength: 500, description: 'the re-authored chapter title' })
  title: string;

  @Field({ minLength: 100, description: 'the full re-authored chapter prose in the house style' })
  body: string;

  @Field({ optional: true, description: '1-3 sentence summary of the finished chapter' })
  summary?: string;

  @Field(() => [RebrandMapping], { optional: true, description: 'mappings you had to invent for proper nouns not in the glossary — every unmapped rename goes here' })
  discoveredNames?: RebrandMapping[];

  @Field(() => ReforgeChanges, { optional: true, description: 'what changed relative to the source: renames, removals, added seams, prose notes' })
  changes?: ReforgeChanges;

  @Field(() => RebrandCarryState, { optional: true, description: 'continuity state for directive-driven threads; omit when no directive material is in play' })
  carryState?: RebrandCarryState;
}

@Schema()
export class ReforgeJudgeIssue {
  @Field(() => ReforgeJudgeIssueType)
  type: 'missing_beat' | 'invented_beat' | 'naming' | 'nationalism' | 'discrimination' | 'real_world_reference';

  @Field({ minLength: 1, description: 'what the violation is and where it appears' })
  detail: string;

  @Field({ optional: true, description: 'a short quote of the offending prose, or the outline beat that went missing' })
  excerpt?: string;
}

@Schema()
export class ReforgeJudgeSchema {
  @Field(() => ReforgeJudgeVerdict)
  verdict: 'clean' | 'issues';

  @Field(() => Integer, { minimum: 0, description: 'how many outline beats are present in the written chapter' })
  coveredBeats: number;

  @Field(() => Integer, { minimum: 0, description: 'total beats in the outline' })
  totalBeats: number;

  @Field(() => [String], { optional: true, description: 'outline beats absent from the prose, excluding beats the author instructions declared removed' })
  missingBeats?: string[];

  @Field(() => [ReforgeJudgeIssue], { description: 'every fidelity violation found; empty when the verdict is clean' })
  issues: ReforgeJudgeIssue[];
}

export type ReforgeOutlineOutput = ReforgeOutlineSchema;
export type ReforgeWriteOutput = ReforgeWriteSchema;
export type ReforgeJudgeOutput = ReforgeJudgeSchema;
