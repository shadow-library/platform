import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { AIMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createChapterGenerationGraph } from '@modules/ai/graphs/chapter-generation.graph';
import { ModelRouterService } from '@modules/ai/model-router.service';
import { JudgeSchema } from '@modules/ai/schemas/judge.schema';
import { TelemetryHandler } from '@modules/ai/telemetry.handler';
import { createPluginLogger, type ForgePlugin, loadPlugins, PluginHost, PluginPolicyService, raisedContainment, ScopedPluginHostFactory } from '@modules/plugins';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { FULL_LENGTH_DRAFT_BODY } from '@tests/fixtures/draft-body';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_plugin_policy`;

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(baseConnectionString);
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

// `plugins.dir` is a global config key only plugin-fixture.spec.ts owns, so this suite loads the fixture
// directory itself and registers the result through the host rather than racing that file over it.
const fixtures = await loadPlugins(join(import.meta.dir, 'fixtures'), id => ({ log: createPluginLogger(id) }));

const lowering: ForgePlugin = {
  id: 'lowering',
  manifest: () => ({
    id: 'lowering',
    version: '1.0.0',
    title: 'Lowering',
    description: 'Votes standard on every call, to prove a vote cannot lower a project.',
    decisionPoints: ['call.route'],
    forms: {},
  }),
  decideWriterClass: () => 'standard',
};

const throwing: ForgePlugin = {
  id: 'throwing',
  manifest: () => ({
    id: 'throwing',
    version: '1.0.0',
    title: 'Throwing',
    description: 'Throws at its decision point.',
    decisionPoints: ['call.route'],
    forms: {},
  }),
  decideWriterClass: () => {
    throw new Error('decision point exploded');
  },
};

function judgePrompt() {
  return { key: 'judge' as const, version: '1.0.0', kind: 'analytical' as const, system: 'test', template: { formatMessages: async () => [] } as never, schema: JudgeSchema };
}

describe.if(pgAvailable)('plugin call policy', () => {
  let db: PrimaryDatabase;
  let policyService: PluginPolicyService;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;

    const host = new PluginHost();
    for (const entry of fixtures) host.registerForTest(entry.plugin);
    host.registerForTest(lowering);
    host.registerForTest(throwing);
    const databaseService = { getPostgresClient: () => db } as never;
    policyService = new PluginPolicyService(databaseService, host, new ScopedPluginHostFactory(databaseService));
  });

  async function seedProject(contentMode?: 'standard' | 'unrestricted'): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `policy-${Date.now()}-${Math.random()}`, kind: 'new_novel', ...(contentMode ? { contentMode } : {}) })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  function enable(projectId: bigint, pluginId: string, config: Record<string, unknown>, pluginVersion = '1.0.0') {
    return db.insert(schema.projectPlugins).values({ projectId, pluginId, pluginVersion, config });
  }

  describe('PluginPolicyService.resolve', () => {
    it('should resolve permissive for a marked chapter and standard for an unmarked one', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', { markedChapters: '4,7', noteText: 'note', addFact: false });

      const marked = await policyService.resolve(projectId, { role: 'generation', chapter: 7 });
      const unmarked = await policyService.resolve(projectId, { role: 'generation', chapter: 8 });

      expect(marked.writerClass).toBe('permissive');
      expect(marked.raised).toBe(true);
      expect(unmarked.writerClass).toBe('standard');
      expect(unmarked.raised).toBe(false);
    });

    it('should stamp every active plugin with its id, version and config hash', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', { markedChapters: '1', noteText: 'note', addFact: false });

      const policy = await policyService.resolve(projectId, { role: 'generation', chapter: 1 });

      expect(policy.plugins).toHaveLength(1);
      expect(policy.plugins[0]?.id).toBe('twin-track');
      expect(policy.plugins[0]?.version).toBe('1.0.0');
      expect(policy.plugins[0]?.configHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should refuse to lower a permissive project to standard', async () => {
      const projectId = await seedProject('unrestricted');
      await enable(projectId, 'lowering', {});

      const policy = await policyService.resolve(projectId, { role: 'generation', chapter: 1 });

      expect(policy.writerClass).toBe('permissive');
      expect(policy.raised).toBe(false);
    });

    it('should leave an unrestricted project unraised when no plugin is enabled', async () => {
      const projectId = await seedProject('unrestricted');

      const policy = await policyService.resolve(projectId, { role: 'generation', chapter: 1 });

      expect(policy.writerClass).toBe('permissive');
      expect(policy.raised).toBe(false);
      expect(raisedContainment(policy)).toEqual({});
    });

    it('should leave an unrestricted project unraised even when a plugin votes permissive', async () => {
      const projectId = await seedProject('unrestricted');
      await enable(projectId, 'twin-track', { markedChapters: '3', noteText: 'note', addFact: false });

      const policy = await policyService.resolve(projectId, { role: 'generation', chapter: 3 });

      expect(policy.writerClass).toBe('permissive');
      expect(policy.raised).toBe(false);
      expect(raisedContainment(policy)).toEqual({});
    });

    it('should pair the raise with containment fields on a standard project', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', { markedChapters: '3', noteText: 'note', addFact: false });

      const policy = await policyService.resolve(projectId, { role: 'generation', chapter: 3 });

      expect(raisedContainment(policy)).toEqual({ generator: 'unrestricted', isolated: true });
    });

    it('should keep a hook that throws from failing the resolution', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'throwing', {});

      const policy = await policyService.resolve(projectId, { role: 'generation', chapter: 1 });

      expect(policy.writerClass).toBe('standard');
      expect(policy.plugins.map(stamp => stamp.id)).toEqual(['throwing']);
    });

    it('should ignore a row whose plugin is not loaded on this deploy', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'gone-from-disk', { markedChapters: '1' });

      const policy = await policyService.resolve(projectId, { role: 'generation', chapter: 1 });

      expect(policy.plugins).toEqual([]);
      expect(policy.digest).toBe('');
    });

    it('should ignore a row whose stored config no longer validates against the manifest', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', { retiredSetting: 'x' } as Record<string, unknown>, '0.9.0');

      const policy = await policyService.resolve(projectId, { role: 'generation', chapter: 1 });

      expect(policy.plugins).toEqual([]);
    });

    it('should give a plugin-free project a stable empty digest', async () => {
      const first = await policyService.resolve(await seedProject(), { role: 'generation', chapter: 1 });
      const second = await policyService.resolve(await seedProject('unrestricted'), { role: 'judge', chapter: 9 });

      expect(first.digest).toBe('');
      expect(second.digest).toBe('');
    });

    it('should move the digest when only the plugin config differs', async () => {
      const one = await seedProject();
      const other = await seedProject();
      await enable(one, 'twin-track', { markedChapters: '1', noteText: 'first', addFact: false });
      await enable(other, 'twin-track', { markedChapters: '1', noteText: 'second', addFact: false });

      const onePolicy = await policyService.resolve(one, { role: 'generation', chapter: 1 });
      const otherPolicy = await policyService.resolve(other, { role: 'generation', chapter: 1 });

      expect(onePolicy.digest).not.toBe(otherPolicy.digest);
      expect(onePolicy.digest).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should hold the digest steady across repeated resolutions of the same config', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', { markedChapters: '2', noteText: 'note', addFact: true });

      const first = await policyService.resolve(projectId, { role: 'generation', chapter: 2 });
      const second = await policyService.resolve(projectId, { role: 'generation', chapter: 2 });

      expect(first.digest).toBe(second.digest);
    });
  });

  describe('ModelRouterService.hashRequest', () => {
    function makeRouter(): ModelRouterService {
      const router = new ModelRouterService(
        {} as never,
        { getPostgresClient: () => db } as never,
        { enforce: async () => undefined } as never,
        { defaultsFor: async () => undefined } as never,
      );
      (router as unknown as Record<string, unknown>)['buildClient'] = () => ({ invoke: async () => ({ content: JSON.stringify({ verdict: 'consistent', findings: [] }) }) });
      return router;
    }

    it('should leave a plugin-free call on the pre-host request hash', async () => {
      const projectId = await seedProject();
      const router = makeRouter();
      const ctx = { projectId, promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' };
      const input = { prose: 'plugin-free' };
      const policy = await policyService.resolve(projectId, { role: 'judge', chapter: 1 });

      await router.structured(judgePrompt(), input, ctx, undefined, policy);

      const rows = await db.query.llmCache.findMany({ where: eq(schema.llmCache.projectId, projectId) });
      const resolved = router.resolveModel('judge');
      const baseline = createHash('sha256')
        .update(JSON.stringify({ provider: resolved.provider, model: resolved.model, promptKey: 'judge', promptVersion: '1.0.0', input }))
        .digest('hex');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.requestHash).toBe(baseline);
    });

    it('should give two calls that differ only in plugin config different request hashes', async () => {
      const one = await seedProject();
      const other = await seedProject();
      await enable(one, 'twin-track', { markedChapters: '', noteText: 'first', addFact: false });
      await enable(other, 'twin-track', { markedChapters: '', noteText: 'second', addFact: false });
      const router = makeRouter();
      const input = { prose: 'same input' };

      for (const projectId of [one, other]) {
        const policy = await policyService.resolve(projectId, { role: 'judge', chapter: 1 });
        await router.structured(judgePrompt(), input, { projectId, promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' }, undefined, policy);
      }

      // Both rows must exist: without the digest in the key the second call is a cache hit that inserts
      // nothing, and a one-row result would otherwise satisfy a bare inequality against `undefined`.
      const rows = await db.query.llmCache.findMany({ where: inArray(schema.llmCache.projectId, [one, other]) });
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map(row => row.requestHash)).size).toBe(2);
    });
  });

  describe('TelemetryHandler', () => {
    async function record(projectId: bigint, runId: string, policy: Record<string, unknown>): Promise<void> {
      const telemetry = new TelemetryHandler({ getPostgresClient: () => db } as never);
      const metadata = {
        nfTelemetry: { projectId: String(projectId), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge', provider: 'test', model: 'test', attempt: 0, ...policy },
      };
      await telemetry.handleLLMStart({} as never, ['prompt'], runId, undefined, undefined, undefined, metadata);
      await telemetry.handleLLMEnd({ generations: [[{ text: '{}' }]] } as never, runId);
    }

    it('should record the resolved policy stamps and digest on the model_calls row', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', { markedChapters: '1', noteText: 'note', addFact: false });
      const policy = await policyService.resolve(projectId, { role: 'judge', chapter: 1 });

      await record(projectId, `stamped-${projectId}`, { plugins: policy.plugins, policyDigest: policy.digest });

      const row = await db.query.modelCalls.findFirst({ where: eq(schema.modelCalls.projectId, projectId) });
      expect(row?.plugins).toEqual(policy.plugins);
      expect(row?.policyDigest).toBe(policy.digest);
    });

    it('should leave both columns null for a plugin-free call', async () => {
      const projectId = await seedProject();

      await record(projectId, `unstamped-${projectId}`, {});

      const row = await db.query.modelCalls.findFirst({ where: eq(schema.modelCalls.projectId, projectId) });
      expect(row?.plugins).toBeNull();
      expect(row?.policyDigest).toBeNull();
    });
  });

  describe('chapter generation under a resolved policy', () => {
    function buildServices(counter: { reads: number }, verdicts: string[] = []) {
      let judgeCall = 0;
      const modelRouter = {
        structured: async (promptModule: { key: string }) => {
          if (promptModule.key === 'generation') return { title: 'Chapter Title', body: FULL_LENGTH_DRAFT_BODY, summary: 'A summary.', state: {} };
          if (promptModule.key === 'fix') return { action: 'patch', patches: [{ find: 'prose', replace: 'prose' }] };
          return { title: 'Chapter Title' };
        },
        chatFor: () => ({
          bindTools: () => ({
            invoke: async () => {
              const verdict = verdicts[judgeCall++] ?? 'consistent';
              const findings = verdict === 'consistent' ? [] : [{ severity: 'hard', text: `finding #${judgeCall}` }];
              return new AIMessage(JSON.stringify({ verdict, findings, briefCompliance: { compliant: true, issues: [] } }));
            },
          }),
        }),
        resolveModel: () => ({ provider: 'test', model: 'test' }),
        resolveFor: async () => ({ provider: 'test', model: 'test' }),
      };

      const pluginPolicy = {
        scoped: (projectId: bigint) => {
          counter.reads++;
          return policyService.scoped(projectId);
        },
      };

      return {
        db,
        contextAssembler: { forChapter: async () => ({ id: null }) },
        modelRouter,
        telemetry: {},
        toolRegistry: { forNode: () => [], getRaw: () => [] },
        indexingService: {},
        pluginPolicy,
        checkpointer: new MemorySaver(),
      } as never;
    }

    async function generate(projectId: bigint, counter: { reads: number }, verdicts: string[] = []): Promise<string[]> {
      const graph = createChapterGenerationGraph(buildServices(counter, verdicts));
      const runId = `policy-${projectId}`;
      const state = (await graph.invoke(
        { projectId: String(projectId), chapter: 1, volumeKey: '', guidance: '', autoFix: verdicts.length > 0, maxFixes: 1, runId },
        { configurable: { thread_id: runId } },
      )) as { nodeTrace: string[] };
      return state.nodeTrace;
    }

    it('should write an isolated unrestricted draft when a plugin raised the class', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', { markedChapters: '1', noteText: 'note', addFact: false });

      await generate(projectId, { reads: 0 });

      const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)) });
      expect(draft?.generator).toBe('unrestricted');
      expect(draft?.isolated).toBe(true);
    });

    it('should leave a plugin-free generation unisolated on an unrestricted-mode novel', async () => {
      const projectId = await seedProject('unrestricted');

      await generate(projectId, { reads: 0 });

      const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)) });
      expect(draft?.generator).toBe('standard');
      expect(draft?.isolated).toBe(false);
    });

    it('should leave an unmarked chapter unisolated on a plugin-bearing novel', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', { markedChapters: '9', noteText: 'note', addFact: false });

      await generate(projectId, { reads: 0 });

      const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)) });
      expect(draft?.isolated).toBe(false);
    });

    it('should isolate the draft when a plugin raised only the repair call', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'role-route', { raisedRole: 'fix' });

      const nodeTrace = await generate(projectId, { reads: 0 }, ['contradiction']);

      expect(nodeTrace).toContain('repairPatch');
      const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)) });
      expect(draft?.generator).toBe('unrestricted');
      expect(draft?.isolated).toBe(true);
    });

    it('should read project_plugins once per run however many calls the graph makes', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', { markedChapters: '1', noteText: 'note', addFact: false });

      let selects = 0;
      const findMany = db.query.projectPlugins.findMany.bind(db.query.projectPlugins);
      db.query.projectPlugins.findMany = ((args: never) => {
        selects++;
        return findMany(args);
      }) as never;

      const counter = { reads: 0 };
      try {
        const nodeTrace = await generate(projectId, counter);
        expect(nodeTrace.filter(node => node === 'draftChapter' || node === 'judge').length).toBeGreaterThan(1);
      } finally {
        db.query.projectPlugins.findMany = findMany as never;
      }

      expect(counter.reads).toBe(1);
      expect(selects).toBe(1);
    });
  });
});
