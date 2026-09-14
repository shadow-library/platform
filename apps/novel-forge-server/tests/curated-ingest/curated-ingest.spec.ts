import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';
import { and, asc, eq } from 'drizzle-orm';
import { type FastifyRouter } from '@shadow-library/fastify';
import { chapterContentHash } from '@shadow-library/sdk/publishing';

import { CURATE_PERMISSION } from '@server/constants';
import { schema } from '@server/database';
import { TEST_REGEX, TestEnvironment } from '@tests/test-environment';
import { AUTH_AUDIENCE, issueTestBotKey, issueTestToken, TEST_BOT_ORG, TEST_ORG, TEST_USER, testIdP } from '@tests/test-idp';

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

/** A curator of the bot's own organisation — TEST_USER's `org-test` is not numeric, so it can never match a bot's. */
const ORG_CURATOR = '4242';
const ORG_MEMBER = '4243';
testIdP.grantPermission({ kind: 'user', sub: ORG_CURATOR }, TEST_BOT_ORG, CURATE_PERMISSION);

const CURATION_BOT_ID = 401n;
const curationKey = issueTestBotKey(CURATION_BOT_ID.toString(), [CURATE_PERMISSION]);
const uncuratedKey = issueTestBotKey('402', []);

const testEnv = new TestEnvironment('curated_ingest_test');

const SOURCE_REF = 'mvlempyr:1234';
const NOVEL = { title: 'A Borrowed Sky', synopsis: 'A courier smuggles weather across a closed border.', originalAuthor: 'Wen Qing', tags: ['Magic'], genres: ['Fantasy'] };

describe.if(pgAvailable)('Curated ingest', () => {
  testEnv.init();

  const asBot = (key: string): FastifyRouter => {
    const router = testEnv.getRouter({ authenticated: false });
    return new Proxy(router, {
      get(target, property, receiver) {
        if (property !== 'mockRequest') return Reflect.get(target, property, receiver) as unknown;
        return () => target.mockRequest().headers({ authorization: `Bearer ${key}` });
      },
    });
  };

  const ingest = (): FastifyRouter => asBot(curationKey);

  const createNovel = async (sourceRef = SOURCE_REF): Promise<bigint> => {
    const response = await ingest().mockRequest().put(`/api/v1/ingest/novels/${sourceRef}`).body(NOVEL);
    expect(response.statusCode).toBe(201);
    return BigInt(response.json().projectId as string);
  };

  const pushChapter = (ordinal: number, body: Record<string, string>, sourceRef = SOURCE_REF) =>
    ingest().mockRequest().put(`/api/v1/ingest/novels/${sourceRef}/chapters/${ordinal}`).body(body);

  const chapterBody = (ordinal: number) => ({ title: `Chapter ${ordinal}`, content: `The prose of chapter ${ordinal}.` });

  const auditRows = () => testEnv.getPostgresClient().select().from(schema.ingestAuditLog).orderBy(asc(schema.ingestAuditLog.id));

  describe('authentication', () => {
    it('should reject a request carrying no credential', async () => {
      const response = await testEnv.getRouter({ authenticated: false }).mockRequest().put(`/api/v1/ingest/novels/${SOURCE_REF}`).body(NOVEL);
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('IAM_001');
    });

    it('should treat an x-api-key request as unauthenticated, with no special handling left', async () => {
      const router = testEnv.getRouter({ authenticated: false });
      const responses = await Promise.all([
        router.mockRequest().headers({ 'x-api-key': 'nfk_absent' }).get(`/api/v1/ingest/novels/${SOURCE_REF}/manifest`),
        router.mockRequest().headers({ 'x-api-key': 'nfk_absent' }).post(`/api/v1/ingest/novels/${SOURCE_REF}/cover`).body({ mime: 'image/png', image: 'AA==' }),
      ]);
      expect(responses.map(response => response.statusCode)).toEqual([401, 401]);
      expect(responses.map(response => response.json().code)).toEqual(['IAM_001', 'IAM_001']);
    });

    it('should refuse a bot that does not hold the curate permission on every ingest route', async () => {
      const stranger = asBot(uncuratedKey);
      const responses = await Promise.all([
        stranger.mockRequest().put(`/api/v1/ingest/novels/${SOURCE_REF}`).body(NOVEL),
        stranger.mockRequest().get(`/api/v1/ingest/novels/${SOURCE_REF}/manifest`),
        stranger.mockRequest().post(`/api/v1/ingest/novels/${SOURCE_REF}/cover`).body({ mime: 'image/png', image: 'AA==' }),
      ]);
      expect(responses.map(response => response.statusCode)).toEqual([403, 403, 403]);
      expect(responses.map(response => response.json().code)).toEqual(['IAM_002', 'IAM_002', 'IAM_002']);
    });

    it('should refuse an authenticated user who does not hold the curate permission', async () => {
      const token = await issueTestToken({ sub: '9999' });
      const stranger = testEnv.getRouter({ authenticated: false });
      const responses = await Promise.all([
        stranger
          .mockRequest()
          .headers({ authorization: `Bearer ${token}` })
          .put(`/api/v1/ingest/novels/${SOURCE_REF}`)
          .body(NOVEL),
        stranger
          .mockRequest()
          .headers({ authorization: `Bearer ${token}` })
          .get(`/api/v1/ingest/novels/${SOURCE_REF}/manifest`),
      ]);
      expect(responses.map(response => response.statusCode)).toEqual([403, 403]);
      expect(responses.map(response => response.json().code)).toEqual(['IAM_002', 'IAM_002']);
      expect(await testEnv.getPostgresClient().$count(schema.projects)).toBe(0);
    });

    it('should no longer route the retired api-key surface', async () => {
      const router = testEnv.getRouter();
      const responses = await Promise.all([
        router.mockRequest().get('/api/v1/api-keys'),
        router.mockRequest().post('/api/v1/api-keys').body({ name: 'scraper' }),
        router.mockRequest().delete('/api/v1/api-keys/current'),
      ]);
      expect(responses.map(response => response.statusCode)).toEqual([404, 404, 404]);
    });

    it('should refuse a permissionless caller before the body is validated', async () => {
      const token = await issueTestToken({ sub: '9999' });
      const refused = await testEnv
        .getRouter({ authenticated: false })
        .mockRequest()
        .headers({ authorization: `Bearer ${token}` })
        .put(`/api/v1/ingest/novels/${SOURCE_REF}`)
        .body({});
      const validated = await testEnv.getRouter().mockRequest().put(`/api/v1/ingest/novels/${SOURCE_REF}`).body({});

      expect(refused.statusCode).toBe(403);
      expect(validated.statusCode).toBe(422);
    });

    it('should refuse a caller whose credential names no organisation to evaluate the permission in', async () => {
      const token = await testIdP.issueToken({ sub: TEST_USER.userId, audience: AUTH_AUDIENCE });
      const response = await testEnv
        .getRouter({ authenticated: false })
        .mockRequest()
        .headers({ authorization: `Bearer ${token}` })
        .put(`/api/v1/ingest/novels/${SOURCE_REF}`)
        .body(NOVEL);

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('IAM_002');
    });

    it('should let a human holding the curate permission ingest, owning the project itself and sharing it with nobody', async () => {
      const response = await testEnv.getRouter().mockRequest().put('/api/v1/ingest/novels/mvlempyr:4242').body(NOVEL);
      expect(response.statusCode).toBe(201);

      const project = await testEnv.getPostgresClient().query.projects.findFirst({ where: eq(schema.projects.id, BigInt(response.json().projectId as string)) });
      expect(project).toMatchObject({ ownerKind: 'user', ownerId: BigInt(TEST_USER.userId), organisationId: null, sharedWithOrg: false });
    });
  });

  describe('PUT /api/v1/ingest/novels/:sourceRef', () => {
    it('should create the curated project owned by the bot and shared with its organisation', async () => {
      const response = await ingest().mockRequest().put(`/api/v1/ingest/novels/${SOURCE_REF}`).body(NOVEL);
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ projectId: expect.stringMatching(/^\d+$/), created: true });

      const projectId = BigInt(response.json().projectId as string);
      const project = await testEnv.getPostgresClient().query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
      expect(project).toMatchObject({
        ownerKind: 'bot',
        ownerId: CURATION_BOT_ID,
        organisationId: BigInt(TEST_BOT_ORG),
        sharedWithOrg: true,
        kind: 'curated',
        status: 'active',
        name: NOVEL.title,
        title: NOVEL.title,
        brief: NOVEL.synopsis,
        originalAuthor: NOVEL.originalAuthor,
        sourceRef: SOURCE_REF,
      });
      expect(project?.importedMeta).toEqual({ genres: ['Fantasy'], tags: ['Magic'] });
      expect(project?.themes).toEqual(['Magic']);

      const bible = await testEnv.getPostgresClient().select().from(schema.bibleDocuments).where(eq(schema.bibleDocuments.projectId, projectId));
      expect(bible).toHaveLength(0);
    });

    it('should refuse a blank original author and land a padded one trimmed', async () => {
      const blank = await ingest()
        .mockRequest()
        .put(`/api/v1/ingest/novels/${SOURCE_REF}`)
        .body({ ...NOVEL, originalAuthor: '' });
      expect(blank.statusCode).toBe(422);

      const padded = await ingest()
        .mockRequest()
        .put(`/api/v1/ingest/novels/${SOURCE_REF}`)
        .body({ ...NOVEL, originalAuthor: '  Wen Qing  ' });
      expect(padded.statusCode).toBe(201);
      const project = await testEnv.getPostgresClient().query.projects.findFirst({ where: eq(schema.projects.id, BigInt(padded.json().projectId as string)) });
      expect(project?.originalAuthor).toBe('Wen Qing');

      const whitespace = await ingest()
        .mockRequest()
        .put('/api/v1/ingest/novels/mvlempyr:5678')
        .body({ ...NOVEL, originalAuthor: '   ' });
      expect(whitespace.statusCode).toBe(201);
      const unnamed = await testEnv.getPostgresClient().query.projects.findFirst({ where: eq(schema.projects.id, BigInt(whitespace.json().projectId as string)) });
      expect(unnamed?.originalAuthor).toBeNull();
    });

    it('should return the existing project without touching its metadata on a repeat push', async () => {
      const projectId = await createNovel();
      await testEnv.getPostgresClient().update(schema.projects).set({ title: 'Curated Title' }).where(eq(schema.projects.id, projectId));

      const response = await ingest()
        .mockRequest()
        .put(`/api/v1/ingest/novels/${SOURCE_REF}`)
        .body({ ...NOVEL, title: 'A Renamed Sky', synopsis: 'Rewritten upstream.' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ projectId: projectId.toString(), created: false });

      const project = await testEnv.getPostgresClient().query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
      expect(project?.title).toBe('Curated Title');
      expect(project?.brief).toBe(NOVEL.synopsis);
    });

    it('should mask a source reference held by another owner as absent', async () => {
      await testEnv.getPostgresClient().insert(schema.projects).values({ ownerId: 99n, name: 'Theirs', kind: 'curated', sourceRef: 'mvlempyr:9999' });

      const response = await ingest().mockRequest().put('/api/v1/ingest/novels/mvlempyr:9999').body(NOVEL);
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ING_001');
    });

    it('should reject a source reference the column cannot hold', async () => {
      const response = await ingest()
        .mockRequest()
        .put(`/api/v1/ingest/novels/${'x'.repeat(80)}`)
        .body(NOVEL);
      expect(response.statusCode).toBe(422);
    });
  });

  describe('PUT /api/v1/ingest/novels/:sourceRef/chapters/:sourceOrdinal', () => {
    it('should land consecutive chapters as locked human finals', async () => {
      const projectId = await createNovel();
      for (const ordinal of [1, 2, 3]) {
        const response = await pushChapter(ordinal, { ...chapterBody(ordinal), authorNote: `note ${ordinal}` });
        expect(response.statusCode).toBe(201);
      }

      const chapters = await testEnv.getPostgresClient().select().from(schema.chapters).where(eq(schema.chapters.projectId, projectId)).orderBy(asc(schema.chapters.sourceOrdinal));
      expect(chapters.map(chapter => [chapter.number, chapter.sourceOrdinal])).toEqual([
        [1, 1],
        [2, 2],
        [3, 3],
      ]);
      expect(chapters.every(chapter => chapter.locked && chapter.generator === 'human' && chapter.status === 'done' && !chapter.isolated)).toBe(true);
      expect(chapters[0]?.note).toBe('note 1');
      expect(chapters[0]?.wordCount).toBe(5);
      // Stamped once at land time; the manifest projects it rather than re-hashing the prose on every poll.
      expect(chapters.map(chapter => chapter.contentHash)).toEqual([1, 2, 3].map(ordinal => chapterContentHash(chapterBody(ordinal))));
    });

    it('should number a landed chapter after the highest existing chapter, not after its source ordinal', async () => {
      const projectId = await createNovel();
      await pushChapter(1, chapterBody(1));
      // Stands in for a forge-inserted interstitial: it takes a `number` but never a source ordinal.
      await testEnv.getPostgresClient().insert(schema.chapters).values({ projectId, number: 2, title: 'Interlude', content: 'Between.', status: 'done' });

      expect((await pushChapter(2, chapterBody(2))).statusCode).toBe(201);
      const landed = await testEnv.getPostgresClient().query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.sourceOrdinal, 2)) });
      expect(landed?.number).toBe(3);
    });

    it('should treat an identical re-push as a no-op', async () => {
      const projectId = await createNovel();
      await pushChapter(1, chapterBody(1));

      const response = await pushChapter(1, chapterBody(1));
      expect(response.statusCode).toBe(204);

      const chapters = await testEnv.getPostgresClient().select().from(schema.chapters).where(eq(schema.chapters.projectId, projectId));
      expect(chapters).toHaveLength(1);
    });

    it('should refuse a changed chapter at an ingested ordinal', async () => {
      await createNovel();
      await pushChapter(1, chapterBody(1));

      const response = await pushChapter(1, { title: 'Chapter 1', content: 'Rewritten upstream.' });
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ING_003');
    });

    it('should refuse an out-of-order ordinal', async () => {
      await createNovel();
      for (const ordinal of [1, 2, 3]) await pushChapter(ordinal, chapterBody(ordinal));

      const gap = await pushChapter(5, chapterBody(5));
      expect(gap.statusCode).toBe(409);
      expect(gap.json().code).toBe('ING_002');

      const backwards = await pushChapter(9, chapterBody(9));
      expect(backwards.json().code).toBe('ING_002');
    });

    it('should answer 404 for a novel that was never ingested', async () => {
      const response = await pushChapter(1, chapterBody(1), 'mvlempyr:0');
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ING_001');
    });
  });

  describe('POST /api/v1/ingest/novels/:sourceRef/cover', () => {
    it('should store the cover against the ingested project', async () => {
      const projectId = await createNovel();
      const image = Buffer.from('a tiny png').toString('base64');

      const response = await ingest().mockRequest().post(`/api/v1/ingest/novels/${SOURCE_REF}/cover`).body({ mime: 'image/png', image });
      expect(response.statusCode).toBe(204);

      const project = await testEnv.getPostgresClient().query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
      expect(project?.coverImagePath).toBeString();
    });
  });

  describe('GET /api/v1/ingest/novels/:sourceRef/manifest', () => {
    it('should hash exactly the title and content it stored, in source order', async () => {
      const projectId = await createNovel();
      for (const ordinal of [1, 2]) await pushChapter(ordinal, { ...chapterBody(ordinal), authorNote: 'ignored by the digest' });
      await testEnv.getPostgresClient().insert(schema.chapters).values({ projectId, number: 9, title: 'Interlude', content: 'Between.', status: 'done' });

      const response = await ingest().mockRequest().get(`/api/v1/ingest/novels/${SOURCE_REF}/manifest`);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        projectId: projectId.toString(),
        chapters: [1, 2].map(ordinal => ({ sourceOrdinal: ordinal, contentHash: chapterContentHash(chapterBody(ordinal)) })),
      });
    });

    it('should answer 404 for a novel this bot never ingested', async () => {
      const response = await ingest().mockRequest().get('/api/v1/ingest/novels/mvlempyr:0/manifest');
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ING_001');
    });
  });

  describe('organisation sharing', () => {
    const asUser = (token: string) =>
      testEnv
        .getRouter({ authenticated: false })
        .mockRequest()
        .headers({ authorization: `Bearer ${token}` });

    it('should let a curator of the bot organisation work on what the bot ingested, and nobody else', async () => {
      const projectId = await createNovel();

      const curator = await asUser(await testIdP.issueToken({ sub: ORG_CURATOR, audience: AUTH_AUDIENCE, org: TEST_BOT_ORG })).get(`/api/v1/projects/${projectId}`);
      const member = await asUser(await testIdP.issueToken({ sub: ORG_MEMBER, audience: AUTH_AUDIENCE, org: TEST_BOT_ORG })).get(`/api/v1/projects/${projectId}`);
      const outsider = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}`);

      expect(curator.statusCode).toBe(200);
      expect(curator.json().id).toBe(projectId.toString());
      expect([member.statusCode, outsider.statusCode]).toEqual([404, 404]);
    });
  });

  describe('audit trail', () => {
    it('should record one row per mutation, rejections included, naming the actor and the bot key', async () => {
      await createNovel();
      await pushChapter(1, chapterBody(1));
      await pushChapter(1, chapterBody(1));
      await pushChapter(1, { title: 'Chapter 1', content: 'Rewritten.' });
      await pushChapter(7, chapterBody(7));
      await pushChapter(1, chapterBody(1), 'mvlempyr:0');
      await ingest().mockRequest().post(`/api/v1/ingest/novels/${SOURCE_REF}/cover`).body({ mime: 'image/png', image: 'AA==' });

      const rows = await auditRows();
      expect(rows.map(row => [row.action, row.outcome])).toEqual([
        ['novel.upsert', 'created'],
        ['chapter.push', 'landed'],
        ['chapter.push', 'noop'],
        ['chapter.push', 'conflict'],
        ['chapter.push', 'out_of_order'],
        ['chapter.push', 'not_found'],
        ['cover.set', 'applied'],
      ]);
      expect(rows.every(row => row.sourceRef.startsWith('mvlempyr:') && row.actorKind === 'bot' && row.actorId === CURATION_BOT_ID)).toBe(true);
      expect(rows.every(row => TEST_REGEX.uuid.test(row.botKeyId as string))).toBe(true);
      expect(rows.at(-2)?.projectId).toBeNull();
    });

    it('should name a human curator as the actor and no bot key', async () => {
      await testEnv.getRouter().mockRequest().put('/api/v1/ingest/novels/mvlempyr:4242').body(NOVEL);

      const rows = await auditRows();
      expect(rows).toMatchObject([{ action: 'novel.upsert', outcome: 'created', actorKind: 'user', actorId: BigInt(TEST_USER.userId), botKeyId: null }]);
    });

    it('should not record a row for a read', async () => {
      await createNovel();
      await ingest().mockRequest().get(`/api/v1/ingest/novels/${SOURCE_REF}/manifest`);
      expect(await auditRows()).toHaveLength(1);
    });
  });
});
