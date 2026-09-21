import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { FactSource } from '@server/common';
import { type Knowledge } from '@server/database';

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

  @Field(() => Integer, { optional: true, minimum: 1 })
  revealChapter?: number;
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
