import { Field, Integer, Schema } from '@shadow-library/class-schema';

@Schema()
export class AiModelOption {
  @Field()
  id: string;

  @Field()
  provider: string;

  @Field()
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

  @Field(() => AccountModelRef, { optional: true, description: 'Premise, plan, arcs, outlines, bible and extraction.' })
  planning?: AccountModelRef;

  @Field(() => AccountModelRef, { optional: true, description: 'Continuity judge, validation and editorial review.' })
  review?: AccountModelRef;

  @Field(() => AccountModelRef, { optional: true, description: 'Refinement chat on a novel.' })
  chat?: AccountModelRef;

  @Field(() => AccountModelRef, { optional: true, description: 'Idea names, chapter titles and context compaction.' })
  helper?: AccountModelRef;

  @Field(() => AccountModelRef, { optional: true, description: 'Cover and scene art; must name an image model.' })
  image?: AccountModelRef;

  @Field(() => AccountModelRef, { optional: true, description: 'Ideation studio chats.' })
  ideation?: AccountModelRef;
}

@Schema({ description: 'Settings that apply to every project and idea the signed-in author owns.' })
export class AccountSettingsResponse {
  @Field(() => AccountModelDefaults, {
    description: 'Used when neither a chat pin nor the project names a model. Unrestricted projects only take a default on the unrestricted allowlist.',
  })
  models: AccountModelDefaults;
}

@Schema({ description: 'Replaces the signed-in author’s settings.' })
export class UpdateAccountSettingsBody {
  @Field(() => AccountModelDefaults, { description: 'The full set of defaults; a group left out goes back to the platform default.' })
  models: AccountModelDefaults;
}
