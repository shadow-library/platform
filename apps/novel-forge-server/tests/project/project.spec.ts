import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import { DEFAULT_WRITING_INSTRUCTIONS } from '@modules/ai/prompts/authoring-preamble';
import { type Project, schema } from '@server/database';
import { TEST_USER } from '@tests/test-idp';
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

const testEnv = new TestEnvironment('project_test');

describe.if(pgAvailable)('Projects API', () => {
  testEnv.init();

  describe('POST /api/v1/projects', () => {
    it('should create a source project', async () => {
      const response = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({
        name: 'test-source',
        kind: 'source',
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toMatch(TEST_REGEX.id);
      expect(body.name).toBe('test-source');
      expect(body.kind).toBe('source');
    });

    it('should create a new_novel project', async () => {
      const response = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({
        name: 'test-novel',
        kind: 'new_novel',
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().kind).toBe('new_novel');
    });

    it('should allow two projects with the same name, distinguished by id', async () => {
      const first = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'dup', kind: 'new_novel' });
      const second = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'dup', kind: 'new_novel' });
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(second.json().id).not.toBe(first.json().id);
    });
  });

  describe('GET /api/v1/projects/:projectId', () => {
    it('should return 404 for unknown project', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/v1/projects/999999');
      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v1/projects/:projectId title', () => {
    it('should store the working title trimmed', async () => {
      const id = (await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'titled', kind: 'new_novel' })).json().id;

      const updated = await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${id}`).body({ title: '  The Wreck Singer ' });

      expect(updated.statusCode).toBe(200);
      expect(updated.json().title).toBe('The Wreck Singer');
    });

    it('should clear the working title when given a blank one', async () => {
      const id = (await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'untitled', kind: 'new_novel' })).json().id;
      await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${id}`).body({ title: 'The Wreck Singer' });

      const blank = await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${id}`).body({ title: ' \t ' });

      expect(blank.statusCode).toBe(200);
      expect(blank.json().title).toBeNull();
      const stored = await testEnv.getPostgresClient().query.projects.findFirst({ where: eq(schema.projects.id, BigInt(id)) });
      expect(stored?.title).toBeNull();
    });
  });

  describe('chapter writing instructions', () => {
    it('should pre-fill new projects with the default writing instructions', async () => {
      const response = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'wi-default', kind: 'new_novel' });
      expect(response.statusCode).toBe(201);
      expect(response.json().instructions).toBe(DEFAULT_WRITING_INSTRUCTIONS);
    });

    it('should persist a custom instruction and echo it back', async () => {
      const created = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'wi-custom', kind: 'new_novel' });
      const id = created.json().id;
      const custom = 'Write terse, punchy chapters of about 1200 words.';

      const updated = await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${id}`).body({ instructions: custom });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().instructions).toBe(custom);

      const fetched = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${id}`);
      expect(fetched.json().instructions).toBe(custom);
    });

    it('should reset to the default when the instruction is cleared', async () => {
      const created = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'wi-reset', kind: 'new_novel', instructions: 'custom for now' });
      const id = created.json().id;
      expect(created.json().instructions).toBe('custom for now');

      const cleared = await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${id}`).body({ instructions: '' });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().instructions).toBe(DEFAULT_WRITING_INSTRUCTIONS);
    });
  });

  describe('GET /api/v1/projects', () => {
    it('should list the newest activity first when the caller asks for no particular order', async () => {
      const db = testEnv.getPostgresClient();
      const stamps: [string, number][] = [
        ['sort-stalest', 3],
        ['sort-freshest', 1],
        ['sort-middling', 2],
      ];
      const names = stamps.map(([name]) => name);

      for (const [name, hoursAgo] of stamps) {
        const created = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name, kind: 'new_novel' });
        await db
          .update(schema.projects)
          .set({ updatedAt: new Date(Date.now() - hoursAgo * 3_600_000) })
          .where(eq(schema.projects.id, BigInt(created.json().id)));
      }

      const response = await testEnv.getRouter().mockRequest().get('/api/v1/projects?limit=100');

      expect(response.statusCode).toBe(200);
      const listed = response
        .json()
        .items.map((item: { name: string }) => item.name)
        .filter((name: string) => names.includes(name));
      expect(listed).toEqual(['sort-freshest', 'sort-middling', 'sort-stalest']);
    });
  });

  // The wire contract, not just the mapper: the browser renders `coverUrl` verbatim and has no storage
  // origin of its own to fall back on. Sending the bare ref instead once shipped covers pointing at the
  // client bundle's baked-in dev origin, so the ref must not appear on the response at all.
  describe('cover image URLs', () => {
    async function createProject(name: string): Promise<string> {
      const created = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name, kind: 'new_novel' });
      return created.json().id;
    }

    const cover = { image: Buffer.from('cover-bytes').toString('base64'), mime: 'image/png' };

    it('should respond with an absolute cover URL and never the stored ref', async () => {
      const id = await createProject('cover-url');

      const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${id}/cover`).body(cover);

      expect(response.statusCode).toBe(200);
      expect(response.json().coverUrl).toMatch(/^http:\/\/storage\.test\/[0-9a-f]{64}\.png$/);
      expect(response.json()).not.toHaveProperty('coverImagePath');
    });

    it('should carry the cover URL on a subsequent read', async () => {
      const id = await createProject('cover-url-read');
      await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${id}/cover`).body(cover);

      const fetched = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${id}`);

      expect(fetched.json().coverUrl).toMatch(/^http:\/\/storage\.test\/[0-9a-f]{64}\.png$/);
    });

    it('should omit the cover URL once the cover is removed', async () => {
      const id = await createProject('cover-url-clear');
      await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${id}/cover`).body(cover);

      const cleared = await testEnv.getRouter().mockRequest().delete(`/api/v1/projects/${id}/cover`);

      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().coverUrl).toBeUndefined();
    });
  });

  describe('workflow kinds', () => {
    async function createProjectRow(name: string, kind: Project.Kind, originalLanguage?: string): Promise<bigint> {
      const [project] = await testEnv
        .getPostgresClient()
        .insert(schema.projects)
        .values({ ownerId: BigInt(TEST_USER.userId), name, kind, originalLanguage })
        .returning();
      if (!project) throw new Error('failed to seed the project');
      return project.id;
    }

    async function seedOriginal(projectId: bigint, chapter: number, status?: 'translated' | 'finalized'): Promise<void> {
      const db = testEnv.getPostgresClient();
      await db.insert(schema.chapters).values({ projectId, number: chapter, originalContent: '\u539f\u6587', status: 'done' });
      if (status) await db.insert(schema.chapterTranslations).values({ projectId, chapter, body: 'English prose.', status });
    }

    describe('POST /api/v1/projects', () => {
      it('should create a translation project carrying its original language', async () => {
        const response = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'tl-create', kind: 'translation', originalLanguage: 'zh' });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toMatchObject({ kind: 'translation', originalLanguage: 'zh' });
      });

      it('should refuse a translation project without an original language', async () => {
        const response = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'tl-nolang', kind: 'translation' });

        expect(response.statusCode).toBe(400);
        expect(response.json().code).toBe('PRJ_006');
      });

      it('should refuse an original language on any other kind', async () => {
        const response = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'nn-lang', kind: 'new_novel', originalLanguage: 'zh' });

        expect(response.statusCode).toBe(400);
        expect(response.json().code).toBe('PRJ_006');
      });

      it('should refuse a curated project, which only ingest and promotion mint', async () => {
        const response = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'curated-door', kind: 'curated' });

        expect(response.statusCode).toBe(400);
        expect(response.json().code).toBe('PRJ_005');
      });

      it('should reject a malformed language tag at the schema', async () => {
        const response = await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'tl-bad', kind: 'translation', originalLanguage: 'Chinese!' });

        expect(response.statusCode).toBe(422);
      });

      it('should not seed bible placeholders for a translation project', async () => {
        const id = (await testEnv.getRouter().mockRequest().post('/api/v1/projects').body({ name: 'tl-nobible', kind: 'translation', originalLanguage: 'ko' })).json().id;

        const bible = await testEnv.getPostgresClient().query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, BigInt(id)) });
        expect(bible).toHaveLength(0);
      });
    });

    describe('PATCH /api/v1/projects/:projectId originalLanguage', () => {
      it('should persist a language change on a translation project', async () => {
        const id = await createProjectRow('tl-relang', 'translation', 'zh');

        const updated = await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${id}`).body({ originalLanguage: 'ja' });

        expect(updated.statusCode).toBe(200);
        expect(updated.json().originalLanguage).toBe('ja');
      });

      it('should refuse a language on a project of any other kind', async () => {
        const id = await createProjectRow('nn-relang', 'new_novel');

        const updated = await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${id}`).body({ originalLanguage: 'ja' });

        expect(updated.statusCode).toBe(400);
        expect(updated.json().code).toBe('PRJ_006');
      });

      it('should refuse clearing the language of a translation project', async () => {
        const id = await createProjectRow('tl-clearlang', 'translation', 'zh');

        const updated = await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${id}`).body({ originalLanguage: null });

        expect(updated.statusCode).toBe(400);
        expect(updated.json().code).toBe('PRJ_006');
      });
    });

    describe('POST /api/v1/projects/:projectId/clone', () => {
      it('should carry the original language onto a cloned translation project', async () => {
        const id = await createProjectRow('tl-clone-source', 'translation', 'pt-BR');

        const cloned = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${id}/clone`).body({ name: 'tl-clone' });

        expect(cloned.statusCode).toBe(201);
        expect(cloned.json()).toMatchObject({ kind: 'translation', originalLanguage: 'pt-BR' });
      });

      it('should copy the volumes of a cloned curated project', async () => {
        const db = testEnv.getPostgresClient();
        const id = await createProjectRow('curated-clone-source', 'curated');
        await db.insert(schema.volumes).values([
          { projectId: id, volumeKey: 'vol-1', title: 'The Gate Trials', status: 'approved' },
          { projectId: id, volumeKey: 'vol-2', title: 'The Ash Road', status: 'approved' },
        ]);

        const cloned = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${id}/clone`).body({ name: 'curated-clone' });

        expect(cloned.statusCode).toBe(201);
        expect(cloned.json().kind).toBe('curated');
        const volumes = await db.query.volumes.findMany({ where: eq(schema.volumes.projectId, BigInt(cloned.json().id)) });
        expect(volumes.map(v => v.volumeKey).sort()).toEqual(['vol-1', 'vol-2']);
      });
    });

    describe('PATCH /api/v1/projects/:projectId kind', () => {
      it('should switch a curated project to new_novel and add the bible placeholders', async () => {
        const id = await createProjectRow('curated-to-novel', 'curated');

        const updated = await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${id}`).body({ kind: 'new_novel' });

        expect(updated.statusCode).toBe(200);
        expect(updated.json().kind).toBe('new_novel');
        const bible = await testEnv.getPostgresClient().query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, id) });
        expect(bible).toHaveLength(schema.bibleSection.enumValues.length);
      });

      it('should treat a switch to the same kind as a no-op', async () => {
        const id = await createProjectRow('curated-same', 'curated');

        const updated = await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${id}`).body({ kind: 'curated' });

        expect(updated.statusCode).toBe(200);
        expect(updated.json().kind).toBe('curated');
        expect(await testEnv.getPostgresClient().query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, id) })).toHaveLength(0);
      });

      it('should refuse switching a translation project while a chapter is not finalized', async () => {
        const id = await createProjectRow('tl-unfinished', 'translation', 'zh');
        await seedOriginal(id, 1, 'finalized');
        await seedOriginal(id, 2, 'translated');
        await seedOriginal(id, 3);

        const updated = await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${id}`).body({ kind: 'curated' });

        expect(updated.statusCode).toBe(409);
        expect(updated.json().code).toBe('PRJ_007');
        expect(updated.json().message).toContain('2');
      });

      it('should switch a translation project to curated once every original is finalized', async () => {
        const id = await createProjectRow('tl-finished', 'translation', 'zh');
        await seedOriginal(id, 1, 'finalized');
        await seedOriginal(id, 2, 'finalized');

        const updated = await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${id}`).body({ kind: 'curated' });

        expect(updated.statusCode).toBe(200);
        expect(updated.json().kind).toBe('curated');
        expect(updated.json().originalLanguage).toBe('zh');
      });

      it('should switch an untranslated-but-empty translation project without complaint', async () => {
        const id = await createProjectRow('tl-empty', 'translation', 'zh');

        const updated = await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${id}`).body({ kind: 'curated' });

        expect(updated.statusCode).toBe(200);
        expect(updated.json().kind).toBe('curated');
      });

      it('should refuse every other workflow switch', async () => {
        const cases: [Project.Kind, Project.Kind][] = [
          ['source', 'new_novel'],
          ['source', 'curated'],
          ['new_novel', 'source'],
          ['new_novel', 'curated'],
          ['curated', 'translation'],
          ['curated', 'source'],
          ['translation', 'new_novel'],
        ];

        for (const [from, to] of cases) {
          const id = await createProjectRow(`switch-${from}-${to}`, from, from === 'translation' ? 'zh' : undefined);
          const updated = await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${id}`).body({ kind: to });
          expect(`${from}->${to}:${updated.statusCode}`).toBe(`${from}->${to}:400`);
          expect(updated.json().code).toBe('PRJ_008');
        }
      });
    });
  });
});
