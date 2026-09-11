import { EnumType, Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { ACTION_SURFACES, DECISION_POINTS, PLUGIN_ID_PATTERN } from './plugin-loader';
import { type DecisionPoint, type PluginAction } from './plugin.types';

const DecisionPointEnum = EnumType.create('DecisionPoint', [...DECISION_POINTS]);
const ActionSurfaceEnum = EnumType.create('PluginActionSurface', [...ACTION_SURFACES]);

@Schema({ description: 'An author-triggered action the plugin surfaces in the UI. Invoking one is not yet supported.' })
export class PluginActionResponse {
  @Field()
  id: string;

  @Field({ description: 'Operation name passed back to the plugin when the action runs.' })
  op: string;

  @Field()
  label: string;

  @Field(() => ActionSurfaceEnum, { description: 'Where the action is offered.' })
  surface: PluginAction['surface'];

  @Field({ optional: true, description: 'Name of the manifest form collecting arguments for this action.' })
  form?: string;
}

@Schema({ description: 'Manifest of one plugin loaded on this deploy.' })
export class PluginManifestResponse {
  @Field({ description: 'Stable plugin identifier, equal to its directory name under the deployment plugin directory.' })
  id: string;

  @Field({ description: 'Manifest version the stored per-novel config is validated against.' })
  version: string;

  @Field()
  title: string;

  @Field()
  description: string;

  @Field(() => [DecisionPointEnum], { description: 'Pipeline decision points this plugin answers.' })
  decisionPoints: DecisionPoint[];

  @Field(() => [DecisionPointEnum], {
    optional: true,
    description: 'Decision points claimed exclusively — a second plugin claiming one of these cannot be enabled on the same novel.',
  })
  exclusive?: DecisionPoint[];

  @Field(() => Object, { additionalProperties: true, description: 'Declared forms keyed by name; `settings` is the per-novel configuration form rendered from its field list.' })
  forms: Record<string, unknown>;

  @Field(() => [PluginActionResponse], { optional: true })
  actions?: PluginAction[];
}

@Schema()
export class PluginProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class PluginIdParams extends PluginProjectParams {
  @Field({ pattern: PLUGIN_ID_PATTERN.source, maxLength: 64 })
  pluginId: string;
}

@Schema({ description: 'Enable the plugin on this novel, or replace the settings it is already enabled with.' })
export class EnablePluginBody {
  @Field(() => Object, {
    optional: true,
    additionalProperties: true,
    description: 'Values for the fields the manifest declares under `forms.settings`. Any other key is rejected; omitting it stores an empty config.',
  })
  config?: Record<string, unknown>;

  @Field(() => Integer, {
    optional: true,
    minimum: 0,
    description:
      'Order this plugin contributes in relative to the other plugins enabled on the novel. Lower runs first. This request replaces the stored row, so omitting it resets the order to 0.',
  })
  ordinal?: number;
}

@Schema({ description: 'One plugin enabled on a novel, with the settings it was last saved with.' })
export class ProjectPluginResponse {
  @Field()
  pluginId: string;

  @Field({ description: 'Manifest version the stored config was validated against.' })
  pluginVersion: string;

  @Field(() => Object, { additionalProperties: true })
  config: Record<string, unknown>;

  @Field(() => Integer)
  ordinal: number;

  @Field({ description: 'False when the plugin is no longer on disk. The enablement is kept, but it contributes to no decision point.' })
  installed: boolean;

  @Field({
    description: 'True when the plugin on disk reports a different version and the stored config no longer validates. It contributes nothing until the settings are saved again.',
  })
  needsReview: boolean;

  @Field(() => String, { format: 'date-time' })
  enabledAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}
