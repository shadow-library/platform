/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb } from '../../lib';
import { expect, test } from './forge-actors';
import { expectCode, guardedProject } from './forge-arrange';
import { assertSpendGuarded } from './forge-db';

/**
 * Declaring the constants
 *
 * The plugin surface on a deployment with no plugin directory, which is how dev runs: nothing is installed, so no plugin can be enabled or
 * asked to augment a novel, and the routes still guard the novel they address. Installed-plugin behaviour needs a fixture directory on the
 * server and is out of reach here.
 */

const MISSING_PLUGIN = 'e2e-missing-plugin';

async function enabledPluginRows(projectId: string): Promise<number> {
  const [row] = await novelForgeDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM project_plugins WHERE project_id = ${projectId}`;
  return row?.count ?? 0;
}

test.describe('novel-forge plugins without a plugin directory', () => {
  test('should list no installed plugins, and only to a signed-in caller', async ({ forge }) => {
    const author = await forge.actor({ label: 'plugins-list' });

    const listed = await author.ctx.get('/api/v1/plugins');
    expect(listed.status(), await listed.text()).toBe(200);
    expect(await listed.json()).toEqual([]);

    await expectCode(await (await forge.anonymous()).get('/api/v1/plugins'), 401, 'IAM_001', 'an anonymous caller');
  });

  test("should keep a novel's plugin routes to its owner and refuse plugins that are not installed", async ({ forge }) => {
    const owner = await forge.actor({ label: 'plugins-owner' });
    const stranger = await forge.actor({ label: 'plugins-stranger' });
    const anonymous = await forge.anonymous();
    const projectId = await guardedProject(forge, owner, 'plugins');
    const base = `/api/v1/projects/${projectId}/plugins`;

    await expectCode(await stranger.ctx.get(base), 404, 'PRJ_001', "a stranger listing the novel's plugins");
    await expectCode(await mutate(stranger.ctx, 'put', `${base}/${MISSING_PLUGIN}`, { data: {} }), 404, 'PRJ_001', 'a stranger enabling a plugin');
    await expectCode(await mutate(stranger.ctx, 'delete', `${base}/${MISSING_PLUGIN}`), 404, 'PRJ_001', 'a stranger disabling a plugin');
    await expectCode(await mutate(stranger.ctx, 'post', `${base}/${MISSING_PLUGIN}/augment`), 404, 'PRJ_001', 'a stranger asking a plugin to augment');
    await expectCode(await anonymous.get(base), 401, 'IAM_001', 'an anonymous listing');
    await expectCode(await anonymous.put(`${base}/${MISSING_PLUGIN}`, { data: {} }), 401, 'IAM_001', 'an anonymous enable');
    await expectCode(await anonymous.delete(`${base}/${MISSING_PLUGIN}`), 401, 'IAM_001', 'an anonymous disable');
    await expectCode(await anonymous.post(`${base}/${MISSING_PLUGIN}/augment`), 401, 'IAM_001', 'an anonymous augment');

    await expectCode(await mutate(owner.ctx, 'put', `${base}/${MISSING_PLUGIN}`, { data: { config: {} } }), 404, 'PLG_001', 'enabling a plugin not on disk');
    await assertSpendGuarded(projectId, { requireQuota: true });
    await expectCode(await mutate(owner.ctx, 'post', `${base}/${MISSING_PLUGIN}/augment`), 404, 'PLG_001', 'augmenting with a plugin not on disk');
    const malformed = await mutate(owner.ctx, 'put', `${base}/Not_A_Plugin`, { data: {} });
    expect(malformed.status(), `a plugin id outside the id pattern — body ${await malformed.text()}`).toBe(422);
    expect(await enabledPluginRows(projectId), 'no refused enable left a row').toBe(0);

    for (const attempt of ['first', 'repeated']) {
      const disabled = await mutate(owner.ctx, 'delete', `${base}/${MISSING_PLUGIN}`);
      expect(disabled.status(), `a ${attempt} disable of a plugin never enabled — body ${await disabled.text()}`).toBe(204);
    }

    const listed = await owner.ctx.get(base);
    expect(listed.status(), `the owner still lists the novel's plugins — body ${await listed.text()}`).toBe(200);
    expect(await listed.json()).toEqual([]);
  });
});
