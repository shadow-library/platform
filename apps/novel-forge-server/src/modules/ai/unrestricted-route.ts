import { type ForgeCallPolicy, type PluginPolicyService, type PolicyCall } from '../plugins/plugin-policy.service';
import { type AiRole } from './defaults';
import { type ProjectConfig } from './model-router.service';

export interface RoutedCall extends PolicyCall {
  role: AiRole;
}

export interface CallRoute {
  policy: ForgeCallPolicy;
  project: ProjectConfig | undefined;
}

export interface UnrestrictedRouteDeps {
  pluginPolicy: Pick<PluginPolicyService, 'resolve'>;
}

/** The router holds every unrestricted call strict on `content_mode`, so Synapse refuses one no unrestricted route serves rather than sending it to a task's default. */
export async function resolveUnrestrictedRoute(deps: UnrestrictedRouteDeps, projectId: bigint, call: RoutedCall, project: ProjectConfig | undefined): Promise<CallRoute> {
  const policy = await deps.pluginPolicy.resolve(projectId, call, { contentMode: 'unrestricted' });
  return { policy, project: { ...project, contentMode: 'unrestricted' } };
}
