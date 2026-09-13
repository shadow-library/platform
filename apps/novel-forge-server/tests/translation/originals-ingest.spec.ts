import { SQL } from 'bun';
import { beforeEach, describe, expect, it } from 'bun:test';
import { asc, eq } from 'drizzle-orm';
import { type FastifyRouter } from '@shadow-library/fastify';
import { chapterContentHash } from '@shadow-library/sdk/publishing';

import { CURATE_PERMISSION } from '@server/constants';
import { schema } from '@server/database';
import { TestEnvironment } from '@tests/test-environment';
import { TEST_ORG, TEST_USER, testIdP } from '@tests/test-idp';

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

testIdP.grantPermission({ kind: 'user', sub: TEST_USER.userId }, TEST_ORG, CURATE_PERMISSION);

const testEnv = new TestEnvironment('originals_ingest');

const CHAPTER_ONE = { title: '第一章', content: '叶凡站在青云宗的山门前，抬头望着漫天星辰。' };
const CHAPTER_TWO = { title: '第二章', content: '第二日清晨，云海翻涌，剑气纵横。' };

describe.if(pgAvailable)('Originals ingest', () => {
  testEnv.init();

  let secret = '';

  beforeEach(async () => {
    const response = await testEnv.getRouter().mockRequest().post('/api/v1/api-keys').body({ name: 'translator' });
    secret = response.json().secret as string;
  });

  const ingest = (): FastifyRouter => {
    const router = testEnv.getRouter({ authenticated: false });
    const key = secret;
    return new Proxy(router, {
      get(target, property, receiver) {
        if (property !== 'mockRequest') return Reflect.get(target, property, receiver) as unknown;
        return () => target.mockRequest().headers({ 'x-api-key': key });
      },
    });
  };

  async function createProject(ownerId = BigInt(TEST_USER.userId)): Promise<bigint> {
    const [project] = await testEnv
      .getPostgresClient()
      .insert(schema.projects)
      .values({ ownerId, name: `originals-${Math.random()}`, kind: 'translation', originalLanguage: 'zh' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  const push = (projectId: bigint, chapter: number, body: { title: string; content: string }) =>
    ingest().mockRequest().put(`/api/v1/ingest/projects/${projectId}/originals/${chapter}`).body(body);

  const auditRows = () => testEnv.getPostgresClient().select().from(schema.ingestAuditLog).orderBy(asc(schema.ingestAuditLog.id));

  it('should reject a request carrying no api key', async () => {
    const projectId = await createProject();
    const response = await testEnv.getRouter({ authenticated: false }).mockRequest().put(`/api/v1/ingest/projects/${projectId}/originals/1`).body(CHAPTER_ONE);
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('KEY_001');
  });

  it('should land an original for a key-only caller and audit it against the project reference', async () => {
    const projectId = await createProject();

    const created = await push(projectId, 1, CHAPTER_ONE);
    expect(created.statusCode).toBe(201);

    const chapter = await testEnv.getPostgresClient().query.chapters.findFirst({ where: eq(schema.chapters.projectId, projectId) });
    expect(chapter).toMatchObject({ number: 1, originalTitle: CHAPTER_ONE.title, originalContent: CHAPTER_ONE.content, content: null, locked: false });

    expect(await auditRows()).toMatchObject([{ action: 'original.push', sourceRef: `project:${projectId}`, projectId, outcome: 'created' }]);
  });

  it('should answer an identical re-push with 204 and an overwrite with 200', async () => {
    const projectId = await createProject();
    await push(projectId, 1, CHAPTER_ONE);

    expect((await push(projectId, 1, CHAPTER_ONE)).statusCode).toBe(204);
    expect((await push(projectId, 1, { ...CHAPTER_ONE, content: `${CHAPTER_ONE.content}\n\n新的一段。` })).statusCode).toBe(200);
    expect((await auditRows()).map(row => row.outcome)).toEqual(['created', 'noop', 'landed']);
  });

  it('should refuse a gap with TRN_010 and record it as out of order', async () => {
    const projectId = await createProject();
    const response = await push(projectId, 3, CHAPTER_TWO);
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('TRN_010');
    expect((await auditRows()).map(row => row.outcome)).toEqual(['out_of_order']);
  });

  /**
   * The app-global `ProjectOwnershipGuard` also matches this route's `:projectId`, so in practice it is the
   * guard's `PRJ_001` rather than the controller's `ING_001` that answers — both are a bare 404, which is the
   * property that matters: a foreign project must be indistinguishable from one that does not exist.
   */
  it('should answer a foreign project exactly like an absent one', async () => {
    const foreign = await createProject(BigInt(TEST_USER.userId) + 1n);

    const pushed = await push(foreign, 1, CHAPTER_ONE);
    const manifest = await ingest().mockRequest().get(`/api/v1/ingest/projects/${foreign}/originals`);
    const absent = await ingest().mockRequest().get('/api/v1/ingest/projects/999999/originals');

    expect([pushed.statusCode, manifest.statusCode, absent.statusCode]).toEqual([404, 404, 404]);
    expect(await testEnv.getPostgresClient().$count(schema.chapters, eq(schema.chapters.projectId, foreign))).toBe(0);
  });

  it('should report a manifest whose digests match the pushed prose', async () => {
    const projectId = await createProject();
    await push(projectId, 1, CHAPTER_ONE);
    await push(projectId, 2, CHAPTER_TWO);
    await testEnv.getPostgresClient().insert(schema.chapterTranslations).values({ projectId, chapter: 1, body: 'Ye Fan stood there.', status: 'translated' });

    const response = await ingest().mockRequest().get(`/api/v1/ingest/projects/${projectId}/originals`);
    expect(response.statusCode).toBe(200);
    const manifest = response.json() as { projectId: string; originalLanguage: string; chapters: { chapter: number; contentHash: string; translationStatus?: string | null }[] };
    expect(manifest).toMatchObject({ projectId: projectId.toString(), originalLanguage: 'zh' });
    expect(manifest.chapters).toHaveLength(2);
    expect(manifest.chapters[0]).toMatchObject({ chapter: 1, contentHash: chapterContentHash(CHAPTER_ONE), translationStatus: 'translated' });
    expect(manifest.chapters[1]).toMatchObject({ chapter: 2, contentHash: chapterContentHash(CHAPTER_TWO) });
    expect(manifest.chapters[1]?.translationStatus ?? null).toBeNull();
    expect((await auditRows()).at(-1)).toMatchObject({ action: 'originals.manifest', sourceRef: `project:${projectId}`, outcome: 'applied' });
  });
});
