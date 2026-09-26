import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { EndingContractSchema } from './ending-contract.schema';
import { KnowledgeContractSchema } from './knowledge-contract.schema';
import { READER_VALUE_CHANGES, type ReaderValueChange } from './outline.schema';

@Schema()
export class ChapterPlanSceneSchema {
  @Field({ minLength: 1, description: 'one sentence the author reads on the plan card: what happens in this scene' })
  summary: string;

  @Field({ optional: true, description: 'entity key of the character whose point of view this scene is told from' })
  pov?: string;

  @Field({ minLength: 1, description: 'what the POV character wants in this scene' })
  goal: string;

  @Field({ minLength: 1, description: 'who or what stands in the way' })
  obstacle: string;

  @Field({ minLength: 1, description: 'how the situation has changed when the scene ends' })
  turn: string;

  @Field(() => [String], { minItems: 1, description: 'the on-page beats of the scene, in order' })
  beats: string[];

  @Field(() => Integer, { minimum: 1, description: 'the share of the chapter length this scene will fill when dramatized' })
  estimatedWords: number;
}

@Schema()
export class ChapterPlanSchema {
  @Field({ minLength: 1 })
  title: string;

  @Field({ minLength: 1, description: 'what this chapter does in the story' })
  objective: string;

  @Field(() => [ChapterPlanSceneSchema], { minItems: 1, description: 'the scenes of the chapter, in order, each naming its point of view' })
  scenes: ChapterPlanSceneSchema[];

  @Field(() => [String], { description: 'context refs from the catalog the chapter needs, most important first' })
  requiredContext: string[];

  @Field({ optional: true, default: false, description: 'the chapter ends with its central action still live, handed to the next chapter' })
  continuesIntoNextChapter?: boolean;

  @Field({ optional: true, default: false, description: 'the chapter opens in the exact beat the previous chapter handed off' })
  startsFromPreviousChapter?: boolean;

  @Field({ optional: true, description: 'the moment where continuation picks up — required when either continuation flag is true' })
  handoffBeat?: string;

  @Field(() => EndingContractSchema, { description: 'how the chapter must end' })
  endingContract: EndingContractSchema;

  @Field(() => KnowledgeContractSchema, { optional: true, description: 'the canon facts characters learn on-page this chapter — omit when the chapter reveals nothing hidden' })
  knowledgeContract?: KnowledgeContractSchema;

  @Field(() => [String], { optional: true, description: 'keys from the MILESTONES list that this chapter reaches on the page' })
  claimedMilestones?: string[];

  @Field({ minLength: 1, description: "one sentence: why this chapter exists — its job in the story, not a restatement of the objective's events" })
  chapterPurpose: string;

  @Field(() => [String], { minItems: 1, description: `at least one concrete thing that changes this chapter, each drawn from: ${READER_VALUE_CHANGES.join(', ')}` })
  readerValue: ReaderValueChange[];

  @Field(() => [String], { optional: true, description: 'scene patterns from recent chapters this one must not repeat' })
  repetitionRisks?: string[];

  @Field({ optional: true, minLength: 1, description: 'set only when the material cannot honestly fill the length target: what is missing and the remedy' })
  densityRisk?: string;

  @Field({ optional: true, minLength: 1, description: 'which of the obligations this chapter moves, and how' })
  moves?: string;
}

export type ChapterPlanOutput = ChapterPlanSchema;
export type ChapterPlanSceneOutput = ChapterPlanSceneSchema;

export function chapterPlanIssues(plan: ChapterPlanOutput): string[] {
  const issues = (plan.readerValue ?? [])
    .filter(value => !READER_VALUE_CHANGES.includes(value))
    .map(value => `readerValue '${value}' is not one of: ${READER_VALUE_CHANGES.join(', ')}`);
  const continues = plan.continuesIntoNextChapter || plan.startsFromPreviousChapter;
  if (continues && !plan.handoffBeat?.trim()) issues.push('handoffBeat is required when the chapter continues into the next one or starts from the previous one');
  return issues;
}
