import { describe, expect, it } from 'bun:test';

import { PluginHost, type ScopedPluginHostFactory } from '@modules/plugins/plugin-host.service';
import { PluginPolicyService } from '@modules/plugins/plugin-policy.service';

function policyOver(host: PluginHost, rows: unknown[] = []) {
  const reads: string[] = [];
  const db = {
    query: {
      projects: { findFirst: async () => (reads.push('projects'), { contentMode: 'standard' }) },
      projectPlugins: { findMany: async () => (reads.push('project_plugins'), rows) },
    },
  };
  const scopedHosts = { create: () => ({}) } as unknown as ScopedPluginHostFactory;
  return { policy: new PluginPolicyService({ getPostgresClient: () => db } as never, host, scopedHosts), reads };
}

function hostWith(id: string): PluginHost {
  const host = new PluginHost();
  host.registerForTest({
    id,
    manifest: () => ({ id, version: '1.0.0', title: id, description: id, decisionPoints: ['call.route'], forms: {} }) as never,
    decideWriterClass: () => 'permissive',
  });
  return host;
}

describe('PluginPolicyService', () => {
  it('should resolve a call without reading the database when no plugin is loaded and the project is in hand', async () => {
    const { policy, reads } = policyOver(new PluginHost());

    const resolved = await policy.resolve(7n, { role: 'writer' }, { contentMode: 'unrestricted' });

    expect(resolved.writerClass).toBe('permissive');
    expect(resolved.plugins).toEqual([]);
    expect(reads).toEqual([]);
  });

  it('should still read the project baseline when no plugin is loaded and none was passed', async () => {
    const { policy, reads } = policyOver(new PluginHost());

    expect((await policy.resolve(7n, { role: 'writer' })).writerClass).toBe('standard');
    expect(reads).toEqual(['projects']);
  });

  it("should apply a loaded plugin the project enabled, reading the project's plugins once", async () => {
    const { policy, reads } = policyOver(hostWith('raiser'), [{ pluginId: 'raiser', pluginVersion: '1.0.0', config: {} }]);

    const resolver = await policy.scoped(7n, { contentMode: 'standard' });

    expect(resolver.for({ role: 'writer' })).toMatchObject({ writerClass: 'permissive', raised: true, plugins: [{ id: 'raiser', version: '1.0.0' }] });
    expect(reads).toEqual(['project_plugins']);
  });
});
