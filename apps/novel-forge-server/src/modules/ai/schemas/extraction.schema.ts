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
import { EntityType, MysteryStatus, ThreadStatus } from '@server/common';
import { type Knowledge, type Story } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class ExtractionEntity {
  @Field({ minLength: 1, description: 'unique snake_case identifier, e.g. iron_covenant or li_wei' })
  entityKey: string;

  @Field(() => EntityType)
  type: Knowledge.EntityType;

  @Field({ minLength: 1 })
  name: string;

  @Field(() => [String], { optional: true, default: [] })
  aliases?: string[];

  @Field(() => Object, { optional: true, description: 'key-value attributes, e.g. { strength: "exceptional", affiliation: "Iron Covenant" }' })
  attributes?: Record<string, string>;

  @Field({ optional: true })
  notes?: string;

  @Field(() => Integer, { optional: true, description: 'omit if entity was pre-existing before this chapter' })
  firstSeenChapter?: number;
}

@Schema()
export class ExtractionRelationship {
  @Field({ minLength: 1 })
  entityKey: string;

  @Field({ minLength: 1, description: 'target entity key — may not yet exist in the knowledge base' })
  targetKey: string;

  @Field({ minLength: 1, description: 'e.g. ally_of, enemy_of, trained_by, member_of, seeks, fears' })
  kind: string;

  @Field({ optional: true })
  note?: string;
}

@Schema()
export class ExtractionBeat {
  @Field({ minLength: 1, description: 'unique snake_case key for this beat, e.g. ch12_confrontation' })
  beatKey: string;

  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, description: 'e.g. combat, revelation, bonding, loss, mystery_planted' })
  beatType?: string;

  @Field({ minLength: 1, description: '1-2 sentences describing what happened' })
  summary: string;

  @Field(() => [String], { optional: true, description: 'entityKeys of participants' })
  entities?: string[];

  @Field(() => [String], { optional: true, description: 'threadKeys opened by this beat' })
  opensThreads?: string[];

  @Field(() => [String], { optional: true, description: 'threadKeys closed or resolved by this beat' })
  closesThreads?: string[];
}

@Schema()
export class ExtractionPlotThread {
  @Field({ minLength: 1, description: 'unique snake_case identifier' })
  threadKey: string;

  @Field(() => ThreadStatus)
  status: Story.ThreadStatus;

  @Field(() => Integer, { optional: true })
  openedChapter?: number;

  @Field(() => Integer, { optional: true })
  closedChapter?: number;

  @Field({ minLength: 1 })
  summary: string;

  @Field({ optional: true, description: 'entityKey of the character who drives this thread' })
  owner?: string;

  @Field({ optional: true, description: 'how this thread resolves or is expected to resolve' })
  payoff?: string;
}

@Schema()
export class ExtractionWorldFact {
  @Field({ minLength: 1, description: 'e.g. geography, magic_system, politics, economy, culture' })
  category: string;

  @Field({ minLength: 1, description: 'snake_case fact identifier within the category' })
  key: string;

  @Field({ minLength: 1, description: 'the fact itself, as a declarative statement' })
  value: string;
}

@Schema()
export class ExtractionMystery {
  @Field({ minLength: 1 })
  mysteryKey: string;

  @Field({ minLength: 1, description: 'the open question as the reader experiences it' })
  question: string;

  @Field(() => MysteryStatus)
  status: Story.MysteryStatus;

  @Field(() => Integer, { optional: true })
  openedChapter?: number;

  @Field(() => Integer, { optional: true })
  resolvedChapter?: number;

  @Field({ optional: true, description: 'entityKey of who (in-world) knows the answer' })
  knownTo?: string;
}

@Schema()
export class ExtractionSchema {
  @Field(() => [ExtractionEntity])
  entities: ExtractionEntity[];

  @Field(() => [ExtractionRelationship])
  relationships: ExtractionRelationship[];

  @Field(() => [ExtractionBeat])
  beats: ExtractionBeat[];

  @Field(() => [ExtractionPlotThread])
  plotThreads: ExtractionPlotThread[];

  @Field(() => [ExtractionWorldFact])
  worldFacts: ExtractionWorldFact[];

  @Field(() => [ExtractionMystery])
  mysteries: ExtractionMystery[];

  @Field({ minLength: 1, description: '2-3 sentences: what happened, what changed, what was left unresolved' })
  chapterSummary: string;
}

export type ExtractionOutput = ExtractionSchema;
