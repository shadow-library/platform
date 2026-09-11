import type { CallContext, ForgePlugin, PluginManifest, ProjectContext, WriterClass } from '../../../../src/modules/plugins/plugin.types';

import manifest from './manifest.json';

function readRaisedRole(config: unknown): string {
  const record = typeof config === 'object' && config !== null ? (config as Record<string, unknown>) : {};
  return typeof record['raisedRole'] === 'string' ? record['raisedRole'] : '';
}

function decideWriterClass(ctx: ProjectContext & CallContext): WriterClass | undefined {
  return ctx.role === readRaisedRole(ctx.config) ? 'permissive' : undefined;
}

function createPlugin(): ForgePlugin {
  return {
    id: 'role-route',
    manifest: () => manifest as unknown as PluginManifest,
    decideWriterClass,
  };
}

export default createPlugin;
