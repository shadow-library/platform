import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { AppError } from '@shadow-library/common';

import { createBibleBuilderGraph } from '@modules/ai/graphs/bible-builder.graph';
import { BibleDocumentService } from '@modules/bible/document/bible-document.service';
import { GraduationService } from '@modules/ideation/graduation.service';
import { IdeationActionRegistrar } from '@modules/ideation/ideation-action.registrar';
import { ActionExecutorRegistry } from '@modules/refinement/action-registry';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';
import { ProposalService } from '@modules/refinement/proposal.service';
import { scopeAllowedOps } from '@modules/ai/prompts';
import { seedContentHash } from '@server/common';
import { type Ideation, type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_graduation`;

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

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (err) {
    return err instanceof AppError ? err.code : String(err);
  }
}

const SHEET: Ideation.SeedFields = {
  workingTitle: 'The Wreck Singer',
  genre: 'progression fantasy',
  themes: ['debt', 'memory'],
  premise: 'a salvager who can hear the dead ships she strips',
  hook: 'the first wreck she opens is still answering its captain',
  castShape: 'one lead',
  progressionSystem: 'the depth of wreck she can survive',
  protagonistDrive: 'buy back her brother’s indenture',
  stakes: 'every voice she keeps costs her a memory of her own',
  serializationNotes: '80 chapters, two a week',
  voice: 'first person, past, dry',
};

const CONSTRAINTS: Ideation.SeedConstraint[] = [
  { key: 'No Harem', kind: 'promise', text: 'she never collects suitors — one romance at a time or none', lockedBy: 'author' },
  { key: 'no-fake-death', kind: 'promise', text: 'a death on the page stays a death', lockedBy: 'author' },
  { key: 'single-pov', kind: 'shape', text: 'one point of view, hers, all the way down', lockedBy: 'author' },
  { key: 'no-empire-plot', kind: 'scope', text: 'the story stays in the wreck yards; no imperial politics', lockedBy: 'inferred' },
];

const PROVENANCE: Ideation.SeedProvenance = {
  premise: { source: 'author', turnOrdinal: 2 },
  hook: { source: 'crossed', turnOrdinal: 6 },
  stakes: { source: 'studio', turnOrdinal: 8 },
  voice: { source: 'studio', turnOrdinal: 10 },
};

describe.if(pgAvailable)('GraduationService', () => {
  let db: PrimaryDatabase;
  let graduation: GraduationService;
  let proposals: ProposalService;
  let applier: ProposalApplyService;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db, translateError: (err: unknown) => Promise.reject(err) } as never;

    graduation = new GraduationService(databaseService, new BibleDocumentService(databaseService));
    proposals = new ProposalService(databaseService);
    const registry = new ActionExecutorRegistry();
    new IdeationActionRegistrar(registry, graduation).onModuleInit();
    applier = new ProposalApplyService(databaseService, registry);
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function makeSeed(overrides: Partial<Ideation.StorySeed> = {}, projectOverrides: Record<string, unknown> = {}) {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: 'Untitled idea', kind: 'new_novel', status: 'seed', ...projectOverrides })
      .returning();
    if (!project) throw new Error('failed to seed project');

    const fields = overrides.fields ?? SHEET;
    const [seed] = await db
      .insert(schema.storySeeds)
      .values({
        projectId: project.id,
        fields,
        provenance: overrides.provenance ?? PROVENANCE,
        constraints: overrides.constraints ?? CONSTRAINTS,
        tasteAnchors: overrides.tasteAnchors ?? { comps: ['Cradle'], preferences: ['earned power, no wish fulfilment'] },
        concepts: [],
        readiness: [],
        askedQuestions: [],
        contentHash: seedContentHash(fields),
      })
      .returning();
    const [session] = await db.insert(schema.chatSessions).values({ projectId: project.id, scopeType: 'ideation', mode: 'auto', title: 'Ideation Studio' }).returning();
    if (!seed || !session) throw new Error('failed to seed studio');
    return { projectId: project.id, seedId: seed.id, sessionId: session.id };
  }

  const docs = (projectId: bigint) => db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, projectId) });
  const facts = (projectId: bigint) => db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId) });

  describe('guards', () => {
    it('should refuse a project that has already graduated', async () => {
      const { projectId } = await makeSeed();
      await db.update(schema.projects).set({ status: 'active' }).where(eq(schema.projects.id, projectId));

      expect(await codeOf(graduation.graduate(projectId, { title: 'The Wreck Singer' }))).toBe('IDE_001');
    });

    it('should require a title and a premise, and nothing else', async () => {
      const { projectId } = await makeSeed();
      expect(await codeOf(graduation.graduate(projectId, { title: '   ' }))).toBe('IDE_002');

      const { premise: _premise, ...withoutPremise } = SHEET;
      const thin = await makeSeed({ fields: withoutPremise });
      expect(await codeOf(graduation.graduate(thin.projectId, { title: 'The Wreck Singer' }))).toBe('IDE_008');
    });

    it('should graduate a sheet a stress pass called empty — readiness advises, it never blocks', async () => {
      const { projectId, seedId } = await makeSeed({ fields: { premise: 'a salvager who hears dead ships' } });
      await db
        .update(schema.storySeeds)
        .set({ readiness: [{ dimension: 'hook', verdict: 'empty', note: 'there is no hook yet', fix: 'name the first wreck' }] })
        .where(eq(schema.storySeeds.id, seedId));

      const result = await graduation.graduate(projectId, { title: 'Anyway' });
      expect(result.project.status).toBe('active');
    });
  });

  describe('the handoff', () => {
    it('should carry the sheet into the project row, voice included', async () => {
      const { projectId } = await makeSeed({}, { instructions: 'Keep paragraphs short.' });

      const result = await graduation.graduate(projectId, { title: 'The Wreck Singer' });

      expect(result.project).toMatchObject({ name: 'The Wreck Singer', title: 'The Wreck Singer', status: 'active', premise: SHEET.premise, themes: ['debt', 'memory'] });
      expect(result.project.instructions).toBe('Keep paragraphs short.\n\nNarration voice, decided in the Ideation Studio: first person, past, dry');

      const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
      expect(project).toMatchObject({ status: 'active', name: 'The Wreck Singer' });
    });

    it('should write the two bible documents with real bodies and nothing else', async () => {
      const { projectId } = await makeSeed();

      const result = await graduation.graduate(projectId, { title: 'The Wreck Singer' });

      expect(result.documents).toEqual(['project/premise', 'project/reader-promise']);
      const written = await docs(projectId);
      expect(written.map(doc => `${doc.section}/${doc.slug}`).sort()).toEqual(['project/premise', 'project/reader-promise']);

      const premise = written.find(doc => doc.slug === 'premise');
      expect(premise?.body).toContain(SHEET.premise as string);
      expect(premise?.body).toContain(SHEET.hook as string);
      expect(premise?.body).toContain(SHEET.progressionSystem as string);
      expect(premise?.body).toContain(SHEET.stakes as string);
      expect(premise?.contentHash).toBeTruthy();

      const promise = written.find(doc => doc.slug === 'reader-promise');
      expect(promise?.body).toContain('she never collects suitors');
      expect(promise?.body).toContain('one point of view, hers');
      expect(promise?.body).toContain('the story stays in the wreck yards');
      expect(promise?.body).toContain('80 chapters, two a week');
      expect(promise?.body).toContain('Cradle');
    });

    it('should write one canon fact per named betrayal and no other', async () => {
      const { projectId } = await makeSeed();

      const result = await graduation.graduate(projectId, { title: 'The Wreck Singer' });

      expect(result.factKeys.sort()).toEqual(['promise:no-fake-death', 'promise:no-harem']);
      const written = await facts(projectId);
      expect(written).toHaveLength(2);
      for (const fact of written) {
        expect(fact.source).toBe('seed');
        expect(fact.revealChapter).toBeNull();
        expect(fact.constraintNote).toContain('Reader promise locked at ideation');
      }
      expect(written.find(fact => fact.factKey === 'promise:no-harem')?.text).toBe('she never collects suitors — one romance at a time or none');
    });

    it('should create no volumes and no entities — that is refinement’s work', async () => {
      const { projectId } = await makeSeed();

      await graduation.graduate(projectId, { title: 'The Wreck Singer' });

      expect(await db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId) })).toHaveLength(0);
      expect(await db.query.entities.findMany({ where: eq(schema.entities.projectId, projectId) })).toHaveLength(0);
    });

    it('should delete the sheet and archive the studio conversation', async () => {
      const { projectId, seedId, sessionId } = await makeSeed();

      await graduation.graduate(projectId, { title: 'The Wreck Singer' });

      expect(await db.query.storySeeds.findFirst({ where: eq(schema.storySeeds.id, seedId) })).toBeUndefined();
      expect((await db.query.chatSessions.findFirst({ where: eq(schema.chatSessions.id, sessionId) }))?.status).toBe('archived');
      expect(await codeOf(graduation.graduate(projectId, { title: 'Again' }))).toBe('IDE_001');
    });

    it('should report the provenance split the seed is about to take to the grave', async () => {
      const { projectId } = await makeSeed();

      const { provenance } = await graduation.graduate(projectId, { title: 'The Wreck Singer' });

      expect(provenance).toMatchObject({ filled: 11, author: 1, studio: 2, crossed: 1, unattributed: 7 });
      expect(provenance.fields.find(entry => entry.field === 'premise')).toEqual({ field: 'premise', source: 'author', turnOrdinal: 2 });
      expect(provenance.fields.find(entry => entry.field === 'genre')).toEqual({ field: 'genre' });
    });
  });

  describe('the action op', () => {
    const stage = (projectId: bigint, sessionId: string, title: string) =>
      proposals.create(projectId, {
        sessionId,
        scopeType: 'ideation',
        scopeRef: null,
        kind: 'ideation',
        summary: 'ready to start',
        changeSet: [{ op: 'action.graduate_seed', title }],
        allowedOps: scopeAllowedOps('ideation'),
      });

    it('should refuse to run from an auto-mode turn and stay pending', async () => {
      const { projectId, sessionId, seedId } = await makeSeed();
      const proposal = await stage(projectId, sessionId, 'The Wreck Singer');

      expect(await codeOf(applier.apply(projectId, proposal.id, { autoApplied: true }))).toBe('IDE_007');

      expect((await proposals.get(projectId, proposal.id)).status).toBe('pending');
      expect(await db.query.storySeeds.findFirst({ where: eq(schema.storySeeds.id, seedId) })).toBeDefined();
    });

    it('should graduate the seed when the author applies it themselves', async () => {
      const { projectId, sessionId, seedId } = await makeSeed();
      const proposal = await stage(projectId, sessionId, 'The Wreck Singer');

      const applied = await applier.apply(projectId, proposal.id);

      expect(applied.opResults[0]?.status).toBe('applied');
      expect((applied.opResults[0]?.result as { summary: string }).summary).toContain('The Wreck Singer');
      expect(await db.query.storySeeds.findFirst({ where: eq(schema.storySeeds.id, seedId) })).toBeUndefined();
      expect((await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }))?.status).toBe('active');
    });
  });

  describe('what refinement inherits', () => {
    it('should be a project the bible builder runs on unmodified', async () => {
      const { projectId } = await makeSeed();
      await graduation.graduate(projectId, { title: 'The Wreck Singer' });

      const url = process.env['DATABASE_POSTGRES_URL'] as string;
      const checkpointer = PostgresSaver.fromConnString(url.replace(/\/[^/]+$/, `/${dbName}`));
      await checkpointer.setup();
      const graph = createBibleBuilderGraph({
        db,
        contextAssembler: { forChapter: async () => ({ id: null }) },
        modelRouter: { structured: async () => ({ body: 'Stage prose built from the graduated premise.' }), resolveModel: () => ({ provider: 'test', model: 'test' }) },
        telemetry: {},
        toolRegistry: { forNode: () => [], getRaw: () => [] },
        indexingService: {},
        checkpointer,
      } as never);

      const runId = `bible-builder-graduated-${projectId}`;
      const state = (await graph.invoke(
        { projectId: String(projectId), brief: 'a salvager who hears dead ships', force: false, runId },
        { configurable: { thread_id: runId } },
      )) as {
        stagesDone: string[];
      };

      expect(state.stagesDone).toContain('foundation');
      const written = await docs(projectId);
      // The handoff documents are untouched — the builder writes its own stage slugs beside them.
      expect(written.find(doc => doc.slug === 'premise')?.body).toContain(SHEET.premise as string);
      expect(written.some(doc => doc.section === 'project' && doc.slug === 'foundation')).toBe(true);
      expect(await db.query.chatSessions.findFirst({ where: and(eq(schema.chatSessions.projectId, projectId), eq(schema.chatSessions.status, 'active')) })).toBeUndefined();
    });
  });
});
