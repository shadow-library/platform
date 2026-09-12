import { join } from 'node:path';

import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { type BaseMessage } from '@langchain/core/messages';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { type CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { CORE_SECTION_KEYS } from '@modules/ai/context/sections';
import { CHAPTER_PACK_CONSUMERS } from '@modules/ai/graphs/chapter-generation.graph';
import { ModelRouterService } from '@modules/ai/model-router.service';
import { GenerationService } from '@modules/generation/generation.service';
import { generationPrompt } from '@modules/ai/prompts/generation.prompt';
import { createPluginLogger, type ForgeCallPolicy, type ForgePlugin, loadPlugins, PluginHost, PluginPolicyService, ScopedPluginHostFactory } from '@modules/plugins';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { noPluginProposals } from '@tests/fixtures/plugin-policy';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_plugin_contribution`;

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

const NOTE = 'staging detail the standard writer must never read';
const OLLAMA = { provider: 'ollama', model: 'qwen3:14b' };

interface RouterInternals {
  buildMessages(promptModule: unknown, input: Record<string, unknown>, resolved: { provider: string; model: string }, policy?: ForgeCallPolicy): Promise<BaseMessage[]>;
  hashRequest(resolved: { provider: string; model: string }, promptModule: { key: string; version: string }, input: Record<string, unknown>, policy?: ForgeCallPolicy): string;
}

function inlinePlugin(id: string, hooks: Partial<ForgePlugin>): ForgePlugin {
  return {
    id,
    manifest: () => ({ id, version: '1.0.0', title: id, description: id, decisionPoints: ['context.contribute', 'prompt.contribute'], forms: {} }),
    ...hooks,
  };
}

const standardSection = inlinePlugin('standard-section', {
  contributeContextSections: () => [{ key: 'open', title: 'Open', rendered: 'visible to every class', segment: 'volatile', minWriterClass: 'standard' }],
});

const collidingSection = inlinePlugin('colliding-section', {
  contributeContextSections: () =>
    [
      { key: 'writing_style', title: 'Impostor', rendered: 'not the core section', segment: 'volatile', minWriterClass: 'standard' },
      { key: 'twice', title: 'First', rendered: 'first body', segment: 'volatile', minWriterClass: 'standard' },
      { key: 'twice', title: 'Second', rendered: 'second body', segment: 'volatile', minWriterClass: 'standard' },
    ] as never,
});

const malformedSection = inlinePlugin('malformed-section', {
  contributeContextSections: () => [null, 'a string', { key: 'blank', title: 'Blank', rendered: '   ' }, { title: 'Keyless', rendered: 'body' }] as never,
  contributeSystemMessages: () => [null, { role: 'system' }, { role: 'system', content: '  ' }] as never,
});

const unclassedSection = inlinePlugin('unclassed-section', {
  contributeContextSections: () => [{ key: 'mangled', title: 'Mangled', rendered: 'body', segment: 'volatile' }] as never,
});

const throwingContribution = inlinePlugin('throwing-contribution', {
  contributeContextSections: () => {
    throw new Error('context hook exploded');
  },
  contributeSystemMessages: () => {
    throw new Error('prompt hook exploded');
  },
});

describe.if(pgAvailable)('plugin contributions', () => {
  let db: PrimaryDatabase;
  let policyService: PluginPolicyService;
  let assembler: ContextAssembler;
  let router: ModelRouterService;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;

    const host = new PluginHost();
    for (const entry of fixtures) host.registerForTest(entry.plugin);
    for (const plugin of [standardSection, collidingSection, malformedSection, unclassedSection, throwingContribution]) host.registerForTest(plugin);
    const databaseService = { getPostgresClient: () => db } as never;
    policyService = new PluginPolicyService(databaseService, host, new ScopedPluginHostFactory(databaseService));
    assembler = new ContextAssembler(databaseService, { render: async () => '' } as unknown as CatalogService);
    router = new ModelRouterService({} as never, databaseService, { enforce: async () => undefined } as never);
  });

  async function seedProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `contribution-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  function enable(projectId: bigint, pluginId: string, config: Record<string, unknown> = {}) {
    return db.insert(schema.projectPlugins).values({ projectId, pluginId, pluginVersion: '1.0.0', config });
  }

  const twinTrack = (markedChapters: string) => ({ markedChapters, noteText: NOTE, addFact: false });

  function packFor(projectId: bigint, chapter: number, policy?: ForgeCallPolicy) {
    return assembler.forChapter(projectId, chapter, policy ? { policy } : {});
  }

  function buildMessages(policy?: ForgeCallPolicy): Promise<BaseMessage[]> {
    const input = { stableContext: 'stable', volatileContext: 'volatile', chapterBrief: 'brief', endingContract: 'none', guidance: 'none' };
    return (router as unknown as RouterInternals).buildMessages(generationPrompt, input, OLLAMA, policy);
  }

  const wireOf = (messages: BaseMessage[]): string => JSON.stringify(messages.map(message => [message.getType(), message.content]));

  const cacheKeyOf = (policy?: ForgeCallPolicy): string => (router as unknown as RouterInternals).hashRequest(OLLAMA, generationPrompt, { catalog: 'c' }, policy);

  describe('ContextAssembler.forChapter — the minWriterClass guard', () => {
    it('should carry a permissive-only section into a marked chapter pack and withhold it from an unmarked one', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', twinTrack('4'));

      const marked = await packFor(projectId, 4, await policyService.resolve(projectId, { role: 'generation', chapter: 4 }));
      const unmarked = await packFor(projectId, 5, await policyService.resolve(projectId, { role: 'generation', chapter: 5 }));

      expect(marked.sections.map(section => section.key)).toContain('plugin:twin-track:note');
      expect(marked.rendered).toContain(NOTE);
      expect(unmarked.sections.map(section => section.key)).not.toContain('plugin:twin-track:note');
      expect(unmarked.rendered).not.toContain(NOTE);
    });

    it('should never persist a withheld section on the context_packs row of an unmarked chapter', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', twinTrack('4'));

      const marked = await packFor(projectId, 4, await policyService.resolve(projectId, { role: 'generation', chapter: 4 }));
      const unmarked = await packFor(projectId, 5, await policyService.resolve(projectId, { role: 'generation', chapter: 5 }));

      const rows = await db.query.contextPacks.findMany({ where: eq(schema.contextPacks.projectId, projectId) });
      const markedRow = rows.find(row => row.id === marked.id);
      const unmarkedRow = rows.find(row => row.id === unmarked.id);

      expect(markedRow?.rendered).toContain(NOTE);
      expect(JSON.stringify(unmarkedRow?.sections)).not.toContain(NOTE);
      expect(unmarkedRow?.rendered).not.toContain(NOTE);
    });

    it('should leave an unmarked chapter pack byte-identical to the same pack assembled with no plugin at all', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', twinTrack('4'));

      const guarded = await packFor(projectId, 5, await policyService.resolve(projectId, { role: 'generation', chapter: 5 }));
      const pluginFree = await packFor(projectId, 5);

      expect(guarded.rendered).toBe(pluginFree.rendered);
      expect(guarded.renderedStable).toBe(pluginFree.renderedStable);
      expect(guarded.usedTokens).toBe(pluginFree.usedTokens);
      expect(guarded.id).toBe(pluginFree.id);
    });

    it('should charge a contributed section against the token budget of the pack that keeps it', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', twinTrack('4'));

      const marked = await packFor(projectId, 4, await policyService.resolve(projectId, { role: 'generation', chapter: 4 }));
      const pluginFree = await packFor(projectId, 4);
      const contributed = marked.sections.find(section => section.key === 'plugin:twin-track:note');

      expect(contributed?.tokens).toBeGreaterThan(0);
      expect(marked.usedTokens).toBe(pluginFree.usedTokens + (contributed?.tokens ?? 0));
    });

    it('should admit a standard-class section to a standard call', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'standard-section');

      const pack = await packFor(projectId, 1, await policyService.resolve(projectId, { role: 'generation', chapter: 1 }));

      expect(pack.sections.map(section => section.key)).toContain('plugin:standard-section:open');
      expect(pack.rendered).toContain('## OPEN\n\nvisible to every class');
    });

    it('should withhold a section whose minWriterClass is not the exact standard literal', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'unclassed-section');

      const pack = await packFor(projectId, 1, await policyService.resolve(projectId, { role: 'generation', chapter: 1 }));

      expect(pack.sections.map(section => section.key)).not.toContain('plugin:unclassed-section:mangled');
    });

    it('should namespace every contributed key beyond the reach of a core section label', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'colliding-section');

      const pack = await packFor(projectId, 1, await policyService.resolve(projectId, { role: 'generation', chapter: 1 }));
      const keys = pack.sections.map(section => section.key);

      expect(keys).toContain('plugin:colliding-section:writing_style');
      expect(keys.filter(key => CORE_SECTION_KEYS.has(key))).toEqual(['writing_style']);
      expect(pack.rendered).toContain('## WRITING STYLE');
      expect(pack.rendered).toContain('## IMPOSTOR');
    });

    it('should keep only the first of two contributions sharing a key', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'colliding-section');

      const pack = await packFor(projectId, 1, await policyService.resolve(projectId, { role: 'generation', chapter: 1 }));

      expect(pack.sections.filter(section => section.key === 'plugin:colliding-section:twice')).toHaveLength(1);
      expect(pack.rendered).toContain('first body');
      expect(pack.rendered).not.toContain('second body');
    });

    it('should drop a malformed or empty contribution rather than render a bare header', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'malformed-section');

      const policy = await policyService.resolve(projectId, { role: 'generation', chapter: 1 });
      const pack = await packFor(projectId, 1, policy);

      expect(policy.contextSections).toEqual([]);
      expect(pack.sections.some(section => section.key.startsWith('plugin:'))).toBe(false);
    });
  });

  describe('ScopedPolicyResolver.forPack — the lowest consuming class', () => {
    it('should withhold a section raised for the drafter alone from the pack its standard-class judge reads', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'role-route', { raisedRole: 'generation' });
      await enable(projectId, 'twin-track', twinTrack(''));

      const resolver = await policyService.scoped(projectId);
      const call = { role: 'generation', chapter: 1 };
      const packPolicy = resolver.forPack(call, CHAPTER_PACK_CONSUMERS);
      const pack = await packFor(projectId, 1, packPolicy);
      const row = await db.query.contextPacks.findFirst({ where: eq(schema.contextPacks.id, pack.id as bigint) });

      expect(pack.sections.map(section => section.key)).not.toContain('plugin:twin-track:note');
      expect(pack.rendered).not.toContain(NOTE);
      expect(row?.rendered).not.toContain(NOTE);
      expect(resolver.for(call).writerClass).toBe('permissive');
      expect(resolver.for({ role: 'judge', chapter: 1 }).writerClass).toBe('standard');
      expect(packPolicy.writerClass).toBe('standard');
    });

    it('should keep the section when every consuming role resolves permissive', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', twinTrack('1'));

      const resolver = await policyService.scoped(projectId);
      const pack = await packFor(projectId, 1, resolver.forPack({ role: 'generation', chapter: 1 }, CHAPTER_PACK_CONSUMERS));

      expect(pack.rendered).toContain(NOTE);
    });

    it('should resolve the whole consuming set off a single project_plugins read', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', twinTrack('1'));

      let selects = 0;
      const findMany = db.query.projectPlugins.findMany.bind(db.query.projectPlugins);
      db.query.projectPlugins.findMany = ((args: never) => {
        selects++;
        return findMany(args);
      }) as never;
      try {
        const resolver = await policyService.scoped(projectId);
        resolver.forPack({ role: 'generation', chapter: 1 }, CHAPTER_PACK_CONSUMERS);
      } finally {
        db.query.projectPlugins.findMany = findMany as never;
      }

      expect(selects).toBe(1);
    });
  });

  describe('ContextAssembler — the non-generation purposes', () => {
    const briefScope = { scopeType: 'brief' as const, scopeRef: 'chapter:3', createdAt: new Date() };

    it('should leave an outline pack byte-identical to the same pack assembled with no policy at all', async () => {
      const projectId = await seedProject();

      const policy = await policyService.resolve(projectId, { role: 'outline', chapter: 3 });
      const threaded = await assembler.forOutline(projectId, 3, { policy });
      const pluginFree = await assembler.forOutline(projectId, 3);

      expect(threaded.rendered).toBe(pluginFree.rendered);
      expect(threaded.renderedStable).toBe(pluginFree.renderedStable);
      expect(threaded.usedTokens).toBe(pluginFree.usedTokens);
      expect(threaded.id).toBe(pluginFree.id);
      expect(router.resolveModel('outline', undefined, policy)).toEqual(router.resolveModel('outline'));
      expect(cacheKeyOf(policy)).toBe(cacheKeyOf());
      expect(wireOf(await buildMessages(policy))).toBe(wireOf(await buildMessages()));
    });

    it('should leave a chat pack byte-identical to the same pack assembled with no policy at all', async () => {
      const projectId = await seedProject();

      const policy = await policyService.resolve(projectId, { role: 'chat' });
      const threaded = await assembler.forChatTurn(projectId, briefScope, { policy });
      const pluginFree = await assembler.forChatTurn(projectId, briefScope);

      expect(threaded.rendered).toBe(pluginFree.rendered);
      expect(threaded.renderedStable).toBe(pluginFree.renderedStable);
      expect(threaded.usedTokens).toBe(pluginFree.usedTokens);
      expect(threaded.id).toBe(pluginFree.id);
      expect(router.resolveModel('chat', undefined, policy)).toEqual(router.resolveModel('chat'));
      expect(cacheKeyOf(policy)).toBe(cacheKeyOf());
      expect(wireOf(await buildMessages(policy))).toBe(wireOf(await buildMessages()));
    });

    it('should carry a contributed section into the outline and chat packs of an enabled novel', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'standard-section');

      const outline = await assembler.forOutline(projectId, 3, { policy: await policyService.resolve(projectId, { role: 'outline', chapter: 3 }) });
      const chat = await assembler.forChatTurn(projectId, briefScope, { policy: await policyService.resolve(projectId, { role: 'chat' }) });

      expect(outline.rendered).toContain('## OPEN\n\nvisible to every class');
      expect(chat.rendered).toContain('## OPEN\n\nvisible to every class');
    });

    it('should withhold a permissive contribution from an outline pack whose call resolves standard', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', twinTrack('3'));

      const marked = await assembler.forOutline(projectId, 3, { policy: await policyService.resolve(projectId, { role: 'outline', chapter: 3 }) });
      const unmarked = await assembler.forOutline(projectId, 4, { policy: await policyService.resolve(projectId, { role: 'outline', chapter: 4 }) });

      expect(marked.rendered).toContain(NOTE);
      expect(unmarked.rendered).not.toContain(NOTE);
    });
  });

  describe('GenerationService.outlineArc — one class for the pack and the call', () => {
    async function seedArc(projectId: bigint): Promise<void> {
      await db.insert(schema.arcs).values({ projectId, arcKey: 'a1', volumeKey: 'v1', ordinal: 1, chapterStart: 1, chapterEnd: 1, status: 'approved' });
    }

    async function outline(projectId: bigint): Promise<{ catalog: string; policy: ForgeCallPolicy | undefined }> {
      const structured = mock(async () => []);
      const noop = {} as never;
      const service = new GenerationService(
        { getPostgresClient: () => db } as never,
        noop,
        { structured } as never,
        assembler,
        noop,
        noop,
        noop,
        noop,
        noop,
        noop,
        noop,
        noop,
        policyService,
        noPluginProposals(),
      );
      await service.outlineArc(projectId, 'a1', {});
      const call = structured.mock.calls[0] as unknown as [unknown, Record<string, unknown>, unknown, unknown, ForgeCallPolicy | undefined];
      return { catalog: String(call[1]['catalog']), policy: call[4] };
    }

    it('should route the outline model permissive for the very call whose pack carries the permissive section', async () => {
      const projectId = await seedProject();
      await seedArc(projectId);
      await enable(projectId, 'role-route', { raisedRole: 'outline' });
      await enable(projectId, 'twin-track', twinTrack(''));

      const { catalog, policy } = await outline(projectId);

      expect(catalog).toContain(NOTE);
      expect(policy?.writerClass).toBe('permissive');
      expect(router.resolveModel('outline', undefined, policy)).toEqual(router.resolveModel('outline', { contentMode: 'unrestricted' } as never));
    });

    it('should withhold the section and leave the outline model standard when no plugin raises the call', async () => {
      const projectId = await seedProject();
      await seedArc(projectId);
      await enable(projectId, 'twin-track', twinTrack(''));

      const { catalog, policy } = await outline(projectId);

      expect(catalog).not.toContain(NOTE);
      expect(policy?.writerClass).toBe('standard');
      expect(router.resolveModel('outline', undefined, policy)).toEqual(router.resolveModel('outline'));
    });

    it('should leave a plugin-free outline call resolving the same model as the no-policy baseline', async () => {
      const projectId = await seedProject();
      await seedArc(projectId);

      const { policy } = await outline(projectId);

      expect(policy?.plugins).toEqual([]);
      expect(policy?.digest).toBe('');
      expect(router.resolveModel('outline', undefined, policy)).toEqual(router.resolveModel('outline'));
    });
  });

  describe('ModelRouterService.buildMessages — prompt.contribute', () => {
    it('should leave a plugin-free call byte-identical to the no-policy baseline', async () => {
      const projectId = await seedProject();
      const policy = await policyService.resolve(projectId, { role: 'generation', chapter: 1 });

      expect(policy.systemMessages).toEqual([]);
      expect(policy.contextSections).toEqual([]);
      expect(policy.digest).toBe('');
      expect(wireOf(await buildMessages(policy))).toBe(wireOf(await buildMessages()));
    });

    it('should carry the contributed system message on the enabled novel and not on its neighbour', async () => {
      const enabled = await seedProject();
      const neighbour = await seedProject();
      await enable(enabled, 'twin-track', twinTrack('1'));

      const withPlugin = await buildMessages(await policyService.resolve(enabled, { role: 'generation', chapter: 1 }));
      const without = await buildMessages(await policyService.resolve(neighbour, { role: 'generation', chapter: 1 }));

      expect(withPlugin.map(message => message.content)).toContain(NOTE);
      expect(without.map(message => message.content)).not.toContain(NOTE);
      expect(wireOf(without)).toBe(wireOf(await buildMessages()));
    });

    it('should drop the contribution once the plugin is disabled on that novel', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', twinTrack('1'));
      const before = await buildMessages(await policyService.resolve(projectId, { role: 'generation', chapter: 1 }));

      await db.delete(schema.projectPlugins).where(and(eq(schema.projectPlugins.projectId, projectId), eq(schema.projectPlugins.pluginId, 'twin-track')));
      const after = await buildMessages(await policyService.resolve(projectId, { role: 'generation', chapter: 1 }));

      expect(before.map(message => message.content)).toContain(NOTE);
      expect(wireOf(after)).toBe(wireOf(await buildMessages()));
    });

    it('should seat the contribution directly after the module system message and before the human messages', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', twinTrack('1'));

      const messages = await buildMessages(await policyService.resolve(projectId, { role: 'generation', chapter: 1 }));

      expect(messages.map(message => message.getType())).toEqual(['system', 'system', 'human', 'human']);
      expect(messages[0]?.content).toBe(generationPrompt.system);
      expect(messages[1]?.content).toBe(NOTE);
    });

    it('should contribute nothing to a role the plugin does not claim', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', twinTrack('1'));

      const policy = await policyService.resolve(projectId, { role: 'outline', chapter: 1 });

      expect(policy.systemMessages).toEqual([]);
      expect(wireOf(await buildMessages(policy))).toBe(wireOf(await buildMessages()));
    });

    it('should drop a malformed or blank system message', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'malformed-section');

      const policy = await policyService.resolve(projectId, { role: 'generation', chapter: 1 });

      expect(policy.systemMessages).toEqual([]);
      expect(wireOf(await buildMessages(policy))).toBe(wireOf(await buildMessages()));
    });
  });

  describe('PluginPolicyService.resolve — a decision point that throws', () => {
    it('should drop only the throwing plugin contribution and leave the rest of the call intact', async () => {
      const projectId = await seedProject();
      await enable(projectId, 'twin-track', twinTrack('1'));
      await enable(projectId, 'throwing-contribution');

      const policy = await policyService.resolve(projectId, { role: 'generation', chapter: 1 });
      const pack = await packFor(projectId, 1, policy);
      const messages = await buildMessages(policy);

      expect(policy.plugins.map(stamp => stamp.id)).toEqual(['throwing-contribution', 'twin-track']);
      expect(policy.contextSections.map(section => section.key)).toEqual(['plugin:twin-track:note']);
      expect(pack.rendered).toContain(NOTE);
      expect(messages.map(message => message.content)).toContain(NOTE);
    });
  });
});
