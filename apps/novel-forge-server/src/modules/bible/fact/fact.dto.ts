import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { FactSource, KnowledgeStatus } from '@server/common';
import { type Knowledge, type UnlockCondition } from '@server/database';

@Schema()
export class FactProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class FactKeyParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field()
  factKey: string;
}

@Schema()
export class FactKnowledgeParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field()
  factKey: string;

  @Field()
  entityKey: string;
}

@Schema({ minProperties: 1, maxProperties: 1, description: 'Exactly one of milestone, volume, chapter or ending.' })
export class UnlockTermSchema {
  @Field({ optional: true, minLength: 1, description: 'Holds once this milestone is reached.' })
  milestone?: string;

  @Field({ optional: true, minLength: 1, description: 'Holds once the story reaches this volume.' })
  volume?: string;

  @Field(() => Integer, { optional: true, minimum: 1, description: 'Holds from this chapter on.' })
  chapter?: number;

  @Field({ optional: true, description: 'Always true: holds only in the chapter planned as the ending.' })
  ending?: boolean;
}

@Schema({ description: 'Unlocks once every term holds.' })
export class UnlockConditionSchema {
  @Field(() => [UnlockTermSchema], { minItems: 1 })
  all: UnlockTermSchema[];
}

@Schema()
export class UpsertFactBody {
  @Field({ minLength: 1 })
  text: string;

  @Field(() => [String], { optional: true })
  subjects?: string[];

  @Field({ optional: true, description: 'Author-only note on what the fact protects; never shown to the chapter writer' })
  constraintNote?: string;

  @Field({
    optional: true,
    description: 'The only trace of the fact the chapter writer sees while it is hidden — omit to keep the current note, send an empty string to clear it and withhold the fact',
  })
  writerNote?: string;

  @Field(() => [String], { optional: true })
  terms?: string[];

  @Field(() => Integer, {
    optional: true,
    nullable: true,
    minimum: 1,
    description: 'Reveal chapter: a number for a dated reveal, 1 for open canon. Omit to keep the current schedule, send null to undate the fact — hidden until a plan reveals it.',
  })
  revealChapter?: number | null;

  @Field(() => UnlockConditionSchema, { optional: true, nullable: true, description: 'When the fact may be revealed. Omit to keep the current condition, send null to clear it.' })
  unlock?: UnlockCondition | null;

  @Field(() => [String], {
    optional: true,
    nullable: true,
    description: 'Observable effects the writer may show while the explanation stays hidden; trimmed, blanks dropped, duplicates removed. Omit to keep, send null to clear.',
  })
  allowedClues?: string[] | null;
}

@Schema()
export class RevealFactBody {
  @Field()
  entityKey: string;

  @Field(() => Integer, { minimum: 1 })
  chapter: number;

  @Field({ optional: true })
  note?: string;
}

@Schema()
export class KnowledgeEntryResponse {
  @Field()
  entityKey: string;

  @Field()
  entityName: string;

  @Field(() => Integer)
  learnedInChapter: number;

  @Field(() => FactSource)
  source: Knowledge.FactSource;

  @Field({ optional: true, nullable: true })
  note?: string | null;

  @Field(() => KnowledgeStatus, {
    description:
      'Provisional while it rests on an approved, not yet finalized draft; committed once that chapter is final. Until the knowledge lifecycle lands every row reads committed, including reveals ledgered at approval.',
  })
  status: Knowledge.KnowledgeStatus;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class FactResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field()
  factKey: string;

  @Field()
  text: string;

  @Field(() => [String], { optional: true, nullable: true })
  subjects?: string[] | null;

  @Field({ optional: true, nullable: true })
  constraintNote?: string | null;

  @Field({ optional: true, nullable: true })
  writerNote?: string | null;

  @Field(() => [String], { optional: true, nullable: true })
  terms?: string[] | null;

  @Field(() => Integer, { optional: true, nullable: true })
  revealChapter?: number | null;

  // Non-nullable for the class-ref reason on `ProjectResponse.config`: `FactService` maps a stored null to an omitted field.
  @Field(() => UnlockConditionSchema, { optional: true, description: 'When the fact may be revealed; absent when it has no condition.' })
  unlock?: UnlockCondition;

  @Field(() => Integer, { optional: true, nullable: true, description: 'The chapter whose plan currently schedules the reveal; provisional until that chapter is final.' })
  plannedChapter?: number | null;

  @Field(() => Integer, { optional: true, nullable: true, description: 'The finalized chapter in which the reader learned the fact.' })
  disclosedInChapter?: number | null;

  @Field(() => [String], { optional: true, nullable: true })
  allowedClues?: string[] | null;

  @Field(() => [KnowledgeEntryResponse])
  knowledge: KnowledgeEntryResponse[];

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListFactsResponse {
  @Field(() => [FactResponse])
  facts: FactResponse[];
}
