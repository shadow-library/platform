import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { ContentMode, CostTier } from '@server/common';
import { type Project } from '@server/database';

import { CostResponse } from '../project/project/project.dto';
import { type ModelSource } from './model-router.service';

@Schema()
export class AiModelOption {
  @Field()
  id: string;

  @Field()
  provider: string;

  @Field({ description: 'The name to show an author — a product name on its own, never a gateway or a slug. The embedding entry, which is never offered, carries its id.' })
  label: string;

  @Field(() => String, { enum: ['llm', 'embedding', 'image'] })
  kind: string;

  @Field({ description: 'Whether the server can currently route requests to this model.' })
  enabled: boolean;

  @Field(() => Integer, { optional: true })
  contextWindow?: number;

  @Field(() => Number, { optional: true })
  inputPricePerMToken?: number;

  @Field(() => Number, { optional: true })
  outputPricePerMToken?: number;

  @Field({ optional: true })
  supportsTools?: boolean;

  @Field({ optional: true })
  supportsStructuredOutput?: boolean;
}

@Schema()
export class AiRoleDefault {
  @Field()
  role: string;

  @Field()
  provider: string;

  @Field()
  model: string;
}

@Schema()
export class AiTierModel {
  @Field(() => CostTier)
  costTier: Project.CostTier;

  @Field(() => ContentMode)
  contentMode: Project.ContentMode;

  @Field({ description: 'Model group: writing, planning, review, chat, helper or image.' })
  group: string;

  @Field()
  provider: string;

  @Field()
  model: string;

  @Field({ description: 'The product name to show an author.' })
  label: string;

  @Field(() => Number, { optional: true, description: 'USD per million input tokens; absent for image models.' })
  inputPricePerMToken?: number;

  @Field(() => Number, { optional: true, description: 'USD per million output tokens; absent for image models.' })
  outputPricePerMToken?: number;
}

@Schema()
export class AiModelsResponse {
  @Field({ description: "The active server profile. Roles without an override inherit this profile's defaults." })
  profile: string;

  @Field(() => [AiModelOption])
  models: AiModelOption[];

  @Field(() => [AiRoleDefault])
  defaults: AiRoleDefault[];

  @Field(() => [AiRoleDefault], { description: 'Group defaults used when a project is in Unrestricted content mode.' })
  unrestrictedDefaults: AiRoleDefault[];

  @Field(() => [String], { description: 'Model ids that Unrestricted projects may select. Others are coerced to the Unrestricted group default.' })
  unrestrictedAllowlist: string[];

  @Field(() => [AiTierModel], {
    description: 'The platform model for every cost tier × model type × author-selectable group. Balanced equals `defaults` / `unrestrictedDefaults`.',
  })
  tiers: AiTierModel[];
}

@Schema()
export class ProjectAiParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class ProjectModelsQuery {
  @Field(() => ContentMode, { optional: true, description: "Preview this model type instead of the project's own." })
  contentMode?: Project.ContentMode;

  @Field(() => CostTier, { optional: true, description: "Preview this cost tier instead of the project's own." })
  costTier?: Project.CostTier;
}

@Schema()
export class ProjectModelRoute {
  @Field({ description: 'Model group: writing, planning, review, chat, helper or image.' })
  group: string;

  @Field()
  provider: string;

  @Field()
  model: string;

  @Field({ description: 'The product name to show an author.' })
  label: string;

  @Field(() => String, {
    enum: ['project', 'tier'],
    description: "Why this model: the project's own pick, or the platform's model for the cost tier.",
  })
  source: ModelSource;

  @Field(() => Number, { optional: true })
  inputPricePerMToken?: number;

  @Field(() => Number, { optional: true })
  outputPricePerMToken?: number;
}

@Schema({ description: 'What each group of AI work on this novel runs on under one model type and cost tier — a chat pin is not included.' })
export class ProjectModelsResponse {
  @Field(() => ContentMode)
  contentMode: Project.ContentMode;

  @Field(() => CostTier)
  costTier: Project.CostTier;

  @Field(() => [ProjectModelRoute])
  models: ProjectModelRoute[];
}

@Schema({ description: 'The signed-in author’s own settings.' })
export class AccountSettingsResponse {
  @Field(() => CostTier, { description: 'The cost tier a new project starts on when its creation request names none.' })
  defaultCostTier: Project.CostTier;
}

@Schema({ description: 'Replaces the signed-in author’s settings.' })
export class UpdateAccountSettingsBody {
  @Field(() => CostTier, { description: 'The cost tier a new project starts on when its creation request names none.' })
  defaultCostTier: Project.CostTier;
}

@Schema({ description: "Spend on one of the signed-in author's novels." })
export class ProjectCostItem {
  @Field(() => String)
  projectId: bigint;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field(() => Integer)
  calls: number;

  @Field()
  costUsd: number;
}

@Schema({ description: "Cost, tokens and calls across every novel the signed-in author owns — the same shaping as a single project's cost, plus a per-novel breakdown." })
export class AccountUsageResponse extends CostResponse {
  @Field(() => [ProjectCostItem], { description: 'By novel, highest spend first.' })
  byProject: ProjectCostItem[];
}

@Schema({ description: 'The rolling spend window an author’s calls are throttled against.' })
export class AiQuotaResponse {
  @Field(() => Integer)
  calls: number;

  @Field()
  costUsd: number;

  @Field(() => Integer, { description: 'Calls allowed in the window; 0 or below means the rate dimension is disabled.' })
  maxCalls: number;

  @Field({ description: 'Spend allowed in the window, in USD; 0 or below means the spend dimension is disabled.' })
  maxCostUsd: number;

  @Field(() => Integer, { description: 'Width of the rolling window, in milliseconds.' })
  windowMs: number;

  @Field(() => String, {
    format: 'date-time',
    optional: true,
    nullable: true,
    description: 'When the oldest call counted in the window ages out and the window first frees capacity. Null when nothing is counted in the window right now.',
  })
  resetsAt?: Date | null;
}
