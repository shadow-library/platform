import { EnumType, Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { EntitySignificance, EntityType } from '@server/common';
import { type Knowledge } from '@server/database';

import { EndingContractSchema, KnowledgeContractSchema, READER_VALUE_CHANGES } from '../ai/schemas';

// `ai` is app-managed; `story_state` is importable because the bible manifest's volume plan lives there.
export const PLAN_BUNDLE_SECTIONS = ['project', 'world', 'power', 'plot', 'story_state', 'lore'] as const;
const PlanBundleSection = EnumType.create('PlanBundleSection', [...PLAN_BUNDLE_SECTIONS]);
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

  @Field(() => Object, {
    optional: true,
    additionalProperties: true,
    description: 'Arbitrary key/value frontmatter for the Bible document.',
  })
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

  @Field({ optional: true, description: 'What the chapter writer sees while the fact is hidden; without it the hidden fact is withheld from the writer entirely' })
  writerNote?: string;

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

  @Field(() => Integer, { minimum: 1, description: 'Number of chapters in this volume; approval derives chapter ranges cumulatively.' })
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

  @Field(() => EndingContractSchema, { description: 'Required pacing and ending constraints for the chapter.' })
  endingContract: EndingContractSchema;

  @Field(() => KnowledgeContractSchema, {
    optional: true,
    description: 'Optional character-knowledge constraints; omission leaves the chapter unfiltered.',
  })
  knowledgeContract?: KnowledgeContractSchema;

  @Field({
    optional: true,
    minLength: 1,
    description: "entityKey of the point-of-view character; it pulls that entity's full card into the drafting context. An unknown key is stored and reported as a warning.",
  })
  pov?: string;

  @Field({ optional: true, description: "One sentence on why the chapter exists — its narrative job in the arc, not a restatement of the objective's events." })
  chapterPurpose?: string;

  @Field(() => [String], {
    optional: true,
    description: `What must change for the reader in this chapter, drawn from ${READER_VALUE_CHANGES.join(', ')}; any other value is stored as written and reported as a warning.`,
  })
  readerValue?: string[];

  @Field(() => [String], { optional: true, description: 'Scene patterns or beats this chapter must avoid repeating from recent chapters.' })
  repetitionRisks?: string[];

  @Field({ optional: true, description: 'Free-form authorial direction for the drafter, rendered as its own section of the chapter brief.' })
  guidance?: string;
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

  @Field(() => [PlanBundleFact], { optional: true, description: 'Canon facts used to populate the character-knowledge ledger.' })
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

  @Field(() => [String], { description: 'Non-blocking findings, including every bundle field the import did not recognise and therefore ignored.' })
  warnings: string[];
}
