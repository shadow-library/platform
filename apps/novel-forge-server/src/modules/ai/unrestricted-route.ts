import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { type ForgeCallPolicy, type PluginPolicyService, type PolicyCall } from '../plugins/plugin-policy.service';
import { type AiRole, isUnrestrictedAllowed } from './defaults';
import { type ModelRouterService, type ProjectConfig } from './model-router.service';

export interface RoutedCall extends PolicyCall {
  role: AiRole;
}

export interface CallRoute {
  policy: ForgeCallPolicy;
  project: ProjectConfig | undefined;
}

export interface UnrestrictedRouteDeps {
  pluginPolicy: Pick<PluginPolicyService, 'resolve'>;
  modelRouter: Pick<ModelRouterService, 'resolveFor'>;
}

const logger = Logger.getLogger(APP_NAME, 'unrestricted-route');

export async function resolveUnrestrictedRoute(deps: UnrestrictedRouteDeps, projectId: bigint, call: RoutedCall, project: ProjectConfig | undefined): Promise<CallRoute> {
  const policy = await deps.pluginPolicy.resolve(projectId, call, { contentMode: 'unrestricted' });
  const routed: ProjectConfig = { ...project, contentMode: 'unrestricted' };
  const resolved = await deps.modelRouter.resolveFor(call.role, routed, projectId, policy);
  if (isUnrestrictedAllowed(call.role, resolved)) return { policy, project: routed };
  logger.warn('unrestricted route resolved a model off the allowlist — refusing the call', { projectId, role: call.role, model: resolved.model });
  throw AppErrorCode.AI_003.create();
}
