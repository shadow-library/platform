/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

/**
 * Importing user defined packages
 */
import { ContentMode, ProjectKind, SortByTime } from '@server/common';
import { type Project } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class ProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class CreateProjectBody {
  @Field()
  name: string;

  @Field(() => ProjectKind)
  kind: Project.Kind;

  @Field({ optional: true })
  url?: string;

  @Field({ optional: true })
  title?: string;

  @Field(() => ContentMode, { optional: true })
  contentMode?: Project.ContentMode;
}

// The project `config` blob. Today it carries only per-role model overrides; kept as a typed schema
// (rather than a freeform object) so the generated client sees the real shape. Mirrors the internal
// `ResolvedModel` / `AiRole` contract in `ai/defaults.ts` — keep the two in sync.
@Schema()
export class ProjectModelRef {
  @Field()
  provider: string;

  @Field()
  model: string;
}

// A per-role model-override map. Enumerated rather than a `Record` so the generated OpenAPI carries a
// resolvable `$ref` for each value (an `additionalProperties`-schema map emits an unnormalised ref that
// breaks client codegen). One optional field per `AiRole` (see `ai/defaults.ts`) — keep the two in sync.
@Schema()
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

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field(() => ContentMode)
  contentMode: Project.ContentMode;

  // Non-nullable on purpose: class-schema turns a nullable class-ref into `type: [undefined, 'null']`,
  // which the response serialiser rejects. Fresh projects store `config = null`, so the service maps
  // that null to `undefined` (an omitted field) before serialisation — see `ProjectService.present`.
  @Field(() => ProjectConfig, { optional: true })
  config?: ProjectConfig;

  @Field({ optional: true, nullable: true })
  brief?: string | null;

  @Field({ optional: true, nullable: true })
  sourceUrl?: string | null;

  @Field()
  scrapeComplete: boolean;

  @Field(() => Integer, { optional: true, nullable: true })
  storyCurrentChapter?: number | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema({ minProperties: 1 })
export class UpdateProjectBody {
  @Field({ optional: true })
  title?: string;

  @Field(() => ProjectConfig, { optional: true })
  config?: ProjectConfig;

  @Field(() => ContentMode, { optional: true })
  contentMode?: Project.ContentMode;

  @Field({ optional: true })
  brief?: string;
}

@Schema()
export class CloneProjectBody {
  @Field()
  name: string;

  @Field(() => ProjectConfig, { optional: true })
  config?: ProjectConfig;

  @Field(() => ContentMode, { optional: true })
  contentMode?: Project.ContentMode;

  @Field({ optional: true })
  resetDerived?: boolean;
}

@Schema()
export class ListProjectsQuery extends PaginationQuery(SortByTime) {
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

@Schema()
export class CostResponse {
  @Field(() => String, { nullable: true })
  estimate: null;

  @Field()
  message: string;
}
