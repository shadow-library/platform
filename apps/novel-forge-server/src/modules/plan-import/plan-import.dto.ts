/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { EnumType, Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { EntitySignificance, EntityType } from '@server/common';
import { type Knowledge } from '@server/database';

import { EndingContractSchema, KnowledgeContractSchema } from '../ai/schemas';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// `story_state` and `ai` are app-managed sections; an authored bundle may only carry canon sections.
export const PLAN_BUNDLE_SECTIONS = ['project', 'world', 'power', 'plot', 'lore'] as const;
export const PlanBundleSection = EnumType.create('PlanBundleSection', [...PLAN_BUNDLE_SECTIONS]);
export type PlanBundleSectionValue = (typeof PLAN_BUNDLE_SECTIONS)[number];

const KEY_PATTERN = '^[a-z0-9_]+$';
const SLUG_PATTERN = '^[a-z0-9][a-z0-9-]*$';

@Schema()
export class PlanImportParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class PlanBundleBibleDoc {
  @Field(() => PlanBundleSection)
  section: PlanBundleSectionValue;

  @Field({ pattern: SLUG_PATTERN })
  slug: string;

  // Open key/value frontmatter, same contract as UpsertBibleDocBody.
  @Field(() => Object, { optional: true, additionalProperties: true })
  frontmatter?: Record<string, unknown>;

  @Field({ minLength: 1 })
  body: string;
}

@Schema()
export class PlanBundleEntity {
  @Field({ pattern: KEY_PATTERN })
  entityKey: string;

  @Field(() => EntityType)
  type: Knowledge.EntityType;

  @Field({ minLength: 1 })
  name: string;

  @Field(() => EntitySignificance, { optional: true })
  significance?: Knowledge.EntitySignificance;

  @Field({ optional: true })
  status?: string;

  @Field({ optional: true })
  motivation?: string;

  @Field({ optional: true })
  notes?: string;

  @Field({ optional: true })
  body?: string;
}

@Schema()
export class PlanBundleFact {
  @Field({ pattern: KEY_PATTERN })
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
export class PlanBundleVolume {
  @Field({ pattern: KEY_PATTERN })
  volumeKey: string;

  @Field(() => Integer, { minimum: 1 })
  ordinal: number;

  @Field({ minLength: 1 })
  title: string;

  @Field({ minLength: 1 })
  objective: string;

  @Field({ minLength: 1 })
  conflict: string;

  @Field({ minLength: 1 })
  payoff: string;

  // Chapter ranges never appear in a bundle — the approval pass derives them cumulatively.
  @Field(() => Integer, { minimum: 1 })
  targetChapterCount: number;

  @Field(() => [String], { optional: true })
  cast?: string[];

  @Field({ optional: true })
  body?: string;
}

@Schema()
export class PlanBundleArc {
  @Field({ pattern: KEY_PATTERN })
  arcKey: string;

  @Field({ pattern: KEY_PATTERN })
  volumeKey: string;

  @Field(() => Integer, { minimum: 1 })
  ordinal: number;

  @Field({ minLength: 1 })
  title: string;

  @Field({ minLength: 1 })
  objective: string;

  @Field({ minLength: 1 })
  escalation: string;

  @Field({ minLength: 1 })
  payoff: string;

  @Field({ minLength: 1 })
  hook: string;

  @Field(() => Integer, { minimum: 1 })
  chapterStart: number;

  @Field(() => Integer, { minimum: 1 })
  chapterEnd: number;

  @Field(() => [String], { optional: true })
  cast?: string[];

  @Field({ optional: true })
  body?: string;
}

@Schema()
export class PlanBundleBrief {
  @Field(() => Integer, { minimum: 1 })
  chapter: number;

  @Field({ pattern: KEY_PATTERN })
  volumeKey: string;

  @Field({ optional: true, pattern: KEY_PATTERN })
  arcKey?: string;

  @Field({ minLength: 1 })
  title: string;

  @Field({ minLength: 1 })
  objective: string;

  @Field(() => [String], { minItems: 1 })
  events: string[];

  @Field(() => [String], { optional: true })
  requiredContext?: string[];

  @Field({ optional: true })
  continuesIntoNextChapter?: boolean;

  @Field({ optional: true })
  startsFromPreviousChapter?: boolean;

  @Field({ optional: true })
  handoffBeat?: string;

  // Required: contract-less briefs defeat the serial-pacing machinery the authoring skill feeds.
  @Field(() => EndingContractSchema)
  endingContract: EndingContractSchema;

  // Optional: the epistemic contract (character-knowledge design §3) — omitting it leaves the
  // chapter unfiltered, exactly like a hand-authored brief without one.
  @Field(() => KnowledgeContractSchema, { optional: true })
  knowledgeContract?: KnowledgeContractSchema;
}

@Schema()
export class PlanBundle {
  @Field({ minLength: 1 })
  format: string;

  @Field(() => Integer, { minimum: 1 })
  version: number;

  @Field(() => [PlanBundleBibleDoc], { optional: true })
  bible?: PlanBundleBibleDoc[];

  @Field(() => [PlanBundleEntity], { optional: true })
  entities?: PlanBundleEntity[];

  // Bundle v2 — canon facts feeding the character-knowledge ledger; ignored-free: v1 bundles simply omit it.
  @Field(() => [PlanBundleFact], { optional: true })
  facts?: PlanBundleFact[];

  @Field(() => [PlanBundleVolume], { optional: true })
  volumes?: PlanBundleVolume[];

  @Field(() => [PlanBundleArc], { optional: true })
  arcs?: PlanBundleArc[];

  @Field(() => [PlanBundleBrief], { optional: true })
  briefs?: PlanBundleBrief[];
}

@Schema()
export class ImportPlanBody {
  @Field(() => PlanBundle)
  bundle: PlanBundle;

  @Field({ optional: true })
  overwrite?: boolean;

  @Field({ optional: true })
  approve?: boolean;
}

@Schema()
export class CollectionResult {
  @Field(() => Integer)
  created: number;

  @Field(() => Integer)
  updated: number;

  @Field(() => Integer)
  unchanged: number;

  @Field(() => Integer)
  pruned: number;
}

@Schema()
export class ImportResults {
  @Field(() => CollectionResult)
  bible: CollectionResult;

  @Field(() => CollectionResult)
  entities: CollectionResult;

  @Field(() => CollectionResult)
  facts: CollectionResult;

  @Field(() => CollectionResult)
  volumes: CollectionResult;

  @Field(() => CollectionResult)
  arcs: CollectionResult;

  @Field(() => CollectionResult)
  briefs: CollectionResult;
}

@Schema()
export class ApprovalResult {
  @Field(() => Integer)
  volumesApproved: number;

  @Field(() => Integer)
  arcsApproved: number;
}

@Schema()
export class ImportPlanResponse {
  @Field(() => ImportResults)
  results: ImportResults;

  @Field(() => ApprovalResult, { optional: true })
  approval?: ApprovalResult;

  @Field(() => [String])
  warnings: string[];
}
