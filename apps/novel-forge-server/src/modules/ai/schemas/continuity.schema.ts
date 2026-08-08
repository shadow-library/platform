import { Field, Schema } from '@shadow-library/class-schema';

import { EntityType, MysteryStatus, ThreadStatus } from '@server/common';
import { type Knowledge, type Story } from '@server/database';

@Schema()
export class ContinuityNewEntity {
  @Field({ minLength: 1 })
  entityKey: string;

  @Field({ minLength: 1 })
  name: string;

  @Field(() => EntityType)
  type: Knowledge.EntityType;

  @Field({ optional: true })
  notes?: string;
}

@Schema()
export class ContinuityThread {
  @Field({ minLength: 1 })
  threadKey: string;

  @Field(() => ThreadStatus)
  status: Story.ThreadStatus;

  @Field({ optional: true })
  summary?: string;

  @Field({
    optional: true,
    default: false,
    description: 'marked as a deliberate running thread, not an oversight — novel-validation must not flag it as unresolved',
  })
  intentionallyOpen?: boolean;
}

@Schema()
export class ContinuityMystery {
  @Field({ minLength: 1 })
  mysteryKey: string;

  @Field(() => MysteryStatus)
  status: Story.MysteryStatus;

  @Field({ optional: true })
  question?: string;

  @Field({
    optional: true,
    default: false,
    description: 'marked as a deliberate running mystery, not an oversight — novel-validation must not flag it as unresolved',
  })
  intentionallyOpen?: boolean;
}

@Schema()
export class ContinuityTimelineEvent {
  @Field({ optional: true })
  whenText?: string;

  @Field({ minLength: 1 })
  event: string;

  @Field({ optional: true })
  significance?: string;
}

@Schema()
export class ContinuityRelationship {
  @Field({ minLength: 1 })
  entityKey: string;

  @Field({ minLength: 1 })
  targetKey: string;

  @Field({ minLength: 1 })
  kind: string;

  @Field({ optional: true })
  note?: string;
}

@Schema()
export class ContinuityPower {
  @Field({ minLength: 1 })
  character: string;

  @Field({ minLength: 1 })
  stage: string;

  @Field({ optional: true })
  feat?: string;

  @Field({ optional: true })
  next?: string;
}

@Schema()
export class ContinuitySchema {
  @Field(() => [String], { description: 'entityKeys of entities who appear in this chapter' })
  appeared: string[];

  @Field(() => [ContinuityNewEntity], { description: 'new entities introduced in this chapter not yet in the knowledge base' })
  newEntities: ContinuityNewEntity[];

  @Field(() => [ContinuityThread])
  threads: ContinuityThread[];

  @Field(() => [ContinuityMystery])
  mysteries: ContinuityMystery[];

  @Field(() => [ContinuityTimelineEvent])
  timeline: ContinuityTimelineEvent[];

  @Field(() => [ContinuityRelationship])
  relationships: ContinuityRelationship[];

  @Field(() => [ContinuityPower])
  power: ContinuityPower[];

  @Field({ minLength: 1, description: '2-3 sentence summary of what happened' })
  chapterSummary: string;
}

export type ContinuityOutput = ContinuitySchema;
