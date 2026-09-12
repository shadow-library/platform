import { join } from 'node:path';

import { SQL } from 'bun';
import { beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { createPluginLogger, type ForgePlugin, loadPlugins, type PluginChangeOp, PluginHost, PluginProposalService } from '@modules/plugins';
import { type Generation, schema } from '@server/database';
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

// `plugins.dir` is a global config key only plugin-fixture.spec.ts owns, so this suite loads the same
// directory itself and registers the result through the host rather than racing that file over it.
const fixtures = await loadPlugins(join(import.meta.dir, 'fixtures'), id => ({ log: createPluginLogger(id) }));

// The fixture rewrites a brief's title and body only when the note appears in neither, and `includes('')`
// is always true — an empty note would silently skip the branch this suite is here to prove.
const NOTE = 'marker note';

const intruderToken = await issueTestToken({ sub: '4004' });

function probe(id: string, ops: unknown[]): ForgePlugin {
  return {
    id,
    manifest: () => ({ id, version: '1.0.0', title: id, description: id, decisionPoints: ['canon.augment'], forms: {} }),
    augmentCanon: () => ops as PluginChangeOp[],
  };
}

const testEnv = new TestEnvironment('plugin_proposal');

describe.if(pgAvailable)('plugins that propose changes', () => {
  testEnv.init();

  beforeAll(() => {
    const host = testEnv.getService(PluginHost);
    for (const entry of fixtures) host.registerForTest(entry.plugin);

    host.registerForTest(probe('emit-action', [{ op: 'action.generate_chapters', count: 2 }]));
    host.registerForTest(probe('emit-draft', [{ op: 'draft.update', chapter: 1, body: 'prose behind the author' }]));
    host.registerForTest(probe('emit-arc-remove', [{ op: 'arc.remove', arcKey: 'v1_a1' }]));
    host.registerForTest(probe('emit-arc-skeleton', [{ op: 'arc.upsert', arcKey: 'v1_a1', volumeKey: 'v1', title: 'Moved', chapterStart: 4 }]));
    host.registerForTest(probe('emit-arc-narrative', [{ op: 'arc.upsert', arcKey: 'v1_a1', volumeKey: 'v1', title: 'Named', hook: 'a handoff' }]));
    host.registerForTest(probe('emit-brief-arc', [{ op: 'brief.update', chapter: 3, arcKey: 'v1_a2' }]));
    host.registerForTest(probe('emit-brief-volume', [{ op: 'brief.update', chapter: 3, volumeKey: 'v2' }]));
    host.registerForTest(probe('emit-arc-move', [{ op: 'arc.upsert', arcKey: 'v1_a1', volumeKey: 'v2', title: 'Moved' }]));
    host.registerForTest(probe('emit-malformed', [{ op: 'fact.upsert', body: 'no key at all' }]));
    host.registerForTest(probe('emit-nothing', []));
    host.registerForTest({
      id: 'emit-throw',
      manifest: () => ({ id: 'emit-throw', version: '1.0.0', title: 'emit-throw', description: 'emit-throw', decisionPoints: ['canon.augment'], forms: {} }),
      augmentCanon: () => {
        throw new Error('probe refuses to augment');
      },
    });
    host.registerForTest({
      id: 'brief-action',
      manifest: () => ({ id: 'brief-action', version: '1.0.0', title: 'brief-action', description: 'brief-action', decisionPoints: ['brief.policy'], forms: {} }),
      decideBriefPolicy: () => [{ op: 'action.generate_chapters', count: 1 }] as unknown as PluginChangeOp[],
    });
  });

  const db = () => testEnv.getPostgresClient();

  const createProject = async (name: string): Promise<string> => {
    const response = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name, kind: 'new_novel' });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  };

  const enable = (projectId: string, pluginId: string, config: Record<string, unknown> = {}) =>
    testEnv.getRouter().mockRequest().put(`/api/v1/projects/${projectId}/plugins/${pluginId}`).body({ config });

  const augment = (projectId: string, pluginId: string) => testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/plugins/${pluginId}/augment`);

  const proposalRow = (projectId: string, proposalId: string) =>
    db().query.refinementProposals.findFirst({ where: and(eq(schema.refinementProposals.projectId, BigInt(projectId)), eq(schema.refinementProposals.id, BigInt(proposalId))) });

  const briefRow = (projectId: string, chapter: number) =>
    db().query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, BigInt(projectId)), eq(schema.briefs.chapter, chapter)) });

  describe('POST /api/v1/projects/:projectId/plugins/:pluginId/augment', () => {
    it('should stage the emitted ops as a pending plugin proposal instead of writing canon', async () => {
      const projectId = await createProject('augment-stage');
      await enable(projectId, 'twin-track', { addFact: true, noteText: NOTE });

      const response = await augment(projectId, 'twin-track');

      expect(response.statusCode).toBe(200);
      const proposal = await proposalRow(projectId, response.json().proposalId as string);
      expect(proposal).toMatchObject({ kind: 'plugin', status: 'pending', scopeType: 'project', scopeRef: 'twin-track' });
      expect(proposal?.changeSet).toEqual([{ op: 'fact.upsert', factKey: 'twin-track', body: NOTE }]);
      expect(await db().query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, BigInt(projectId)) })).toEqual([]);
    });

    it('should answer 204 when the plugin proposes nothing', async () => {
      const projectId = await createProject('augment-empty');
      await enable(projectId, 'twin-track', { addFact: false, noteText: NOTE });
      await enable(projectId, 'emit-nothing');

      const silent = await augment(projectId, 'twin-track');
      const empty = await augment(projectId, 'emit-nothing');

      expect([silent.statusCode, empty.statusCode]).toEqual([204, 204]);
      expect(await db().query.refinementProposals.findMany({ where: eq(schema.refinementProposals.projectId, BigInt(projectId)) })).toEqual([]);
    });

    it('should answer 204 when the plugin hook throws', async () => {
      const projectId = await createProject('augment-throws');
      await enable(projectId, 'emit-throw');

      const response = await augment(projectId, 'emit-throw');

      expect(response.statusCode).toBe(204);
    });

    it('should answer PLG_001 for a plugin that is not on disk', async () => {
      const projectId = await createProject('augment-missing');

      const response = await augment(projectId, 'absent-plugin');

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('PLG_001');
    });

    it('should answer PLG_002 for a plugin that is not enabled on this novel', async () => {
      const projectId = await createProject('augment-disabled');

      const response = await augment(projectId, 'twin-track');

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('PLG_002');
    });

    it('should reject a caller who does not own the novel', async () => {
      const projectId = await createProject('augment-bola');
      await enable(projectId, 'twin-track', { addFact: true, noteText: NOTE });

      const response = await testEnv
        .getRouter({ authenticated: false })
        .mockRequest()
        .headers({ authorization: `Bearer ${intruderToken}` })
        .post(`/api/v1/projects/${projectId}/plugins/twin-track/augment`);

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('PRJ_001');
    });
  });

  describe('the ops a plugin may propose', () => {
    it.each([
      ['emit-action', 'an action op'],
      ['emit-draft', 'a draft op'],
      ['emit-arc-remove', 'an arc removal'],
      ['emit-arc-skeleton', 'an arc chapter range'],
      ['emit-brief-arc', 'a brief re-parented into another arc'],
      ['emit-brief-volume', 'a brief re-parented into another volume'],
      ['emit-malformed', 'an op the specs reject'],
    ])('should refuse %s with PLG_005', async pluginId => {
      const projectId = await createProject(`refuse-${pluginId}`);
      await enable(projectId, pluginId);

      const response = await augment(projectId, pluginId);

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('PLG_005');
      expect(await db().query.refinementProposals.findMany({ where: eq(schema.refinementProposals.projectId, BigInt(projectId)) })).toEqual([]);
    });

    it('should allow an arc upsert that touches only narrative fields', async () => {
      const projectId = await createProject('allow-arc-narrative');
      await enable(projectId, 'emit-arc-narrative');

      const response = await augment(projectId, 'emit-arc-narrative');

      expect(response.statusCode).toBe(200);
      const proposal = await proposalRow(projectId, response.json().proposalId as string);
      expect(proposal?.changeSet).toEqual([{ op: 'arc.upsert', arcKey: 'v1_a1', volumeKey: 'v1', title: 'Named', hook: 'a handoff' }]);
    });

    it('should refuse moving an existing arc into another volume', async () => {
      const projectId = await createProject('refuse-arc-move');
      await enable(projectId, 'emit-arc-move');
      await db()
        .insert(schema.arcs)
        .values({ projectId: BigInt(projectId), arcKey: 'v1_a1', volumeKey: 'v1', ordinal: 1 });

      const response = await augment(projectId, 'emit-arc-move');

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('PLG_005');
      expect(response.json().message).toContain('another volume');
    });

    it('should allow an arc upsert that names the volume the arc already sits in', async () => {
      const projectId = await createProject('allow-arc-same-volume');
      await enable(projectId, 'emit-arc-narrative');
      await db()
        .insert(schema.arcs)
        .values({ projectId: BigInt(projectId), arcKey: 'v1_a1', volumeKey: 'v1', ordinal: 1 });

      expect((await augment(projectId, 'emit-arc-narrative')).statusCode).toBe(200);
    });

    it('should refuse a brief policy that emits an action op', async () => {
      const projectId = await createProject('refuse-brief-action');
      await enable(projectId, 'brief-action');
      await db()
        .insert(schema.briefs)
        .values({ projectId: BigInt(projectId), chapter: 1, title: 'Planned one', body: 'planned body' });
      const briefs = await db().query.briefs.findMany({ where: eq(schema.briefs.projectId, BigInt(projectId)) });

      const staging = testEnv.getService(PluginProposalService).stageBriefPolicy(BigInt(projectId), briefs as Generation.Brief[]);

      expect(await staging.then(() => undefined).catch((err: { code: string }) => err.code)).toBe('PLG_005');
    });
  });

  describe('PluginProposalService.stageBriefPolicy', () => {
    const seedBriefs = (projectId: string) =>
      db()
        .insert(schema.briefs)
        .values([
          { projectId: BigInt(projectId), chapter: 3, title: 'Planned three', body: 'planned body three' },
          { projectId: BigInt(projectId), chapter: 4, title: 'Planned four', body: 'planned body four' },
        ]);

    const stage = async (projectId: string) => {
      const briefs = await db().query.briefs.findMany({ where: eq(schema.briefs.projectId, BigInt(projectId)), orderBy: schema.briefs.chapter });
      return testEnv.getService(PluginProposalService).stageBriefPolicy(BigInt(projectId), briefs as Generation.Brief[]);
    };

    it('should stage a proposal and leave every brief untouched until it is applied', async () => {
      const projectId = await createProject('policy-proposal');
      await enable(projectId, 'twin-track', { markedChapters: '3', noteText: NOTE });
      await seedBriefs(projectId);

      const proposal = await stage(projectId);

      expect(proposal).toMatchObject({ kind: 'plugin', status: 'pending', scopeRef: 'twin-track' });
      expect(proposal?.changeSet).toEqual([{ op: 'brief.update', chapter: 3, writeMode: 'external', title: NOTE, body: NOTE }]);
      expect(await briefRow(projectId, 3)).toMatchObject({ title: 'Planned three', body: 'planned body three', writeMode: 'standard', handEdited: false });
    });

    it('should mark the brief external and hand-edited once applied, so a reconciliation pass cannot strip it', async () => {
      const projectId = await createProject('policy-applied');
      await enable(projectId, 'twin-track', { markedChapters: '3', noteText: NOTE });
      await seedBriefs(projectId);
      const proposal = await stage(projectId);

      const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/proposals/${proposal?.id}/apply`).body({});

      expect(response.statusCode).toBe(200);
      expect(await briefRow(projectId, 3)).toMatchObject({ title: NOTE, body: NOTE, writeMode: 'external', handEdited: true });
      expect(await briefRow(projectId, 4)).toMatchObject({ title: 'Planned four', writeMode: 'standard', handEdited: false });
    });

    it('should revert through the captured inverse ops, restoring the brief the planner wrote', async () => {
      const projectId = await createProject('policy-reverted');
      await enable(projectId, 'twin-track', { markedChapters: '3', noteText: NOTE });
      await seedBriefs(projectId);
      const proposal = await stage(projectId);
      await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/proposals/${proposal?.id}/apply`).body({});

      const applied = await proposalRow(projectId, String(proposal?.id));
      expect(applied?.inverseOps).toEqual([
        expect.objectContaining({ op: 'brief.update', chapter: 3, title: 'Planned three', body: 'planned body three', writeMode: 'standard', handEdited: false }),
      ]);

      const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/proposals/${proposal?.id}/revert`);

      expect(response.statusCode).toBe(200);
      expect(await proposalRow(projectId, String(proposal?.id))).toMatchObject({ status: 'reverted' });
      expect(await briefRow(projectId, 3)).toMatchObject({ title: 'Planned three', body: 'planned body three', writeMode: 'standard', handEdited: false });
    });

    it('should stage nothing when no enabled plugin answers the decision point', async () => {
      const projectId = await createProject('policy-none');
      await seedBriefs(projectId);

      expect(await stage(projectId)).toBeUndefined();
    });

    it('should supersede the plugin own prior pending proposal instead of stacking one per run', async () => {
      const projectId = await createProject('policy-supersede');
      await enable(projectId, 'twin-track', { markedChapters: '3', noteText: NOTE });
      await seedBriefs(projectId);

      const first = await stage(projectId);
      const second = await stage(projectId);

      expect(await proposalRow(projectId, String(first?.id))).toMatchObject({ status: 'superseded' });
      expect(await proposalRow(projectId, String(second?.id))).toMatchObject({ status: 'pending' });
    });

    it('should leave an already applied proposal alone when the next run stages a new one', async () => {
      const projectId = await createProject('policy-supersede-applied');
      await enable(projectId, 'twin-track', { markedChapters: '3', noteText: NOTE });
      await seedBriefs(projectId);
      const applied = await stage(projectId);
      await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/proposals/${applied?.id}/apply`).body({});

      const next = await stage(projectId);

      expect(await proposalRow(projectId, String(applied?.id))).toMatchObject({ status: 'applied' });
      expect(await proposalRow(projectId, String(next?.id))).toMatchObject({ status: 'pending' });
    });
  });

  describe('one current proposal per plugin', () => {
    it('should supersede the prior pending augmentation on the next run', async () => {
      const projectId = await createProject('augment-supersede');
      await enable(projectId, 'twin-track', { addFact: true, noteText: NOTE });

      const first = await augment(projectId, 'twin-track');
      const second = await augment(projectId, 'twin-track');

      expect(await proposalRow(projectId, first.json().proposalId as string)).toMatchObject({ status: 'superseded' });
      expect(await proposalRow(projectId, second.json().proposalId as string)).toMatchObject({ status: 'pending' });
    });

    it('should leave another plugin pending proposal alone', async () => {
      const projectId = await createProject('augment-supersede-other');
      await enable(projectId, 'twin-track', { addFact: true, noteText: NOTE });
      await enable(projectId, 'emit-arc-narrative');
      const other = await augment(projectId, 'emit-arc-narrative');

      await augment(projectId, 'twin-track');

      expect(await proposalRow(projectId, other.json().proposalId as string)).toMatchObject({ status: 'pending' });
    });
  });
});
