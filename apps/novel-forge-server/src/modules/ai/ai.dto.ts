import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { ContentMode, CostTier } from '@server/common';
import { type Project } from '@server/database';

import { CostResponse } from '../project/project/project.dto';

@Schema({ description: 'A Synapse alias the catalog lists for the chat task (provider `synapse`); informational, since no request selects one.' })
export class AiModelOption {
  @Field({ description: 'The Synapse alias key.' })
  id: string;

  @Field({ description: '`synapse` for a Synapse alias.' })
  provider: string;

  @Field({ description: 'The product name an admin sees — a product name on its own, never a gateway or a slug; never shown to an author.' })
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

  @Field({ description: '`synapse`, where `model` is the catalog model its routes pick.' })
  provider: string;

  @Field()
  model: string;
}

@Schema()
export class AiModelLabel {
  @Field({ description: 'A model key as calls, replies and reviews record it: a Synapse catalog model, or a registry slug on rows written before Synapse.' })
  model: string;

  @Field({ description: 'The product name an admin sees; never shown to an author.' })
  label: string;

  @Field(() => Number, { optional: true, description: 'USD per million input tokens, for estimating an old call that recorded no cost; absent for image models.' })
  inputPricePerMToken?: number;

  @Field(() => Number, { optional: true, description: 'USD per million output tokens, for estimating an old call that recorded no cost; absent for image models.' })
  outputPricePerMToken?: number;
}

@Schema()
export class AiTierModel {
  @Field(() => CostTier)
  costTier: Project.CostTier;

  @Field(() => ContentMode)
  contentMode: Project.ContentMode;

  @Field({ description: 'Model group: writing, planning, review, chat, helper or image.' })
  group: string;

  @Field({ description: '`synapse`, where `model` is the catalog model its routes pick.' })
  provider: string;

  @Field()
  model: string;

  @Field({ description: 'The product name an admin sees; never shown to an author.' })
  label: string;

  @Field(() => Number, { optional: true, description: 'USD per million input tokens; absent for image models.' })
  inputPricePerMToken?: number;

  @Field(() => Number, { optional: true, description: 'USD per million output tokens; absent for image models.' })
  outputPricePerMToken?: number;
}

@Schema({ description: 'What an author chooses between: the paces and whether Unrestricted is on offer. Which model serves each is admin-only (`GET /ai/models/admin`).' })
export class AiModelsResponse {
  @Field(() => [CostTier], { description: 'Every pace by its wire key, fastest first: economy (Swift), balanced (Steady), performant (Meticulous).' })
  paces: Project.CostTier[];

  @Field({
    description:
      'Whether an author may choose Unrestricted for a novel, a chapter plan or a reply: true only while the catalog routes unrestricted writing for every task at every pace.',
  })
  unrestrictedAvailable: boolean;
}

@Schema({ description: 'The models, labels and prices behind every pace and content mode; admin-only.' })
export class AiModelsAdminResponse extends AiModelsResponse {
  @Field({ description: "The active server profile. Roles without an override inherit this profile's defaults." })
  profile: string;

  @Field(() => [AiModelOption], { description: 'The aliases the catalog lists for the chat task under any model type and cost tier; nothing pins or selects one.' })
  models: AiModelOption[];

  @Field(() => [AiRoleDefault])
  defaults: AiRoleDefault[];

  @Field(() => [AiRoleDefault], { description: 'Group defaults used when a project is in Unrestricted content mode.' })
  unrestrictedDefaults: AiRoleDefault[];

  @Field(() => [String], { description: 'The `models` ids the catalog lists for the chat task under the unrestricted content mode.' })
  unrestrictedAllowlist: string[];

  @Field(() => [AiTierModel], {
    description: 'The platform model for every cost tier × model type × author-selectable group. Balanced equals `defaults` / `unrestrictedDefaults`.',
  })
  tiers: AiTierModel[];

  @Field(() => [AiModelLabel], { description: 'Names for the model keys calls, replies and reviews record, which `models` does not list.' })
  modelLabels: AiModelLabel[];
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

  @Field({ description: '`synapse`, where `model` is the catalog model its routes pick.' })
  provider: string;

  @Field()
  model: string;

  @Field({ description: 'The product name an admin sees; never shown to an author.' })
  label: string;

  @Field(() => Number, { optional: true, description: 'USD per million input tokens; absent for image models.' })
  inputPricePerMToken?: number;

  @Field(() => Number, { optional: true, description: 'USD per million output tokens; absent for image models.' })
  outputPricePerMToken?: number;
}

@Schema({ description: 'What each group of AI work on this novel runs on under one model type and cost tier; admin-only.' })
export class ProjectModelsResponse {
  @Field(() => ContentMode)
  contentMode: Project.ContentMode;

  @Field(() => CostTier)
  costTier: Project.CostTier;

  @Field(() => [ProjectModelRoute])
  models: ProjectModelRoute[];
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
