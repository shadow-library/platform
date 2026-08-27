import { SQL } from 'bun';
import { beforeEach, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { type AppError } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { IdeationService } from '@modules/ideation';
import { ActionExecutorRegistry } from '@modules/refinement/action-registry';
import { seedContentHash } from '@server/common';
import { type PrimaryDatabase, schema } from '@server/database';
import { ProjectService } from '@modules/project/project/project.service';
import { TEST_REGEX, TestEnvironment } from '@tests/test-environment';

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

const testEnv = new TestEnvironment('ideation_api');

describe.if(pgAvailable)('Ideation API', () => {
  testEnv.init();

  let db: PrimaryDatabase;

  beforeEach(() => {
    db = testEnv.getPostgresClient();
  });

  function createSeed(spark?: string) {
    return testEnv
      .getRouter()
      .mockRequest()
      .post('/api/v1/seeds')
      .body(spark === undefined ? {} : { spark });
  }

  describe('POST /api/v1/seeds', () => {
    it('should create the project, the sheet, and the studio session together', async () => {
      const response = await createSeed();
      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.id).toMatch(TEST_REGEX.id);
      expect(body.projectId).toMatch(TEST_REGEX.id);
      expect(body.sessionId).toMatch(TEST_REGEX.uuid);
      expect(body).toMatchObject({ fields: {}, provenance: {}, constraints: [], concepts: [], readiness: [], askedQuestions: [], revision: 1 });
      expect(body.tasteAnchors).toEqual({ comps: [], preferences: [] });

      const projectId = BigInt(body.projectId);
      const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
      expect(project).toMatchObject({ status: 'seed', kind: 'new_novel', name: 'Untitled idea' });

      const session = await db.query.chatSessions.findFirst({ where: eq(schema.chatSessions.projectId, projectId) });
      expect(session).toMatchObject({ scopeType: 'ideation', mode: 'auto', scopeRef: null });
    });

    it('should store the sheet with an empty-fields content hash', async () => {
      const projectId = BigInt((await createSeed()).json().projectId);

      const seed = await db.query.storySeeds.findFirst({ where: eq(schema.storySeeds.projectId, projectId) });
      expect(seed?.contentHash).toBe(seedContentHash({}));
    });

    it('should skip the blank bible documents a normal new_novel project gets', async () => {
      const projectId = BigInt((await createSeed()).json().projectId);

      const docs = await db.select().from(schema.bibleDocuments).where(eq(schema.bibleDocuments.projectId, projectId));
      expect(docs).toHaveLength(0);
    });

    it('should persist the spark as the first user message of the studio session', async () => {
      const body = (await createSeed('  a salvager who can hear dead ships  ')).json();

      const messages = await db.query.chatMessages.findMany({ where: eq(schema.chatMessages.sessionId, body.sessionId) });
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ ordinal: 1, role: 'user', content: 'a salvager who can hear dead ships' });
    });

    it('should write no message when no spark was typed', async () => {
      const body = (await createSeed()).json();

      expect(await db.query.chatMessages.findMany({ where: eq(schema.chatMessages.sessionId, body.sessionId) })).toHaveLength(0);
    });

    it('should write no message for a blank spark', async () => {
      const body = (await createSeed('   ')).json();

      expect(await db.query.chatMessages.findMany({ where: eq(schema.chatMessages.sessionId, body.sessionId) })).toHaveLength(0);
    });

    it('should delete the orphan project when the follow-up transaction fails', async () => {
      const ideationService = testEnv.getService(IdeationService);
      const projectService = testEnv.getService(ProjectService);
      const originalCreate = projectService.create.bind(projectService);
      (projectService as unknown as { create: typeof projectService.create }).create = async (...args: Parameters<typeof projectService.create>) => {
        const project = await originalCreate(...args);
        // Pre-seeds the unique story_seeds row the transaction is about to insert, forcing a
        // deterministic constraint violation once the follow-up transaction runs.
        await db.insert(schema.storySeeds).values({ projectId: project.id, contentHash: seedContentHash({}) });
        return project;
      };

      try {
        await expect(ideationService.createSeed({})).rejects.toBeDefined();
      } finally {
        (projectService as unknown as { create: typeof projectService.create }).create = originalCreate;
      }

      const stranded = await db.query.projects.findFirst({ where: eq(schema.projects.name, 'Untitled idea') });
      expect(stranded).toBeUndefined();
    });
  });

  describe('GET /api/v1/seeds', () => {
    it('should list the seeds the caller owns, newest activity first', async () => {
      const older = (await createSeed('older idea')).json();
      const newer = (await createSeed('newer idea')).json();
      await db
        .update(schema.storySeeds)
        .set({ updatedAt: new Date(Date.now() - 60_000) })
        .where(eq(schema.storySeeds.id, BigInt(older.id)));

      const response = await testEnv.getRouter().mockRequest().get('/api/v1/seeds');
      expect(response.statusCode).toBe(200);
      expect(response.json().items.map((item: { id: string }) => item.id)).toEqual([newer.id, older.id]);
    });

    it('should carry the working title, the spark excerpt, and the session id', async () => {
      const created = (await createSeed('a salvager who can hear dead ships')).json();
      await db
        .update(schema.storySeeds)
        .set({ fields: { workingTitle: 'Salvage Rites' } })
        .where(eq(schema.storySeeds.id, BigInt(created.id)));

      const items = (await testEnv.getRouter().mockRequest().get('/api/v1/seeds')).json().items;
      expect(items[0]).toMatchObject({ workingTitle: 'Salvage Rites', sparkExcerpt: 'a salvager who can hear dead ships', sessionId: created.sessionId });
    });

    it('should truncate a long spark into an excerpt', async () => {
      const spark = 'x'.repeat(400);
      await createSeed(spark);

      const excerpt = (await testEnv.getRouter().mockRequest().get('/api/v1/seeds')).json().items[0].sparkExcerpt;
      expect(excerpt).toHaveLength(161);
      expect(excerpt.endsWith('…')).toBe(true);
    });

    it('should report a null title and excerpt for a seed with neither', async () => {
      await createSeed();

      expect((await testEnv.getRouter().mockRequest().get('/api/v1/seeds')).json().items[0]).toMatchObject({ workingTitle: null, sparkExcerpt: null });
    });

    it('should exclude seeds owned by somebody else', async () => {
      await createSeed('mine');
      const [theirs] = await db.insert(schema.projects).values({ name: 'theirs', kind: 'new_novel', status: 'seed', ownerId: 987_654n }).returning();
      await db.insert(schema.storySeeds).values({ projectId: theirs?.id as bigint, contentHash: seedContentHash({}) });

      const items = (await testEnv.getRouter().mockRequest().get('/api/v1/seeds')).json().items;
      expect(items).toHaveLength(1);
      expect(items[0].projectId).not.toBe(String(theirs?.id));
    });

    it('should return an empty shelf when the caller has no seeds', async () => {
      const body = (await testEnv.getRouter().mockRequest().get('/api/v1/seeds')).json();
      expect(body).toMatchObject({ items: [], total: 0, limit: 20, offset: 0 });
    });

    it('should paginate with a default limit and honour limit/offset', async () => {
      for (let i = 0; i < 3; i++) await createSeed(`idea ${i}`);

      const page1 = (await testEnv.getRouter().mockRequest().get('/api/v1/seeds?limit=2&offset=0')).json();
      expect(page1).toMatchObject({ total: 3, limit: 2, offset: 0 });
      expect(page1.items).toHaveLength(2);

      const page2 = (await testEnv.getRouter().mockRequest().get('/api/v1/seeds?limit=2&offset=2')).json();
      expect(page2).toMatchObject({ total: 3, limit: 2, offset: 2 });
      expect(page2.items).toHaveLength(1);

      const ids = [...page1.items, ...page2.items].map((item: { id: string }) => item.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('should cap the limit at 100', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/seeds?limit=1000');
      expect(response.statusCode).toBe(422);
    });
  });

  describe('GET /api/v1/projects/:projectId/seed', () => {
    it('should resolve the newest ideation session when a project has more than one', async () => {
      const created = (await createSeed('first session')).json();
      const projectId = BigInt(created.projectId);

      const [olderSession] = await db.query.chatSessions.findMany({ where: eq(schema.chatSessions.projectId, projectId) });
      await db
        .update(schema.chatSessions)
        .set({ createdAt: new Date(Date.now() - 60_000) })
        .where(eq(schema.chatSessions.id, olderSession?.id as string));

      const [newerSession] = await db.insert(schema.chatSessions).values({ projectId, scopeType: 'ideation', mode: 'auto', title: 'Ideation Studio' }).returning();

      const response = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/seed`);
      expect(response.json().sessionId).toBe(newerSession?.id);
    });

    it('should resolve the same session on every read when two share a timestamp', async () => {
      const created = (await createSeed('a tied session')).json();
      const projectId = BigInt(created.projectId);

      const tiedAt = new Date('2026-01-01T00:00:00.000Z');
      const [original] = await db.update(schema.chatSessions).set({ createdAt: tiedAt }).where(eq(schema.chatSessions.projectId, projectId)).returning();
      const [twin] = await db.insert(schema.chatSessions).values({ projectId, scopeType: 'ideation', mode: 'auto', title: 'Ideation Studio', createdAt: tiedAt }).returning();

      const expected = [original?.id, twin?.id].sort().reverse()[0];
      for (let read = 0; read < 3; read++) {
        const response = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/seed`);
        expect(response.json().sessionId).toBe(expected);
      }
    });

    it('should return the whole sheet', async () => {
      const created = (await createSeed('a salvager')).json();
      const seedId = BigInt(created.id);
      await db
        .update(schema.storySeeds)
        .set({
          fields: { premise: 'he hears dead ships', themes: ['grief'] },
          provenance: { premise: { source: 'author', turnOrdinal: 1 } },
          constraints: [{ key: 'no-harem', kind: 'promise', text: 'one romance only', lockedBy: 'author' }],
          tasteAnchors: { comps: ['Blame!'], preferences: ['cold worlds'] },
          concepts: [{ id: 'r1c0', round: 1, title: 'Salvage Rites', logline: 'a salvager', engine: 'debt', ladder: 'depth', posture: 'grim', fate: 'kept' }],
          readiness: [{ dimension: 'hook', verdict: 'thin', note: 'needs a face' }],
          askedQuestions: ['orient.shelf'],
          revision: 4,
        })
        .where(eq(schema.storySeeds.id, seedId));

      const response = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${created.projectId}/seed`);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: created.id,
        projectId: created.projectId,
        sessionId: created.sessionId,
        fields: { premise: 'he hears dead ships', themes: ['grief'] },
        provenance: { premise: { source: 'author', turnOrdinal: 1 } },
        constraints: [{ key: 'no-harem', kind: 'promise', text: 'one romance only', lockedBy: 'author' }],
        tasteAnchors: { comps: ['Blame!'], preferences: ['cold worlds'] },
        readiness: [{ dimension: 'hook', verdict: 'thin', note: 'needs a face' }],
        askedQuestions: ['orient.shelf'],
        revision: 4,
      });
    });

    it('should reject an active project with IDE_001', async () => {
      const project = (await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'a novel', kind: 'new_novel' })).json();

      const response = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${project.id}/seed`);
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('IDE_001');
    });

    it('should report a seed project whose sheet is gone as IDE_001', async () => {
      const created = (await createSeed()).json();
      await db.delete(schema.storySeeds).where(eq(schema.storySeeds.id, BigInt(created.id)));

      expect((await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${created.projectId}/seed`)).json().code).toBe('IDE_001');
    });

    it('should not leak a seed owned by somebody else', async () => {
      const [theirs] = await db.insert(schema.projects).values({ name: 'theirs', kind: 'new_novel', status: 'seed', ownerId: 987_654n }).returning();
      await db.insert(schema.storySeeds).values({ projectId: theirs?.id as bigint, contentHash: seedContentHash({}) });

      const response = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${theirs?.id}/seed`);
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('PRJ_001');
    });
  });

  describe('POST /api/v1/projects/:projectId/seed/stress', () => {
    it('should refuse a stress pass on somebody else’s seed before any model runs', async () => {
      const [theirs] = await db.insert(schema.projects).values({ name: 'theirs', kind: 'new_novel', status: 'seed', ownerId: 987_654n }).returning();
      await db.insert(schema.storySeeds).values({ projectId: theirs?.id as bigint, contentHash: seedContentHash({}) });

      const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${theirs?.id}/seed/stress`).body({});
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('PRJ_001');
    });

    it('should reject a stress pass on an active project with IDE_001', async () => {
      const project = (await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'a novel', kind: 'new_novel' })).json();

      const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${project.id}/seed/stress`).body({});
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('IDE_001');
    });
  });

  describe('POST /api/v1/projects/:projectId/seed/graduate', () => {
    async function seedReadyToGraduate(): Promise<bigint> {
      const projectId = BigInt((await createSeed('a salvager')).json().projectId);
      await db
        .update(schema.storySeeds)
        .set({
          fields: { premise: 'a salvager who can hear the dead ships she strips', voice: 'first person, past, dry' },
          provenance: { premise: { source: 'author', turnOrdinal: 1 } },
          constraints: [{ key: 'no-harem', kind: 'promise', text: 'one romance at a time or none', lockedBy: 'author' }],
        })
        .where(eq(schema.storySeeds.projectId, projectId));
      return projectId;
    }

    it('should turn the seed into a novel and report what it wrote', async () => {
      const projectId = await seedReadyToGraduate();

      const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/seed/graduate`).body({ title: 'The Wreck Singer' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.project).toMatchObject({ id: String(projectId), name: 'The Wreck Singer', status: 'active' });
      expect(body.documents).toEqual(['project/premise', 'project/reader-promise']);
      expect(body.factKeys).toEqual(['promise:no-harem']);
      expect(body.provenance).toMatchObject({ filled: 2, author: 1, studio: 0, unattributed: 1 });
    });

    it('should require a title', async () => {
      const projectId = await seedReadyToGraduate();

      const empty = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/seed/graduate`).body({ title: '' });
      expect(empty.statusCode).toBe(422);

      const blank = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/seed/graduate`).body({ title: '   ' });
      expect(blank.statusCode).toBe(400);
      expect(blank.json().code).toBe('IDE_002');
    });

    it('should answer a colliding promise fact with a conflict and leave the project a seed', async () => {
      const projectId = await seedReadyToGraduate();
      // Written straight to the table: the fact endpoints refuse a seed project, so only a fact that
      // predates the seed status — or one the studio's own grammar wrote — can collide here.
      await db.insert(schema.canonFacts).values({ projectId, factKey: 'promise:no-harem', text: 'squatting on the key' });

      const collided = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/seed/graduate`).body({ title: 'The Wreck Singer' });
      expect(collided.statusCode).toBe(409);
      expect(collided.json().code).toBe('FCT_004');
      expect((await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }))?.status).toBe('seed');
      expect(await db.query.storySeeds.findFirst({ where: eq(schema.storySeeds.projectId, projectId) })).toBeDefined();

      await db.delete(schema.canonFacts).where(eq(schema.canonFacts.projectId, projectId));
      const retried = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/seed/graduate`).body({ title: 'The Wreck Singer' });
      expect(retried.statusCode).toBe(200);
      expect(retried.json().factKeys).toEqual(['promise:no-harem']);
    });

    it('should have its action executor wired into the live registry', () => {
      expect(testEnv.getService(ActionExecutorRegistry).has('action.graduate_seed')).toBe(true);
    });

    it('should refuse somebody else’s seed', async () => {
      const [theirs] = await db.insert(schema.projects).values({ name: 'theirs', kind: 'new_novel', status: 'seed', ownerId: 987_654n }).returning();
      await db.insert(schema.storySeeds).values({ projectId: theirs?.id as bigint, fields: { premise: 'theirs' }, contentHash: seedContentHash({}) });

      const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${theirs?.id}/seed/graduate`).body({ title: 'Mine now' });
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('PRJ_001');
    });
  });

  describe('chat message ordinals', () => {
    it('should surface a lost ordinal race as CHT_006 rather than an internal error', async () => {
      const created = (await createSeed('a salvager')).json();
      // The spark already holds ordinal 1 — this is exactly the row a second concurrent turn computes.
      const collide = testEnv
        .getService(DatabaseService)
        .run(() => db.insert(schema.chatMessages).values({ sessionId: created.sessionId, projectId: BigInt(created.projectId), ordinal: 1, role: 'user', content: 'again' }));

      const error = (await collide.then(
        () => null,
        (err: AppError) => err,
      )) as AppError;
      expect(error.code).toBe('CHT_006');
      expect(error.status).toBe(409);
    });
  });

  describe('GET /api/v1/projects', () => {
    beforeEach(async () => {
      await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'a novel', kind: 'new_novel' });
      await createSeed('an idea');
    });

    it('should hide seeds from the main shelf by default', async () => {
      const body = (await testEnv.getRouter().mockRequest().get('/api/v1/projects')).json();

      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({ name: 'a novel', status: 'active' });
      expect(body.total).toBe(1);
    });

    it('should list only seeds when asked for them', async () => {
      const body = (await testEnv.getRouter().mockRequest().get('/api/v1/projects?status=seed')).json();

      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({ name: 'Untitled idea', status: 'seed' });
    });

    it('should keep the kind filter working alongside the status filter', async () => {
      await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'a source', kind: 'source' });

      const body = (await testEnv.getRouter().mockRequest().get('/api/v1/projects?kind=source')).json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({ name: 'a source', status: 'active' });
    });

    it('should reject an unknown status', async () => {
      expect((await testEnv.getRouter().mockRequest().get('/api/v1/projects?status=graduated')).statusCode).toBe(422);
    });

    it('should still expose a seed through the single-project route', async () => {
      const seedProjectId = (await db.query.projects.findFirst({ where: and(eq(schema.projects.status, 'seed'), eq(schema.projects.name, 'Untitled idea')) }))?.id;

      const response = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${seedProjectId}`);
      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('seed');
    });
  });
});
