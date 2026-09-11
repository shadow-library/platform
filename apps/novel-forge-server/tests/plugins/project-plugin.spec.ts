import { join } from 'node:path';

import { SQL } from 'bun';
import { beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { createPluginLogger, loadPlugins, PluginHost, ScopedPluginHostFactory } from '@modules/plugins';
import { schema } from '@server/database';
import { TestEnvironment } from '@tests/test-environment';
import { issueTestToken } from '@tests/test-idp';

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

// `plugins.dir` is a global config key only plugin-fixture.spec.ts owns, so these suites load the same
// directory themselves and register the result through the host rather than racing that file over it.
const fixtures = await loadPlugins(join(import.meta.dir, 'fixtures'), id => ({ log: createPluginLogger(id) }));

const INTRUDER = '3003';
const intruderToken = await issueTestToken({ sub: INTRUDER });
const ownerToken = await issueTestToken();

const testEnv = new TestEnvironment('project_plugin');

describe.if(pgAvailable)('plugins enabled on a novel', () => {
  testEnv.init();

  beforeAll(() => {
    const host = testEnv.getService(PluginHost);
    for (const entry of fixtures) host.registerForTest(entry.plugin);
  });

  const createProject = async (name: string): Promise<string> => {
    const response = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name, kind: 'new_novel' });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  };

  const enable = (projectId: string, pluginId: string, body: Record<string, unknown> = {}) =>
    testEnv.getRouter().mockRequest().put(`/api/v1/projects/${projectId}/plugins/${pluginId}`).body(body);

  const listEnabled = (projectId: string) => testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/plugins`);

  const disable = (projectId: string, pluginId: string) => testEnv.getRouter().mockRequest().delete(`/api/v1/projects/${projectId}/plugins/${pluginId}`);

  const seedRow = (projectId: string, pluginId: string, pluginVersion: string, config: Record<string, unknown>, ordinal = 0) =>
    testEnv
      .getPostgresClient()
      .insert(schema.projectPlugins)
      .values({ projectId: BigInt(projectId), pluginId, pluginVersion, config, ordinal });

  describe('GET /api/v1/projects/:projectId/plugins', () => {
    it('should return an empty list for a novel with nothing enabled', async () => {
      const projectId = await createProject('plugins-empty');

      const response = await listEnabled(projectId);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('should order the enabled plugins by ordinal then id', async () => {
      const projectId = await createProject('plugins-order');
      await seedRow(projectId, 'gamma-probe', '1.0.0', {}, 5);
      await seedRow(projectId, 'beta-probe', '1.0.0', {}, 1);
      await seedRow(projectId, 'alpha-probe', '1.0.0', {}, 5);

      const response = await listEnabled(projectId);

      expect((response.json() as { pluginId: string }[]).map(entry => entry.pluginId)).toEqual(['beta-probe', 'alpha-probe', 'gamma-probe']);
    });

    it('should reject a caller who does not own the novel', async () => {
      const projectId = await createProject('plugins-bola');

      const response = await testEnv
        .getRouter({ authenticated: false })
        .mockRequest()
        .headers({ authorization: `Bearer ${intruderToken}` })
        .get(`/api/v1/projects/${projectId}/plugins`);

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('PRJ_001');
    });

    it('should reject an unauthenticated caller', async () => {
      const projectId = await createProject('plugins-anon');

      const response = await testEnv.getRouter({ authenticated: false }).mockRequest().get(`/api/v1/projects/${projectId}/plugins`);

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PUT /api/v1/projects/:projectId/plugins/:pluginId', () => {
    it('should enable a plugin with the manifest version its config was validated against', async () => {
      const projectId = await createProject('plugins-enable');

      const response = await enable(projectId, 'twin-track', { config: { markedChapters: '3', addFact: true } });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        pluginId: 'twin-track',
        pluginVersion: '1.0.0',
        config: { markedChapters: '3', addFact: true },
        ordinal: 0,
        installed: true,
        needsReview: false,
        enabledAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('should keep an enablement invisible to another novel', async () => {
      const projectA = await createProject('plugins-a');
      const projectB = await createProject('plugins-b');

      await enable(projectA, 'twin-track', { config: { noteText: 'alpha' } });

      expect((await listEnabled(projectA)).json()).toHaveLength(1);
      expect((await listEnabled(projectB)).json()).toEqual([]);
    });

    it('should replace the stored config when the same plugin is saved again', async () => {
      const projectId = await createProject('plugins-resave');
      await enable(projectId, 'twin-track', { config: { noteText: 'first' }, ordinal: 2 });

      const response = await enable(projectId, 'twin-track', { config: { addFact: false } });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ config: { addFact: false }, ordinal: 0 });
      expect((await listEnabled(projectId)).json()).toHaveLength(1);
    });

    it('should answer PLG_001 for a plugin that is not on disk', async () => {
      const projectId = await createProject('plugins-missing');

      const response = await enable(projectId, 'absent-plugin');

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('PLG_001');
    });

    it('should answer PLG_003 for a config the settings form refuses', async () => {
      const projectId = await createProject('plugins-badconfig');

      const unknownKey = await enable(projectId, 'twin-track', { config: { noteText: 'x', rogue: 1 } });
      const wrongType = await enable(projectId, 'twin-track', { config: { addFact: 'yes' } });
      const missingRequired = await enable(projectId, 'route-claim', { config: {} });
      const outsideEnum = await enable(projectId, 'route-claim', { config: { threshold: 1, mode: 'sideways' } });

      for (const response of [unknownKey, wrongType, missingRequired, outsideEnum]) {
        expect(response.statusCode).toBe(400);
        expect(response.json().code).toBe('PLG_003');
      }
      expect((await listEnabled(projectId)).json()).toEqual([]);
    });

    it('should answer PLG_003 for a number the body overflowed to Infinity', async () => {
      const projectId = await createProject('plugins-infinite');

      const response = await testEnv
        .getRouter({ authenticated: false })
        .mockRequest()
        .headers({ authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' })
        .put(`/api/v1/projects/${projectId}/plugins/route-claim`)
        .body('{"config":{"threshold":1e1000}}');

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('PLG_003');
      expect(response.json().message).toContain('finite');
    });

    it('should answer PLG_003 when the plugin rejects the config from onEnable', async () => {
      const projectId = await createProject('plugins-onenable');

      const response = await enable(projectId, 'route-claim', { config: { threshold: -1 } });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('PLG_003');
      expect(response.json().message).toContain('threshold must not be negative');
      expect((await listEnabled(projectId)).json()).toEqual([]);
    });

    it('should answer PLG_004 when another enabled plugin already claims the same exclusive decision point', async () => {
      const projectId = await createProject('plugins-exclusive');
      expect((await enable(projectId, 'twin-track')).statusCode).toBe(200);

      const response = await enable(projectId, 'route-claim', { config: { threshold: 1 } });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('PLG_004');
      expect(response.json().message).toContain('call.route');
    });

    it('should not treat a plugin as conflicting with its own earlier enablement', async () => {
      const projectId = await createProject('plugins-self');
      await enable(projectId, 'route-claim', { config: { threshold: 1 } });

      const response = await enable(projectId, 'route-claim', { config: { threshold: 2 } });

      expect(response.statusCode).toBe(200);
    });

    it('should let the exclusive point be claimed once the holder is disabled', async () => {
      const projectId = await createProject('plugins-handover');
      await enable(projectId, 'twin-track');
      await disable(projectId, 'twin-track');

      expect((await enable(projectId, 'route-claim', { config: { threshold: 1 } })).statusCode).toBe(200);
    });
  });

  describe('DELETE /api/v1/projects/:projectId/plugins/:pluginId', () => {
    it('should disable idempotently', async () => {
      const projectId = await createProject('plugins-disable');
      await enable(projectId, 'twin-track');

      const first = await disable(projectId, 'twin-track');
      const second = await disable(projectId, 'twin-track');
      const never = await disable(projectId, 'route-claim');

      expect([first.statusCode, second.statusCode, never.statusCode]).toEqual([204, 204, 204]);
      expect((await listEnabled(projectId)).json()).toEqual([]);
    });

    it('should call onDisable only when a row existed', async () => {
      const projectId = await createProject('plugins-ondisable');
      const disabled: unknown[] = [];
      testEnv.getService(PluginHost).registerForTest({
        id: 'disable-probe',
        manifest: () => ({ id: 'disable-probe', version: '1.0.0', title: 'Probe', description: 'Probe', decisionPoints: ['canon.augment'], forms: {} }),
        onDisable: ctx => void disabled.push(ctx.config),
      });
      await enable(projectId, 'disable-probe');

      await disable(projectId, 'disable-probe');
      await disable(projectId, 'disable-probe');

      expect(disabled).toEqual([{}]);
    });

    it('should disable the plugin even when onDisable throws', async () => {
      const projectId = await createProject('plugins-ondisable-throws');
      testEnv.getService(PluginHost).registerForTest({
        id: 'refusing-probe',
        manifest: () => ({ id: 'refusing-probe', version: '1.0.0', title: 'Probe', description: 'Probe', decisionPoints: ['canon.augment'], forms: {} }),
        onDisable: () => {
          throw new Error('probe refuses to be disabled');
        },
      });
      await enable(projectId, 'refusing-probe');

      const response = await disable(projectId, 'refusing-probe');

      expect(response.statusCode).toBe(204);
      expect((await listEnabled(projectId)).json()).toEqual([]);
    });

    it('should keep the kv entries a plugin wrote', async () => {
      const projectId = await createProject('plugins-kv-kept');
      await enable(projectId, 'twin-track');
      await testEnv.getService(ScopedPluginHostFactory).create('twin-track', BigInt(projectId)).kv.set('cursor', { at: 4 });

      await disable(projectId, 'twin-track');

      expect(await testEnv.getService(ScopedPluginHostFactory).create('twin-track', BigInt(projectId)).kv.get('cursor')).toEqual({ at: 4 });
    });
  });

  describe('rows whose plugin changed underneath them', () => {
    it('should report a row whose plugin left the disk as uninstalled without deleting it', async () => {
      const projectId = await createProject('plugins-uninstalled');
      await seedRow(projectId, 'departed', '1.0.0', { anything: true });

      const response = await listEnabled(projectId);

      expect(response.json()).toEqual([expect.objectContaining({ pluginId: 'departed', installed: false, needsReview: false })]);
      const rows = await testEnv.getPostgresClient().query.projectPlugins.findMany({ where: eq(schema.projectPlugins.projectId, BigInt(projectId)) });
      expect(rows).toHaveLength(1);
    });

    it('should not let an uninstalled row hold an exclusive claim', async () => {
      const projectId = await createProject('plugins-uninstalled-claim');
      await seedRow(projectId, 'departed', '1.0.0', {});

      expect((await enable(projectId, 'twin-track')).statusCode).toBe(200);
    });

    it('should flag a row whose config no longer validates against the version on disk', async () => {
      const projectId = await createProject('plugins-needs-review');
      await seedRow(projectId, 'twin-track', '0.9.0', { retiredSetting: 'x' });

      expect((await listEnabled(projectId)).json()).toEqual([expect.objectContaining({ pluginId: 'twin-track', installed: true, needsReview: true })]);
    });

    it('should clear the flag once the author saves a config the new version accepts', async () => {
      const projectId = await createProject('plugins-review-cleared');
      await seedRow(projectId, 'twin-track', '0.9.0', { retiredSetting: 'x' });

      const response = await enable(projectId, 'twin-track', { config: { noteText: 'fresh' } });

      expect(response.json()).toMatchObject({ pluginVersion: '1.0.0', needsReview: false });
    });

    it('should leave a row alone when only its config drifted and the version still matches', async () => {
      const projectId = await createProject('plugins-same-version');
      await seedRow(projectId, 'twin-track', '1.0.0', { retiredSetting: 'x' });

      expect((await listEnabled(projectId)).json()).toEqual([expect.objectContaining({ needsReview: false })]);
    });

    it('should not flag a row whose config still validates against the newer version', async () => {
      const projectId = await createProject('plugins-still-valid');
      await seedRow(projectId, 'twin-track', '0.9.0', { noteText: 'still fine' });

      expect((await listEnabled(projectId)).json()).toEqual([expect.objectContaining({ needsReview: false })]);
    });
  });

  describe('ScopedPluginHost', () => {
    const hostFor = (projectId: string, pluginId = 'twin-track') => testEnv.getService(ScopedPluginHostFactory).create(pluginId, BigInt(projectId));

    it('should round-trip, overwrite, and delete a kv entry', async () => {
      const projectId = await createProject('plugins-kv');
      const host = hostFor(projectId);

      await host.kv.set('cursor', { at: 1 });
      expect(await host.kv.get('cursor')).toEqual({ at: 1 });

      await host.kv.set('cursor', { at: 2 });
      expect(await host.kv.get('cursor')).toEqual({ at: 2 });

      await host.kv.delete('cursor');
      expect(await host.kv.get('cursor')).toBeUndefined();
    });

    it('should round-trip every JSON shape, scalars and null included', async () => {
      const projectId = await createProject('plugins-kv-shapes');
      const host = hostFor(projectId);
      const entries: [string, unknown][] = [
        ['count', 7],
        ['flag', true],
        ['label', 'plain'],
        ['empty', null],
        ['list', [1, 2]],
      ];

      for (const [key, value] of entries) await host.kv.set(key, value);

      expect(await Promise.all(entries.map(([key]) => host.kv.get(key)))).toEqual([7, true, 'plain', null, [1, 2]]);
    });

    it('should answer undefined for a key it never wrote', async () => {
      const projectId = await createProject('plugins-kv-absent');

      expect(await hostFor(projectId).kv.get('never-written')).toBeUndefined();
    });

    it('should keep one plugin out of another plugin kv namespace', async () => {
      const projectId = await createProject('plugins-kv-namespace');
      await hostFor(projectId, 'twin-track').kv.set('shared', 'from twin-track');

      expect(await hostFor(projectId, 'route-claim').kv.get('shared')).toBeUndefined();
    });

    it('should keep one novel out of another novel kv', async () => {
      const projectA = await createProject('plugins-kv-a');
      const projectB = await createProject('plugins-kv-b');
      await hostFor(projectA).kv.set('shared', 'from a');

      expect(await hostFor(projectB).kv.get('shared')).toBeUndefined();
    });

    it('should reject a kv value above the 256 KB serialized bound', async () => {
      const projectId = await createProject('plugins-kv-bound');
      const host = hostFor(projectId);
      const atLimit = 'x'.repeat(256 * 1024 - 2);

      await host.kv.set('big', atLimit);
      expect(await host.kv.get('big')).toBe(atLimit);
      await expect(host.kv.set('bigger', `${atLimit}x`)).rejects.toThrow(/exceeds the 262144 byte limit/);
    });

    it('should reject a kv key the column cannot hold', async () => {
      const projectId = await createProject('plugins-kv-key');
      const host = hostFor(projectId);

      await expect(host.kv.set('', 1)).rejects.toThrow(/between 1 and 128 characters/);
      await expect(host.kv.set('k'.repeat(129), 1)).rejects.toThrow(/between 1 and 128 characters/);
    });

    it('should read only the novel it is bound to', async () => {
      const projectA = await createProject('plugins-read-a');
      const projectB = await createProject('plugins-read-b');
      const db = testEnv.getPostgresClient();
      await db.insert(schema.briefs).values([
        { projectId: BigInt(projectA), chapter: 1, title: 'A one', body: 'body a' },
        { projectId: BigInt(projectB), chapter: 1, title: 'B one', body: 'body b' },
      ]);
      await db.insert(schema.drafts).values({ projectId: BigInt(projectA), chapter: 1, body: 'prose a' });
      await db.insert(schema.entities).values({ projectId: BigInt(projectA), entityKey: 'e1', type: 'character', name: 'One' });
      await db.insert(schema.canonFacts).values({ projectId: BigInt(projectA), factKey: 'f1', text: 'a fact' });

      const host = hostFor(projectA);

      expect(await host.read.brief(1)).toMatchObject({ title: 'A one' });
      expect(await host.read.draft(1)).toMatchObject({ body: 'prose a' });
      expect(await host.read.entities()).toHaveLength(1);
      expect(await host.read.facts()).toHaveLength(1);
      expect(await hostFor(projectB).read.draft(1)).toBeUndefined();
      expect(await hostFor(projectB).read.entities()).toEqual([]);
    });

    it('should answer undefined for a chapter the novel does not have', async () => {
      const projectId = await createProject('plugins-read-absent');

      expect(await hostFor(projectId).read.brief(99)).toBeUndefined();
    });
  });

  describe('plugin_kv', () => {
    it('should be removed with the novel it belongs to', async () => {
      const projectId = await createProject('plugins-kv-cascade');
      await testEnv.getService(ScopedPluginHostFactory).create('twin-track', BigInt(projectId)).kv.set('cursor', 1);

      const response = await testEnv.getRouter().mockRequest().delete(`/api/v1/projects/${projectId}`);

      expect(response.statusCode).toBe(204);
      const rows = await testEnv
        .getPostgresClient()
        .query.pluginKv.findMany({ where: and(eq(schema.pluginKv.projectId, BigInt(projectId)), eq(schema.pluginKv.pluginId, 'twin-track')) });
      expect(rows).toEqual([]);
    });
  });
});
