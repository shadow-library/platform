import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { EntitySignificance, EntityType } from '@server/common';
import { type Knowledge } from '@server/database';

@Schema()
export class BibleStageEntity {
  @Field({ minLength: 1 })
  entityKey: string;

  @Field({ minLength: 1 })
  name: string;

  @Field(() => EntityType)
  type: Knowledge.EntityType;

  @Field(() => EntitySignificance, { optional: true })
  significance?: Knowledge.EntitySignificance;

  @Field({ optional: true })
  notes?: string;

  @Field({ optional: true, description: 'full entity card prose — voice, motivations, relationships, backstory beats that shape present behavior' })
  body?: string;
}

@Schema()
export class BibleStageFact {
  @Field({ minLength: 1 })
  factKey: string;

  @Field({ minLength: 1 })
  text: string;

  @Field(() => [String], { optional: true })
  subjects?: string[];

  @Field({ optional: true })
  constraintNote?: string;

  @Field(() => [String], { optional: true })
  terms?: string[];

  @Field(() => Integer, { optional: true, minimum: 1 })
  revealChapter?: number;
}

@Schema()
export class BibleStageWorldFact {
  @Field({ minLength: 1 })
  category: string;

  @Field({ minLength: 1 })
  key: string;

  @Field({ minLength: 1 })
  value: string;

  @Field(() => Integer, { optional: true, minimum: 1 })
  chapter?: number;
}

@Schema()
export class BibleStageSchema {
  @Field({ minLength: 1, description: 'prose content for this bible section' })
  body: string;

  @Field(() => [BibleStageEntity], { optional: true, description: 'entities introduced in this section, if applicable' })
  entities?: BibleStageEntity[];

  @Field(() => [BibleStageFact], { optional: true, description: 'canon facts established in this section, if applicable' })
  facts?: BibleStageFact[];

  @Field(() => [BibleStageWorldFact], { optional: true, description: 'structured worldbuilding facts established in this section, if applicable' })
  worldFacts?: BibleStageWorldFact[];
}

export type BibleStageOutput = BibleStageSchema;
