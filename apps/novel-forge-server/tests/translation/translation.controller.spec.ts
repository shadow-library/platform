import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { JobExecutor } from '@modules/jobs/job.executor';
import { schema } from '@server/database';
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

const testEnv = new TestEnvironment('translation_api');

const ORIGINAL_ONE = '叶凡站在青云宗的山门前，抬头望着漫天星辰。\n\n他知道，今夜之后再无回头路。';
const ORIGINAL_TWO = '第二日清晨，云海翻涌，剑气纵横。';

describe.if(pgAvailable)('Translation API', () => {
  testEnv.init();

  const db = () => testEnv.getPostgresClient();

  async function createProject(kind: 'translation' | 'new_novel' = 'translation', language = 'zh'): Promise<bigint> {
    const response = await testEnv
      .getRouter()
      .mockRequest()
      .post('/api/v1/projects')
      .body({ name: `translation-api-${Math.random()}`, kind, ...(kind === 'translation' ? { originalLanguage: language } : {}) });
    return BigInt(response.json().id as string);
  }

  const pushOriginal = (projectId: bigint, chapter: number, title: string, content: string) =>
    testEnv.getRouter().mockRequest().put(`/api/v1/projects/${projectId}/translation/originals/${chapter}`).body({ title, content });

  async function seedTerm(projectId: bigint, sourceTerm: string, target: string, status: 'suggested' | 'approved' = 'suggested'): Promise<bigint> {
    const [term] = await db()
      .insert(schema.translationGlossary)
      .values({ projectId, sourceTerm, target, category: 'character', treatment: 'transliterate', status, origin: 'seed', createdChapter: 0 })
      .returning();
    if (!term) throw new Error('failed to seed glossary term');
    return term.id;
  }

  async function seedTranslation(projectId: bigint, chapter: number, appliedTerms: Record<string, number>, body = 'Ye Fan stood before the mountain gate.'): Promise<void> {
    await db()
      .insert(schema.chapterTranslations)
      .values({ projectId, chapter, title: `Chapter ${chapter}`, body, status: 'translated', appliedTerms, sourceHash: 'seeded' });
  }

  describe('PUT /api/v1/projects/:projectId/translation/config', () => {
    it('should create the translation on first write and round-trip config into status', async () => {
      const projectId = await createProject();
      const put = await testEnv
        .getRouter()
        .mockRequest()
        .put(`/api/v1/projects/${projectId}/translation/config`)
        .body({ styleNotes: 'Past tense, third person limited.', settings: { auditEnabled: false, pauseAfterSeed: false } });
      expect(put.statusCode).toBe(200);
      expect(put.json()).toMatchObject({ phase: 'pending', styleNotes: 'Past tense, third person limited.', settings: { auditEnabled: false, pauseAfterSeed: false } });

      const status = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/translation`);
      expect(status.statusCode).toBe(200);
      expect(status.json()).toMatchObject({
        translation: { styleNotes: 'Past tense, third person limited.' },
        originalLanguage: 'zh',
        counts: { originals: 0, untranslated: 0, translated: 0, attention: 0, finalized: 0, failed: 0, stale: 0 },
        glossary: { approved: 0, suggested: 0, rejected: 0 },
      });
    });

    it('should reject non-translation projects with TRN_003', async () => {
      const projectId = await createProject('new_novel');
      const response = await testEnv.getRouter().mockRequest().put(`/api/v1/projects/${projectId}/translation/config`).body({ styleNotes: 'x' });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('TRN_003');
    });

    it('should reject non-translation projects with TRN_003 on the read routes too, never an empty list', async () => {
      const projectId = await createProject('new_novel');
      const router = testEnv.getRouter();
      const responses = await Promise.all([
        router.mockRequest().get(`/api/v1/projects/${projectId}/translation/chapters`),
        router.mockRequest().get(`/api/v1/projects/${projectId}/translation/glossary`),
        router.mockRequest().get(`/api/v1/projects/${projectId}/translation/manuscript`),
        router.mockRequest().get(`/api/v1/projects/${projectId}/translation/chapters/1`),
        router.mockRequest().get(`/api/v1/projects/${projectId}/translation/originals/1`),
      ]);
      expect(responses.map(response => response.statusCode)).toEqual([400, 400, 400, 400, 400]);
      expect(responses.map(response => response.json().code)).toEqual(['TRN_003', 'TRN_003', 'TRN_003', 'TRN_003', 'TRN_003']);
    });
  });

  describe('PUT /api/v1/projects/:projectId/translation/originals/:chapter', () => {
    it('should refuse a gap with TRN_010 and land a contiguous chapter with 201', async () => {
      const projectId = await createProject();

      const gap = await pushOriginal(projectId, 2, '第二章', ORIGINAL_TWO);
      expect(gap.statusCode).toBe(409);
      expect(gap.json().code).toBe('TRN_010');

      const created = await pushOriginal(projectId, 1, '第一章', ORIGINAL_ONE);
      expect(created.statusCode).toBe(201);

      const chapter = await db().query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
      expect(chapter).toMatchObject({ originalTitle: '第一章', originalContent: ORIGINAL_ONE, content: null, wordCount: null, status: 'done', generator: 'human', locked: false });
      expect(chapter?.contentHash).toBeTruthy();
    });

    it('should answer an identical re-push with 204 and an overwrite with 200 that flips sourceStale', async () => {
      const projectId = await createProject();
      await pushOriginal(projectId, 1, '第一章', ORIGINAL_ONE);
      await seedTranslation(projectId, 1, {});

      const unchanged = await pushOriginal(projectId, 1, '第一章', ORIGINAL_ONE);
      expect(unchanged.statusCode).toBe(204);
      const stillFresh = await db().query.chapterTranslations.findFirst({ where: eq(schema.chapterTranslations.projectId, projectId) });
      expect(stillFresh?.sourceStale).toBe(false);

      const overwritten = await pushOriginal(projectId, 1, '第一章', `${ORIGINAL_ONE}\n\n新的一段。`);
      expect(overwritten.statusCode).toBe(200);
      const stale = await db().query.chapterTranslations.findFirst({ where: eq(schema.chapterTranslations.projectId, projectId) });
      expect(stale?.sourceStale).toBe(true);
    });

    it('should reject prose that is not in the project language with a 422 field error', async () => {
      const projectId = await createProject();
      const response = await pushOriginal(projectId, 1, 'Chapter One', 'Ye Fan stood before the mountain gate and looked up at the stars.');
      expect(response.statusCode).toBe(422);
      expect(response.json().fields).toEqual([{ field: 'content', msg: 'This does not look like zh. Paste the original, not a translation.' }]);
    });

    it('should skip the script check for a Latin-script project', async () => {
      const projectId = await createProject('translation', 'fr');
      const response = await pushOriginal(projectId, 1, 'Chapitre un', 'Il se tenait devant la porte de la montagne.');
      expect(response.statusCode).toBe(201);
    });
  });

  describe('DELETE /api/v1/projects/:projectId/translation/originals/:chapter', () => {
    it('should drop the last chapter and refuse an interior one with TRN_010', async () => {
      const projectId = await createProject();
      await pushOriginal(projectId, 1, '第一章', ORIGINAL_ONE);
      await pushOriginal(projectId, 2, '第二章', ORIGINAL_TWO);

      const interior = await testEnv.getRouter().mockRequest().delete(`/api/v1/projects/${projectId}/translation/originals/1`);
      expect(interior.statusCode).toBe(409);
      expect(interior.json().code).toBe('TRN_010');

      const last = await testEnv.getRouter().mockRequest().delete(`/api/v1/projects/${projectId}/translation/originals/2`);
      expect(last.statusCode).toBe(204);
      const remaining = await db().query.chapters.findMany({ where: eq(schema.chapters.projectId, projectId) });
      expect(remaining.map(c => c.number)).toEqual([1]);
    });

    it('should refuse deleting a finalized chapter with TRN_004 and an absent one with TRN_012', async () => {
      const projectId = await createProject();
      await pushOriginal(projectId, 1, '第一章', ORIGINAL_ONE);
      await seedTranslation(projectId, 1, {});
      await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/translation/chapters/1/finalize`);

      const finalized = await testEnv.getRouter().mockRequest().delete(`/api/v1/projects/${projectId}/translation/originals/1`);
      expect(finalized.statusCode).toBe(409);
      expect(finalized.json().code).toBe('TRN_004');

      const absent = await testEnv.getRouter().mockRequest().delete(`/api/v1/projects/${projectId}/translation/originals/9`);
      expect(absent.statusCode).toBe(404);
      expect(absent.json().code).toBe('TRN_012');
    });
  });

  describe('glossary lifecycle', () => {
    it('should bump the revision on modify-and-approve and mark every dependent chapter stale', async () => {
      const projectId = await createProject();
      await pushOriginal(projectId, 1, '第一章', ORIGINAL_ONE);
      const termId = await seedTerm(projectId, '叶凡', 'Ye Fan');
      await seedTranslation(projectId, 1, { [termId.toString()]: 1 });

      const approved = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/translation/glossary/${termId}/approve`).body({ target: 'Evan Vale' });
      expect(approved.statusCode).toBe(200);
      expect(approved.json()).toMatchObject({ status: 'approved', target: 'Evan Vale', revision: 2 });

      const dependent = await db().query.chapterTranslations.findFirst({ where: eq(schema.chapterTranslations.projectId, projectId) });
      expect(dependent?.glossaryStale).toBe(true);
    });

    it('should not bump the revision when approval changes nothing', async () => {
      const projectId = await createProject();
      const termId = await seedTerm(projectId, '青云宗', 'Azure Cloud Sect');
      await seedTranslation(projectId, 1, { [termId.toString()]: 1 });

      const approved = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/translation/glossary/${termId}/approve`).body({});
      expect(approved.json()).toMatchObject({ status: 'approved', revision: 1 });
      const dependent = await db().query.chapterTranslations.findFirst({ where: eq(schema.chapterTranslations.projectId, projectId) });
      expect(dependent?.glossaryStale).toBe(false);
    });

    it('should refuse a duplicate manual term with TRN_009 and answer an unknown id with TRN_007', async () => {
      const projectId = await createProject();
      const body = { sourceTerm: '剑气', target: 'sword qi', category: 'ability', treatment: 'translate' };
      const first = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/translation/glossary`).body(body);
      expect(first.statusCode).toBe(201);
      expect(first.json()).toMatchObject({ status: 'approved', origin: 'manual' });

      const duplicate = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/translation/glossary`).body(body);
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().code).toBe('TRN_009');

      const missing = await testEnv.getRouter().mockRequest().patch(`/api/v1/projects/${projectId}/translation/glossary/999999`).body({ target: 'x' });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().code).toBe('TRN_007');
    });

    it('should paginate and filter the glossary', async () => {
      const projectId = await createProject();
      await seedTerm(projectId, '叶凡', 'Ye Fan');
      await seedTerm(projectId, '青云宗', 'Azure Cloud Sect', 'approved');
      await seedTerm(projectId, '剑气', 'sword qi');

      const page = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/translation/glossary?page=1&limit=2`);
      expect(page.json()).toMatchObject({ total: 3, page: 1, limit: 2 });
      expect(page.json().items).toHaveLength(2);

      const approvedOnly = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/translation/glossary?status=approved`);
      expect(approvedOnly.json().items.map((item: { sourceTerm: string }) => item.sourceTerm)).toEqual(['青云宗']);

      const searched = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/translation/glossary?q=sword`);
      expect(searched.json().items.map((item: { target: string }) => item.target)).toEqual(['sword qi']);
    });

    it('should apply bulk decisions in one pass, staling only the chapters whose rendering moved', async () => {
      const projectId = await createProject();
      const renamed = await seedTerm(projectId, '叶凡', 'Ye Fan');
      const kept = await seedTerm(projectId, '青云宗', 'Azure Cloud Sect');
      const dropped = await seedTerm(projectId, '他', 'he');
      await seedTranslation(projectId, 1, { [renamed.toString()]: 1 });
      await seedTranslation(projectId, 2, { [kept.toString()]: 1, [dropped.toString()]: 1 }, 'A second chapter.');

      const response = await testEnv
        .getRouter()
        .mockRequest()
        .post(`/api/v1/projects/${projectId}/translation/glossary/decisions`)
        .body({
          decisions: [
            { id: renamed.toString(), decision: 'approve', target: 'Evan Vale' },
            { id: kept.toString(), decision: 'approve' },
            { id: dropped.toString(), decision: 'reject' },
          ],
        });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ approved: 2, rejected: 1 });

      const terms = await db().query.translationGlossary.findMany({ where: eq(schema.translationGlossary.projectId, projectId) });
      expect(terms.find(term => term.id === renamed)).toMatchObject({ status: 'approved', target: 'Evan Vale', revision: 2 });
      expect(terms.find(term => term.id === kept)).toMatchObject({ status: 'approved', revision: 1 });
      expect(terms.find(term => term.id === dropped)).toMatchObject({ status: 'rejected', revision: 1 });

      const rows = await db().query.chapterTranslations.findMany({ where: eq(schema.chapterTranslations.projectId, projectId) });
      expect(rows.find(row => row.chapter === 1)?.glossaryStale).toBe(true);
      // A rejection is not a rendering change: bulk-clearing the review queue must not stale every chapter.
      expect(rows.find(row => row.chapter === 2)?.glossaryStale).toBe(false);
    });

    it('should collapse a repeated id to the last decision for it', async () => {
      const projectId = await createProject();
      const termId = await seedTerm(projectId, '叶凡', 'Ye Fan');

      const response = await testEnv
        .getRouter()
        .mockRequest()
        .post(`/api/v1/projects/${projectId}/translation/glossary/decisions`)
        .body({
          decisions: [
            { id: termId.toString(), decision: 'approve', target: 'Evan Vale' },
            { id: termId.toString(), decision: 'approve', target: 'Evan Wilde' },
          ],
        });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ approved: 1, rejected: 0 });

      const term = await db().query.translationGlossary.findFirst({ where: eq(schema.translationGlossary.id, termId) });
      expect(term).toMatchObject({ status: 'approved', target: 'Evan Wilde', revision: 2 });
    });

    it('should refuse the whole batch when one id is unknown', async () => {
      const projectId = await createProject();
      const known = await seedTerm(projectId, '叶凡', 'Ye Fan');

      const response = await testEnv
        .getRouter()
        .mockRequest()
        .post(`/api/v1/projects/${projectId}/translation/glossary/decisions`)
        .body({
          decisions: [
            { id: known.toString(), decision: 'approve' },
            { id: '999999', decision: 'reject' },
          ],
        });
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('TRN_007');

      const untouched = await db().query.translationGlossary.findFirst({ where: eq(schema.translationGlossary.id, known) });
      expect(untouched?.status).toBe('suggested');
    });
  });

  describe('POST /api/v1/projects/:projectId/translation/chapters/:chapter/finalize', () => {
    it('should walk every gate and then commit the prose into canon', async () => {
      const projectId = await createProject();
      await pushOriginal(projectId, 1, '第一章', ORIGINAL_ONE);
      const termId = await seedTerm(projectId, '叶凡', 'Ye Fan');
      await seedTranslation(projectId, 1, { [termId.toString()]: 1 });
      const finalize = () => testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/translation/chapters/1/finalize`);
      const translationWhere = eq(schema.chapterTranslations.projectId, projectId);

      const pending = await finalize();
      expect(pending.statusCode).toBe(400);
      expect(pending.json()).toMatchObject({ code: 'TRN_005', message: expect.stringContaining('1 glossary terms') });

      await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/translation/glossary/${termId}/approve`).body({ target: 'Evan Vale' });
      const stale = await finalize();
      expect(stale.statusCode).toBe(409);
      expect(stale.json().code).toBe('TRN_006');

      await db().update(schema.chapterTranslations).set({ glossaryStale: false, sourceStale: true }).where(translationWhere);
      const sourceMoved = await finalize();
      expect(sourceMoved.statusCode).toBe(409);
      expect(sourceMoved.json().code).toBe('TRN_011');

      await db().update(schema.chapterTranslations).set({ sourceStale: false }).where(translationWhere);
      const committed = await finalize();
      expect(committed.statusCode).toBe(200);
      expect(committed.json()).toMatchObject({ chapter: 1, wordCount: 7, republished: false });

      const chapter = await db().query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
      expect(chapter).toMatchObject({ title: 'Chapter 1', content: 'Ye Fan stood before the mountain gate.', wordCount: 7, locked: true, originalContent: ORIGINAL_ONE });

      const again = await finalize();
      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe('TRN_004');
    });

    it('should refuse an edit or a re-run of a finalized chapter and keep the prose on reopen', async () => {
      const projectId = await createProject();
      await pushOriginal(projectId, 1, '第一章', ORIGINAL_ONE);
      await seedTranslation(projectId, 1, {});
      await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/translation/chapters/1/finalize`);
      const executor = testEnv.getService(JobExecutor);
      (executor as { dispatch: (jobId: string) => Promise<void> }).dispatch = async () => undefined;

      const edit = await testEnv.getRouter().mockRequest().put(`/api/v1/projects/${projectId}/translation/chapters/1`).body({ body: 'Rewritten.' });
      expect(edit.statusCode).toBe(409);
      expect(edit.json().code).toBe('TRN_004');

      const rerun = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/translation/chapters/1`).body({});
      expect(rerun.statusCode).toBe(409);
      expect(rerun.json().code).toBe('TRN_004');

      const reopened = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/translation/chapters/1/reopen`);
      expect(reopened.statusCode).toBe(200);
      expect(reopened.json().translation).toMatchObject({ status: 'translated' });
      expect(reopened.json().translation.finalizedAt ?? null).toBeNull();
      const chapter = await db().query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
      expect(chapter).toMatchObject({ content: 'Ye Fan stood before the mountain gate.', locked: true });
    });

    it('should reschedule a published chapter only when re-finalizing moved the digest', async () => {
      const projectId = await createProject();
      await pushOriginal(projectId, 1, '第一章', ORIGINAL_ONE);
      await seedTranslation(projectId, 1, {});
      const finalize = () => testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/translation/chapters/1/finalize`);
      const reopen = () => testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/translation/chapters/1/reopen`);
      const ledgerRow = () => db().query.chapterPublications.findFirst({ where: eq(schema.chapterPublications.projectId, projectId) });
      await finalize();

      await db().insert(schema.chapterPublications).values({
        projectId,
        chapter: 1,
        publishedOrdinal: 4,
        title: 'Chapter 1',
        contentHash: 'digest-of-the-published-prose',
        revision: 1,
        status: 'published',
        error: 'a stale push failure',
      });

      await reopen();
      await testEnv.getRouter().mockRequest().put(`/api/v1/projects/${projectId}/translation/chapters/1`).body({ body: 'Evan Vale stood before the mountain gate.' });
      const moved = await finalize();
      expect(moved.json()).toMatchObject({ republished: true, publicationRevision: 2 });

      const rescheduled = await ledgerRow();
      expect(rescheduled).toMatchObject({ revision: 2, status: 'scheduled', error: null, publishedOrdinal: 4 });
      expect(rescheduled?.contentHash).not.toBe('digest-of-the-published-prose');

      await reopen();
      const unchanged = await finalize();
      expect(unchanged.json()).toMatchObject({ republished: false });
      expect(unchanged.json().publicationRevision).toBeUndefined();
      expect(await ledgerRow()).toMatchObject({ revision: 2, contentHash: rescheduled?.contentHash as string, updatedAt: rescheduled?.updatedAt as Date });
    });

    it('should reject a chapter with no translation row with TRN_008', async () => {
      const projectId = await createProject();
      await pushOriginal(projectId, 1, '第一章', ORIGINAL_ONE);
      const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/translation/chapters/1/finalize`);
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('TRN_008');
    });
  });

  describe('GET /api/v1/projects/:projectId/translation/chapters', () => {
    it('should paginate originals, count pending terms and filter on status and staleness', async () => {
      const projectId = await createProject();
      await pushOriginal(projectId, 1, '第一章', ORIGINAL_ONE);
      await pushOriginal(projectId, 2, '第二章', ORIGINAL_TWO);
      await pushOriginal(projectId, 3, '第三章', '第三章的正文，剑气纵横。');
      const termId = await seedTerm(projectId, '叶凡', 'Ye Fan');
      await seedTranslation(projectId, 1, { [termId.toString()]: 1 });
      await seedTranslation(projectId, 2, {}, 'A second chapter.');
      await db()
        .update(schema.chapterTranslations)
        .set({ sourceStale: true })
        .where(and(eq(schema.chapterTranslations.projectId, projectId), eq(schema.chapterTranslations.chapter, 2)));

      const all = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/translation/chapters`);
      expect(all.json()).toMatchObject({ total: 3, page: 1, limit: 50 });
      expect(all.json().items[0]).toMatchObject({ chapter: 1, originalTitle: '第一章', status: 'translated', pendingTerms: 1, issueCount: 0, glossaryStale: false });
      expect(all.json().items[2]).toMatchObject({ chapter: 3, pendingTerms: 0, revision: 0, glossaryStale: false, sourceStale: false });
      expect(all.json().items[2].status ?? null).toBeNull();

      const paged = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/translation/chapters?page=2&limit=2`);
      expect(paged.json().items.map((item: { chapter: number }) => item.chapter)).toEqual([3]);

      const stale = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/translation/chapters?stale=true`);
      expect(stale.json().items.map((item: { chapter: number }) => item.chapter)).toEqual([2]);

      const translated = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/translation/chapters?status=translated`);
      expect(translated.json().total).toBe(2);
    });

    it('should answer a chapter with no translation row with TRN_002', async () => {
      const projectId = await createProject();
      await pushOriginal(projectId, 1, '第一章', ORIGINAL_ONE);
      const response = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/translation/chapters/1`);
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('TRN_002');
    });
  });

  describe('POST /api/v1/projects/:projectId/translation', () => {
    it('should enqueue the translate job and return 202', async () => {
      const projectId = await createProject();
      const executor = testEnv.getService(JobExecutor);
      (executor as { dispatch: (jobId: string) => Promise<void> }).dispatch = async () => undefined;

      const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/translation`).body({ limit: 3, stale: true });
      expect(response.statusCode).toBe(202);
      expect(response.json().jobId).toMatch(TEST_REGEX.uuid);
      expect(response.json()).toMatchObject({ kind: 'translate', status: 'pending', target: `translate-${projectId}` });

      const rerun = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/translation/chapters/7`).body({});
      expect(rerun.statusCode).toBe(202);
      expect(rerun.json().target).toBe(`translate-${projectId}-ch-7`);
    });
  });

  describe('GET /api/v1/projects/:projectId/translation/manuscript', () => {
    it('should render finalized chapters ascending and list the rest as pending', async () => {
      const projectId = await createProject();
      await pushOriginal(projectId, 1, '第一章', ORIGINAL_ONE);
      await pushOriginal(projectId, 2, '第二章', ORIGINAL_TWO);
      await seedTranslation(projectId, 1, {}, 'The first chapter.');
      await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/translation/chapters/1/finalize`);

      const response = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/translation/manuscript`);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ markdown: '# Chapter 1\n\nThe first chapter.', pendingChapters: [2] });
    });
  });
});
