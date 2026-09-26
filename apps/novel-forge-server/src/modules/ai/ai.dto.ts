import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { ContentMode, CostTier } from '@server/common';
import { type Project } from '@server/database';

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
    enum: ['project', 'account', 'tier'],
    description: "Why this model: the project's own pick, the author's Balanced default, or the platform tier map.",
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

@Schema()
export class AccountModelRef {
  @Field()
  provider: string;

  @Field()
  model: string;
}

// Enumerated per group, like `ProjectModelOverrides`, so client code generation sees a closed object.
@Schema({ description: 'Your default model per group. A group left out uses the platform default.' })
export class AccountModelDefaults {
  @Field(() => AccountModelRef, { optional: true, description: 'Chapter prose: drafts, revisions and repairs.' })
  writing?: AccountModelRef;

  @Field(() => AccountModelRef, { optional: true, description: 'Premise, chapter plans, bible and extraction.' })
  planning?: AccountModelRef;

  @Field(() => AccountModelRef, { optional: true, description: 'Continuity judge, validation and editorial review.' })
  review?: AccountModelRef;

  @Field(() => AccountModelRef, { optional: true, description: 'Refinement chat on a novel.' })
  chat?: AccountModelRef;

  @Field(() => AccountModelRef, { optional: true, description: 'Idea names, chapter titles and context compaction.' })
  helper?: AccountModelRef;

  @Field(() => AccountModelRef, { optional: true, description: 'Cover and scene art; must name an image model.' })
  image?: AccountModelRef;
}

@Schema({ description: 'Settings that apply to every project and idea the signed-in author owns.' })
export class AccountSettingsResponse {
  @Field(() => AccountModelDefaults, {
    description:
      'Your Balanced tier: used at Balanced when neither a chat pin nor the project names a model; Economy and Performant use the tier map instead. ' +
      'Unrestricted work only takes a default on the unrestricted allowlist.',
  })
  models: AccountModelDefaults;
}

@Schema({ description: 'Replaces the signed-in author’s settings.' })
export class UpdateAccountSettingsBody {
  @Field(() => AccountModelDefaults, { description: 'The full set of defaults; a group left out goes back to the platform default.' })
  models: AccountModelDefaults;
}
