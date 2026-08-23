import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { ReforgeFindingKind, ReforgeMovement, ReforgeSpanAction } from './enums';

@Schema()
export class ReforgeCardSchema {
  @Field(() => Integer, { minimum: 1, description: 'the source chapter number this card describes' })
  chapter: number;

  @Field({ minLength: 1, maxLength: 400, description: 'one line on what actually happens in the chapter' })
  summary: string;

  @Field({ optional: true, description: 'whose viewpoint the chapter is told from' })
  pov?: string;

  @Field(() => [String], { optional: true, description: 'the named characters who appear' })
  cast?: string[];

  @Field(() => ReforgeMovement, { description: 'advances = the story moves; sidesteps = it moves sideways; stalls = it does not move' })
  movement: 'advances' | 'sidesteps' | 'stalls';

  @Field(() => [String], { optional: true, description: 'threads or questions this chapter opens' })
  threadsOpened?: string[];

  @Field(() => [String], { optional: true, description: 'threads this chapter pushes forward without resolving' })
  threadsAdvanced?: string[];

  @Field(() => [String], { optional: true, description: 'threads this chapter resolves' })
  threadsClosed?: string[];
}

@Schema()
export class ReforgeFindingSchema {
  @Field(() => ReforgeFindingKind)
  type: 'filler' | 'repetition' | 'pacing_stall' | 'dead_subplot' | 'dropped_thread' | 'arc_boundary' | 'quality_outlier';

  @Field(() => Integer, { minimum: 1, description: 'first source chapter the finding covers' })
  fromChapter: number;

  @Field(() => Integer, { minimum: 1, description: 'last source chapter the finding covers, inclusive' })
  toChapter: number;

  @Field(() => Integer, { minimum: 1, maximum: 5, description: 'how much this hurts the novel: 1 = cosmetic, 5 = the reason a reader quits' })
  severity: number;

  @Field({ minimum: 0, maximum: 1, description: 'how sure you are, 0 to 1' })
  confidence: number;

  @Field({ minLength: 1, maxLength: 300, description: 'the finding in one line, as it will appear in the report' })
  label: string;

  @Field({ optional: true, description: 'the evidence and reasoning behind the finding' })
  detail?: string;

  @Field({ optional: true, description: 'the id of the deterministic signal this confirms, when it confirms one' })
  signalRef?: string;
}

@Schema()
export class ReforgeAnalysisCarry {
  @Field({ minLength: 1, maxLength: 2000, description: 'the story so far, carried into the next window — plot state, not a blurb' })
  storySoFar: string;

  @Field(() => [String], { optional: true, description: 'threads still open at the end of this window' })
  openThreads?: string[];

  @Field({ optional: true, description: 'the arc currently running and how far into it the window ended' })
  arcRegister?: string;
}

@Schema()
export class ReforgeAnalyzeWindowSchema {
  @Field(() => [ReforgeCardSchema], { minItems: 1, description: 'one card per source chapter in the window, in reading order' })
  cards: ReforgeCardSchema[];

  @Field(() => [ReforgeFindingSchema], { description: 'findings that span chapters of this window; empty when the window is clean' })
  findings: ReforgeFindingSchema[];

  @Field(() => ReforgeAnalysisCarry, { description: 'the state the next window opens with — the analysis chain is serial for this reason' })
  carryState: ReforgeAnalysisCarry;
}

@Schema()
export class ReforgeArcSchema {
  @Field(() => Integer, { minimum: 1, description: 'first source chapter of the arc' })
  fromChapter: number;

  @Field(() => Integer, { minimum: 1, description: 'last source chapter of the arc, inclusive' })
  toChapter: number;

  @Field({ minLength: 1, maxLength: 200, description: 'what this arc is called — the label the plan editor shows' })
  label: string;

  @Field({ optional: true, description: 'what the arc does for the novel, and whether it earns its length' })
  rationale?: string;
}

@Schema()
export class ReforgeSynthesizeSchema {
  @Field({ minLength: 1, description: 'the prose summary of the novel’s structural condition — the body of the report the author reads' })
  summary: string;

  @Field({ optional: true, description: 'how the pacing behaves across the whole novel' })
  pacingProfile?: string;

  @Field(() => [ReforgeArcSchema], { description: 'the detected arcs in reading order; empty only when the source has no discernible arc structure' })
  arcs: ReforgeArcSchema[];

  @Field(() => [ReforgeFindingSchema], { description: 'findings no single window could see: cross-window repetition, abandoned subplots, global pacing stalls' })
  findings: ReforgeFindingSchema[];
}

/** Cards are the per-chapter substrate of re-planning; a duplicated or out-of-order chapter would silently overwrite one. */
export function validateCardCoverage(data: ReforgeAnalyzeWindowSchema): string[] {
  const chapters = data.cards.map(card => card.chapter);
  if (new Set(chapters).size !== chapters.length) return ['every card must describe a different source chapter'];
  const ascending = chapters.every((chapter, index) => index === 0 || chapter > (chapters[index - 1] as number));
  return ascending ? [] : ['cards must be in reading order'];
}

/** Arcs partition the novel in reading order; an overlap would make two spans claim the same chapters. */
export function validateArcOrder(data: ReforgeSynthesizeSchema): string[] {
  const issues: string[] = [];
  for (const arc of [...data.arcs, ...data.findings]) if (arc.toChapter < arc.fromChapter) issues.push(`range ${arc.fromChapter}-${arc.toChapter} ends before it starts`);
  const sorted = [...data.arcs].sort((a, b) => a.fromChapter - b.fromChapter);
  const overlapping = sorted.some((arc, index) => index > 0 && arc.fromChapter <= (sorted[index - 1]?.toChapter ?? 0));
  if (overlapping) issues.push('arcs must not overlap');
  return issues;
}

@Schema()
export class ReforgePlanSpanSchema {
  @Field(() => Integer, { minimum: 1, description: 'position in reading order, starting at 1 and running without gaps' })
  ordinal: number;

  @Field(() => Integer, { minimum: 1, description: 'first source chapter of the span' })
  fromChapter: number;

  @Field(() => Integer, { minimum: 1, description: 'last source chapter of the span, inclusive' })
  toChapter: number;

  @Field(() => ReforgeSpanAction, { description: 'keep = as-is, condense = fewer chapters, merge = one chapter, drop = gone entirely' })
  action: 'keep' | 'condense' | 'merge' | 'drop';

  @Field(() => Integer, { minimum: 0, description: 'output chapters this span produces: the span length for keep, 1 for merge, 0 for drop, fewer than the length for condense' })
  targetChapters: number;

  @Field({ optional: true, description: 'the arc this span belongs to, from the analysis report' })
  arcLabel?: string;

  @Field({ minLength: 1, description: 'why this span gets this action — quoted into the report and shown in the plan editor' })
  rationale: string;

  @Field(() => [String], { description: 'the beats every output chapter of this span owes the reader; empty only for a drop' })
  keptBeats: string[];

  @Field(() => [String], { optional: true, description: 'threads, subplots, or running patterns this span removes — these seed the cut ledger at approval' })
  cutThreads?: string[];

  @Field({ optional: true, description: 'what must remain true across this span’s seam; required on a span that follows a drop' })
  continuityNotes?: string;

  @Field(() => [String], { optional: true, description: 'the analysis findings that justify this span' })
  findingIds?: string[];
}

@Schema()
export class ReforgePlanSchema {
  @Field({ minLength: 1, description: 'what the transformed novel becomes, in a paragraph the author reads before approving' })
  summary: string;

  @Field(() => [ReforgePlanSpanSchema], { minItems: 1, description: 'the spans, in reading order, partitioning every source chapter exactly once' })
  spans: ReforgePlanSpanSchema[];
}

export type ReforgeAnalyzeWindowOutput = ReforgeAnalyzeWindowSchema;
export type ReforgeSynthesizeOutput = ReforgeSynthesizeSchema;
export type ReforgePlanOutput = ReforgePlanSchema;
