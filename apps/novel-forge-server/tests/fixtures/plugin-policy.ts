import { emptyPolicy, type PluginPolicyService, type PluginProposalService } from '@modules/plugins';

/** The plugin-free answer for the suites that assemble a pack but enable no plugin, so they need no `project_plugins` read behind them. */
export function noPluginPolicy(): PluginPolicyService {
  const policy = emptyPolicy();
  return { resolve: async () => policy, scoped: async () => ({ for: () => policy, forPack: () => policy }) } as unknown as PluginPolicyService;
}

/** The plugin-free answer for the suites that outline or seed a bible but enable no plugin, so nothing is ever staged. */
export function noPluginProposals(): PluginProposalService {
  return { augment: async () => undefined, augmentEnabled: async () => [], stageBriefPolicy: async () => undefined } as unknown as PluginProposalService;
}
