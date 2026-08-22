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
export class ContinuityCharacterState {
  @Field({ minLength: 1 })
  entityKey: string;

  @Field({ optional: true })
  location?: string;

  @Field(() => [String], { optional: true })
  conditions?: string[];

  @Field({ optional: true })
  immediateGoal?: string;

  @Field({ optional: true })
  statusNote?: string;

  @Field({ minLength: 1, description: 'excerpt from the prose that justifies this state extraction' })
  evidence: string;
}

@Schema()
export class ContinuityKnowledgeChange {
  @Field({ minLength: 1 })
  entityKey: string;

  @Field({ minLength: 1, description: 'corresponds to a canon_facts.factKey — what the character now knows' })
  factKey: string;

  @Field({ minLength: 1, description: 'short description of how the character learned it' })
  how: string;
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

  @Field(() => [ContinuityCharacterState], { description: 'characters whose state materially changed this chapter — replaces, not merges, the prior state' })
  characterStates: ContinuityCharacterState[];

  @Field(() => [ContinuityKnowledgeChange], { description: 'canon facts a character newly came to know this chapter' })
  knowledgeChanges: ContinuityKnowledgeChange[];

  @Field({ minLength: 1, description: '2-3 sentence summary of what happened' })
  chapterSummary: string;
}

export type ContinuityOutput = ContinuitySchema;
