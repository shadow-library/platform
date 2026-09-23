import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

import { ContentMode, OwnerKind, ProjectKind, SortByTime } from '@server/common';
import { type Owner, type Project } from '@server/database';

import { BlueprintProgressResponse } from '../../blueprint/stage/blueprint-stage.dto';

// Floor keeps a chapter well above what the mechanical check would hard-reject on its own slack (see
// `WORD_COUNT_HARD_SLACK` in `mechanical-check.ts`); ceiling is a sanity bound, not a model capability limit.
export const WORD_TARGET_FLOOR = 500;
export const WORD_TARGET_CEILING = 6000;

@Schema()
export class ProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema({ description: 'Chapter scene-prose word-count target — the generation prompt, length checks, and the expansion pass all read this band.' })
export class ProjectWordTarget {
  @Field(() => Integer, { minimum: WORD_TARGET_FLOOR, maximum: WORD_TARGET_CEILING, description: 'Minimum word count a generated chapter must reach.' })
  min: number;

  @Field(() => Integer, {
    minimum: WORD_TARGET_FLOOR,
    maximum: WORD_TARGET_CEILING,
    description: 'Maximum word count a generated chapter should stay under; must be greater than `min`.',
  })
  max: number;
}

@Schema()
export class CreateProjectBody {
  @Field()
  name: string;

  @Field(() => ProjectKind)
  kind: Project.Kind;

  @Field({ optional: true })
  title?: string;

  @Field({
    optional: true,
    description: 'Project additions to the built-in chapter-writing style (point of view, tone, content limits); they take precedence where the two conflict.',
  })
  instructions?: string;

  @Field(() => ContentMode, { optional: true })
  contentMode?: Project.ContentMode;

  @Field({
    optional: true,
    maxLength: 16,
    pattern: '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$',
    description: 'BCP 47 language tag of the original prose (for example `zh` or `pt-BR`); required for a `translation` project and rejected for any other kind.',
  })
  originalLanguage?: string;

  @Field(() => ProjectWordTarget, { optional: true, description: 'Chapter scene-prose word-count target; omitted uses the application default (1,800–2,600 words).' })
  wordTarget?: ProjectWordTarget;
}

@Schema({ description: 'Provider and model reference used for a project-level AI role override.' })
export class ProjectModelRef {
  @Field()
  provider: string;

  @Field()
  model: string;
}

// Enumerated fields avoid an unnormalised additionalProperties ref that breaks client code generation; keep these synchronized with AiRole.
@Schema({ description: 'Optional provider and model overrides keyed by AI role.' })
export class ProjectModelOverrides {
  @Field(() => ProjectModelRef, { optional: true })
  extraction?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  generation?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  judge?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  fix?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  outline?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  revision?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  title?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  continuity?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  validation?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  review?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  plan?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  skeleton?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  bible?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  premise?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  audit?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  chat?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  compact?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  arc?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  embedding?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  image?: ProjectModelRef;

  @Field(() => ProjectModelRef, { optional: true })
  translate?: ProjectModelRef;
}

@Schema()
export class ProjectConfig {
  @Field(() => ProjectModelOverrides, { optional: true })
  models?: ProjectModelOverrides;
}

@Schema()
export class ProjectResponse {
  @Field(() => String)
  id: bigint;

  @Field()
  name: string;

  @Field(() => ProjectKind)
  kind: Project.Kind;

  @Field(() => OwnerKind, { description: 'Whether the project was created by a signed-in person or an organisation bot.' })
  ownerKind: Owner.Kind;

  @Field({ description: 'True when the project is open to every member of its owning organisation who holds the curate permission, on top of its owner.' })
  sharedWithOrg: boolean;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field({
    optional: true,
    nullable: true,
    description: 'Absolute public cover URL resolved by the server; absent when the project has no cover.',
  })
  coverUrl?: string | null;

  @Field(() => ContentMode)
  contentMode: Project.ContentMode;

  @Field({ optional: true, nullable: true, description: 'BCP 47 language tag of the original prose; set only on a `translation` project.' })
  originalLanguage?: string | null;

  // Non-nullable on purpose: class-schema turns a nullable class-ref into `type: [undefined, 'null']`,
  // which the response serialiser rejects. Fresh projects store `config = null`, so the service maps
  // that null to `undefined` (an omitted field) before serialisation — see `ProjectService.present`.
  @Field(() => ProjectConfig, { optional: true })
  config?: ProjectConfig;

  @Field({ optional: true, nullable: true })
  brief?: string | null;

  @Field({
    optional: true,
    nullable: true,
    description:
      'The project’s additions to the built-in chapter-writing style; null when the project writes to the default alone. The writer receives the built-in style followed by these, and these win where the two conflict.',
  })
  instructions?: string | null;

  @Field(() => Integer, { optional: true, nullable: true })
  storyCurrentChapter?: number | null;

  // Non-nullable for the same class-ref reason as `config` above: a fresh project stores both halves
  // null, and `ProjectService.present` collapses that pair to an omitted field before serialisation.
  @Field(() => ProjectWordTarget, { optional: true, description: 'Effective chapter word-count target, when the project overrides the application default (1,800–2,600 words).' })
  wordTarget?: ProjectWordTarget;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ProjectDetailResponse extends ProjectResponse {
  @Field({ description: 'The built-in chapter-writing style every project writes to; read-only.' })
  defaultInstructions: string;

  @Field({
    description:
      'True when the stored instructions repeated the built-in style, verbatim or as an edited copy, and those lines were dropped from `instructions`. Saving the instructions clears it.',
  })
  defaultCopyRemoved: boolean;
}

@Schema()
export class UploadImageBody {
  @Field(() => String, { enum: ['image/png', 'image/jpeg', 'image/webp'] })
  mime: 'image/png' | 'image/jpeg' | 'image/webp';

  @Field({ description: 'Base64-encoded image bytes without a data URL prefix.' })
  image: string;
}

@Schema({ minProperties: 1 })
export class UpdateProjectBody {
  @Field({ optional: true, maxLength: 500, description: 'The working title. Trimmed; a blank title clears it.' })
  title?: string;

  @Field(() => ProjectConfig, { optional: true })
  config?: ProjectConfig;

  @Field(() => ContentMode, { optional: true })
  contentMode?: Project.ContentMode;

  @Field({ optional: true })
  brief?: string;

  @Field({
    optional: true,
    nullable: true,
    description:
      'Project additions to the built-in chapter-writing style; an empty string or null removes them. A copy of the current or an earlier built-in style inside the text, verbatim or lightly edited, is dropped.',
  })
  instructions?: string | null;

  @Field({
    optional: true,
    nullable: true,
    maxLength: 16,
    pattern: '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$',
    description: 'BCP 47 language tag of the original prose; accepted only on a `translation` project, and only `null` on any other kind.',
  })
  originalLanguage?: string | null;

  @Field(() => ProjectWordTarget, { optional: true, nullable: true, description: 'Chapter word-count target; send `null` to restore the application default (1,800–2,600 words).' })
  wordTarget?: ProjectWordTarget | null;

  @Field(() => ProjectKind, {
    optional: true,
    description: 'Switches the project workflow. Only `curated` to `new_novel` and `translation` to `curated` are accepted.',
  })
  kind?: Project.Kind;
}

@Schema()
export class CloneProjectBody {
  @Field()
  name: string;

  @Field(() => ProjectConfig, { optional: true })
  config?: ProjectConfig;

  @Field(() => ContentMode, { optional: true })
  contentMode?: Project.ContentMode;

  @Field(() => ProjectWordTarget, { optional: true, description: 'Chapter word-count target; omitted inherits the source project’s target (or the application default).' })
  wordTarget?: ProjectWordTarget;

  @Field({ optional: true })
  resetDerived?: boolean;
}

@Schema()
export class ListProjectsQuery extends PaginationQuery(SortByTime, { sortBy: 'updatedAt', sortOrder: 'desc' }) {
  @Field(() => ProjectKind, { optional: true })
  kind?: Project.Kind;
}

@Schema()
export class ListProjectResponse extends Paginated(ProjectResponse) {}

@Schema()
export class ProjectStatusResponse {
  @Field(() => ProjectKind)
  kind: Project.Kind;

  @Field(() => Integer, { optional: true })
  chaptersTotal?: number;

  @Field(() => Integer, { optional: true })
  chaptersExtracted?: number;

  @Field(() => Integer, { optional: true })
  draftsTotal?: number;

  @Field(() => Integer, { optional: true })
  draftsFinal?: number;

  @Field({ optional: true })
  planApproved?: boolean;

  @Field(() => Integer, { optional: true })
  volumesTotal?: number;

  @Field(() => BlueprintProgressResponse, { optional: true, nullable: true, description: 'The Blueprint stage and phases; null for every kind but an original novel.' })
  blueprint?: BlueprintProgressResponse | null;
}

@Schema()
export class ResetBody {
  @Field(() => String, { enum: ['extract', 'plan', 'generate', 'all'] })
  stage: string;
}

@Schema()
export class ResetResponse {
  @Field()
  stage: string;

  @Field(() => [String])
  tablesCleared: string[];
}

@Schema({ description: "Spend and token totals for one slice of a project's model calls." })
export class CostBreakdownItem {
  @Field({ description: 'The model group, role, or model id this row aggregates.' })
  key: string;

  @Field({ description: 'Display name: the registry label for a model, otherwise the key itself.' })
  label: string;

  @Field(() => Integer)
  calls: number;

  @Field(() => Integer)
  inputTokens: number;

  @Field(() => Integer)
  outputTokens: number;

  @Field({ description: 'Recorded cost plus the list-price estimate for calls that recorded none.' })
  costUsd: number;

  @Field({ description: 'The part of `costUsd` estimated from registry list prices because the call recorded no cost.' })
  estimatedCostUsd: number;
}

@Schema()
export class CostResponse {
  @Field()
  totalCostUsd: number;

  @Field({ description: 'The part of `totalCostUsd` estimated from registry list prices because the call recorded no cost. Zero means every figure was recorded.' })
  estimatedCostUsd: number;

  @Field({ description: 'Spend by calls made in the last 7 days.' })
  last7DaysCostUsd: number;

  @Field({ description: 'Spend by calls made in the last 30 days.' })
  last30DaysCostUsd: number;

  @Field(() => Integer, { description: 'Every recorded model call, including transport-error calls that carry no tokens or cost.' })
  calls: number;

  @Field(() => Integer)
  inputTokens: number;

  @Field(() => Integer)
  outputTokens: number;

  @Field(() => [CostBreakdownItem], { description: 'By user-facing model group, highest spend first.' })
  byGroup: CostBreakdownItem[];

  @Field(() => [CostBreakdownItem], { description: 'By internal call role, highest spend first.' })
  byRole: CostBreakdownItem[];

  @Field(() => [CostBreakdownItem], { description: 'By model, highest spend first.' })
  byModel: CostBreakdownItem[];
}
