import type { ForgePlugin, PluginManifest, ProjectContext } from '../../../../src/modules/plugins/plugin.types';

import manifest from './manifest.json';

function readThreshold(config: unknown): number {
  const record = typeof config === 'object' && config !== null ? (config as Record<string, unknown>) : {};
  return typeof record['threshold'] === 'number' ? record['threshold'] : 0;
}

/** A bound no `PluginFormField` can express, so it is the semantic rule `onEnable` exists to enforce. */
function onEnable(ctx: ProjectContext): void {
  if (readThreshold(ctx.config) < 0) throw new Error('threshold must not be negative');
}

function createPlugin(): ForgePlugin {
  return {
    id: 'route-claim',
    manifest: () => manifest as unknown as PluginManifest,
    onEnable,
  };
}

export default createPlugin;
