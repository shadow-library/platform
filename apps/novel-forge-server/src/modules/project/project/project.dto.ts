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
  @Field() name: string;
  @Field(() => ProjectKind) kind: Project.Kind;
  @Field({ optional: true }) url?: string;
  @Field({ optional: true }) title?: string;
  @Field(() => ContentMode, { optional: true }) contentMode?: Project.ContentMode;
}

@Schema()
export class ProjectResponse {
  @Field(() => String) id: bigint;
  @Field() name: string;
  @Field(() => ProjectKind) kind: Project.Kind;
  @Field({ optional: true, nullable: true }) title?: string | null;
  @Field(() => ContentMode) contentMode: Project.ContentMode;
  @Field(() => Object, { optional: true, nullable: true }) config?: Record<string, unknown> | null;
  @Field({ optional: true, nullable: true }) brief?: string | null;
  @Field({ optional: true, nullable: true }) sourceUrl?: string | null;
  @Field() scrapeComplete: boolean;
  @Field(() => Integer, { optional: true, nullable: true }) storyCurrentChapter?: number | null;
  @Field(() => String, { format: 'date-time' }) createdAt: Date;
  @Field(() => String, { format: 'date-time' }) updatedAt: Date;
}

@Schema({ minProperties: 1 })
export class UpdateProjectBody {
  @Field({ optional: true }) title?: string;
  @Field(() => Object, { optional: true }) config?: Record<string, unknown>;
  @Field(() => ContentMode, { optional: true }) contentMode?: Project.ContentMode;
  @Field({ optional: true }) brief?: string;
}

@Schema()
export class CloneProjectBody {
  @Field() name: string;
  @Field(() => Object, { optional: true }) config?: Record<string, unknown>;
  @Field(() => ContentMode, { optional: true }) contentMode?: Project.ContentMode;
  @Field({ optional: true }) resetDerived?: boolean;
}

@Schema()
export class ListProjectsQuery extends PaginationQuery(SortByTime) {
  @Field(() => ProjectKind, { optional: true }) kind?: Project.Kind;
}

@Schema()
export class ListProjectResponse extends Paginated(ProjectResponse) {}

@Schema()
export class ProjectStatusResponse {
  @Field(() => ProjectKind) kind: Project.Kind;
  @Field(() => Integer, { optional: true }) chaptersTotal?: number;
  @Field(() => Integer, { optional: true }) chaptersExtracted?: number;
  @Field(() => Integer, { optional: true }) draftsTotal?: number;
  @Field(() => Integer, { optional: true }) draftsFinal?: number;
  @Field({ optional: true }) planApproved?: boolean;
  @Field(() => Integer, { optional: true }) volumesTotal?: number;
}

@Schema()
export class ResetBody {
  @Field(() => String, { enum: ['extract', 'plan', 'generate', 'all'] }) stage: string;
}

@Schema()
export class ResetResponse {
  @Field() stage: string;
  @Field(() => [String]) tablesCleared: string[];
}

@Schema()
export class CostResponse {
  @Field(() => String, { nullable: true }) estimate: null;
  @Field() message: string;
}
