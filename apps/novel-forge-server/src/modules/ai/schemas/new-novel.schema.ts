import { Field, Schema } from '@shadow-library/class-schema';

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
}

@Schema()
export class BibleStageSchema {
  @Field({ minLength: 1, description: 'prose content for this bible section' })
  body: string;

  @Field(() => [BibleStageEntity], { optional: true, description: 'entities introduced in this section, if applicable' })
  entities?: BibleStageEntity[];
}

export type BibleStageOutput = BibleStageSchema;
