import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';

import { type ForgePlugin, PluginController, PluginHost, type PluginManifest } from '@modules/plugins';
import { TestEnvironment } from '@tests/test-environment';

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge');
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

const testEnv = new TestEnvironment('plugin_test');

function fixturePlugin(id: string, overrides: Partial<PluginManifest> = {}): ForgePlugin {
  const manifest: PluginManifest = { id, version: '1.0.0', title: `Title ${id}`, description: `Description ${id}`, decisionPoints: ['call.route'], forms: {}, ...overrides };
  return { id, manifest: () => manifest };
}

describe('PluginHost', () => {
  it('should list nothing before anything is registered', () => {
    expect(new PluginHost().list()).toEqual([]);
  });

  it('should register no plugin when plugins.dir is unset', async () => {
    const host = new PluginHost();

    await host.onModuleInit();

    expect(host.list()).toEqual([]);
  });

  it('should expose a plugin registered through the test seam', () => {
    const host = new PluginHost();

    host.registerForTest(fixturePlugin('twin-track', { decisionPoints: ['brief.policy', 'call.route'], exclusive: ['call.route'] }));

    expect(host.get('twin-track')?.manifest.exclusive).toEqual(['call.route']);
    expect(host.list().map(entry => entry.id)).toEqual(['twin-track']);
  });

  it('should list registered plugins ordered by id', () => {
    const host = new PluginHost();

    for (const id of ['gamma', 'alpha', 'beta']) host.registerForTest(fixturePlugin(id));

    expect(host.list().map(entry => entry.id)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('should refuse a registered plugin whose manifest does not match its id', () => {
    const host = new PluginHost();

    expect(() => host.registerForTest({ id: 'alpha', manifest: () => fixturePlugin('beta').manifest() })).toThrow(/does not match the plugin directory/);
  });
});

describe('PluginController', () => {
  it('should return an empty list when no plugin is loaded', () => {
    const controller = new PluginController(new PluginHost());

    expect(controller.listPlugins()).toEqual([]);
  });

  it('should return the manifest of every loaded plugin', () => {
    const host = new PluginHost();
    host.registerForTest(fixturePlugin('alpha'));

    expect(new PluginController(host).listPlugins()).toEqual([expect.objectContaining({ id: 'alpha', version: '1.0.0', decisionPoints: ['call.route'] })]);
  });
});

describe.if(pgAvailable)('GET /api/v1/plugins', () => {
  testEnv.init();

  it('should return an empty array when plugins.dir is unset', async () => {
    const response = await testEnv.getRouter().mockRequest().get('/api/v1/plugins');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('should reject an unauthenticated caller', async () => {
    const response = await testEnv.getRouter({ authenticated: false }).mockRequest().get('/api/v1/plugins');

    expect(response.statusCode).toBe(401);
  });
});
