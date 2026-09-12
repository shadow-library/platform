import { emptyPolicy, type PluginPolicyService } from '@modules/plugins';

/** The plugin-free answer for the suites that assemble a pack but enable no plugin, so they need no `project_plugins` read behind them. */
export function noPluginPolicy(): PluginPolicyService {
  const policy = emptyPolicy();
  return { resolve: async () => policy, scoped: async () => ({ for: () => policy, forPack: () => policy }) } as unknown as PluginPolicyService;
}
