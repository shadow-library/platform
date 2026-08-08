import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';
import { and, asc, eq, gt } from 'drizzle-orm';

import { renderChapterPayload } from '@modules/publishing/publish-payload';
import * as schema from '@server/database/schemas';
import { TestEnvironment } from '@tests/test-environment';

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

const testEnv = new TestEnvironment('publishing_api');

describe('renderChapterPayload', () => {
  const chapter = { number: 4, title: '  The Vale Gate ', content: 'One two three.\n\nFour five.', note: 'thanks for reading', wordCount: null };

  it('should render exactly the reader-clean fields and nothing forge-internal', () => {
    const payload = renderChapterPayload(chapter);
    expect(Object.keys(payload).sort()).toEqual(['authorNote', 'content', 'contentHash', 'title', 'wordCount']);
    expect(payload).toMatchObject({ title: 'The Vale Gate', content: 'One two three.\n\nFour five.', authorNote: 'thanks for reading', wordCount: 5 });
  });

  it('should fall back to a numbered title and omit an empty author note', () => {
    const payload = renderChapterPayload({ ...chapter, title: null, note: '  ' });
    expect(payload.title).toBe('Chapter 4');
    expect('authorNote' in payload).toBe(false);
  });

  it('should keep the hash stable for unchanged prose and move it when prose changes', () => {
    expect(renderChapterPayload(chapter).contentHash).toBe(renderChapterPayload({ ...chapter, wordCount: 99 }).contentHash);
    expect(renderChapterPayload(chapter).contentHash).not.toBe(renderChapterPayload({ ...chapter, content: 'Different prose.' }).contentHash);
  });
});

describe.if(pgAvailable)('Publishing API', () => {
  testEnv.init();

  async function createProject(): Promise<string> {
    const response = await testEnv
      .getRouter()
      .mockRequest()
      .post('/api/v1/projects')
      .body({ name: `publishing-${Math.random()}`, kind: 'new_novel' });
    return response.json().id as string;
  }

  async function seedChapter(projectId: string, number: number, overrides: { locked?: boolean; content?: string; title?: string; note?: string } = {}): Promise<void> {
    const db = testEnv.getPostgresClient();
    await db.insert(schema.chapters).values({
      projectId: BigInt(projectId),
      number,
      title: overrides.title ?? `Chapter ${number} Title`,
      content: overrides.content ?? `Canonical prose of chapter ${number}.`,
      note: overrides.note,
      status: 'done',
      locked: overrides.locked ?? true,
    });
  }

  async function publishNovel(projectId: string, body: Record<string, unknown> = {}): Promise<Record<string, never>> {
    const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/publish`).body(body);
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  describe('POST /api/v1/projects/:projectId/publish', () => {
    it('should create a live publication with a derived slug and bump revision only on metadata change', async () => {
      const projectId = await createProject();
      const created = await publishNovel(projectId, { title: 'Ashes of Veldram!', blurb: 'A city of gates.' });
      expect(created).toMatchObject({ novelSlug: 'ashes-of-veldram', title: 'Ashes of Veldram!', blurb: 'A city of gates.', status: 'live', revision: 1 });

      const unchanged = await publishNovel(projectId, { blurb: 'A city of gates.' });
      expect(unchanged.revision).toBe(1);

      const updated = await publishNovel(projectId, { blurb: 'A city of gates and ash.', genres: ['fantasy'] });
      expect(updated).toMatchObject({ revision: 2, blurb: 'A city of gates and ash.', genres: ['fantasy'], novelSlug: 'ashes-of-veldram' });
    });

    it('should keep the slug immutable and support retiring the novel', async () => {
      const projectId = await createProject();
      await publishNovel(projectId, { novelSlug: 'first-slug', title: 'First' });
      const retired = await publishNovel(projectId, { novelSlug: 'second-slug', status: 'retired' });
      expect(retired).toMatchObject({ novelSlug: 'first-slug', status: 'retired', revision: 2 });
    });

    it('should 404 with PRJ_001 for an unknown project', async () => {
      const response = await testEnv.getRouter().mockRequest().post('/api/v1/projects/999999/publish').body({});
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('PRJ_001');
    });
  });

  describe('POST /api/v1/projects/:projectId/chapters/:chapter/publish', () => {
    it('should enforce the gate matrix: publication, chapter existence, finalization, and order', async () => {
      const projectId = await createProject();
      await seedChapter(projectId, 1);
      await seedChapter(projectId, 2, { locked: false });
      await seedChapter(projectId, 3);

      const noPublication = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/1/publish`).body({});
      expect(noPublication.statusCode).toBe(404);
      expect(noPublication.json().code).toBe('PUB_001');

      await publishNovel(projectId, { title: 'Gate Matrix' });

      const missing = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/9/publish`).body({});
      expect(missing.statusCode).toBe(404);
      expect(missing.json().code).toBe('CHP_001');

      const unfinalized = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/2/publish`).body({});
      expect(unfinalized.statusCode).toBe(400);
      expect(unfinalized.json().code).toBe('PUB_002');

      // Chapter 3 is finalized, but finalized chapter 1 is not ledgered yet — releases follow story order.
      const outOfOrder = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/3/publish`).body({});
      expect(outOfOrder.statusCode).toBe(400);
      expect(outOfOrder.json().code).toBe('PUB_003');

      const ok = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/1/publish`).body({});
      expect(ok.statusCode).toBe(202);
      expect(ok.json()).toMatchObject({ chapter: 1, publishedOrdinal: 1, status: 'scheduled', revision: 1 });
    });

    it('should assign ordinals once, bump revision only on content change, and store a schedule', async () => {
      const projectId = await createProject();
      await publishNovel(projectId, { title: 'Ordinals' });
      await seedChapter(projectId, 1, { note: 'author note' });
      await seedChapter(projectId, 2);

      const first = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/1/publish`).body({});
      expect(first.json()).toMatchObject({ publishedOrdinal: 1, revision: 1, authorNote: 'author note' });

      const scheduledAt = new Date(Date.now() + 3_600_000).toISOString();
      const second = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/2/publish`).body({ scheduledAt });
      expect(second.json()).toMatchObject({ publishedOrdinal: 2, status: 'scheduled' });
      expect(new Date(second.json().scheduledAt as string).toISOString()).toBe(scheduledAt);

      // Republish with unchanged prose: same ordinal, same revision, same hash.
      const unchanged = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/1/publish`).body({});
      expect(unchanged.json()).toMatchObject({ publishedOrdinal: 1, revision: 1, contentHash: first.json().contentHash });

      // The Wattpad rule: fix in the forge, republish — new hash, bumped revision, stable ordinal.
      const db = testEnv.getPostgresClient();
      await db
        .update(schema.chapters)
        .set({ content: 'Silently repaired prose.' })
        .where(and(eq(schema.chapters.projectId, BigInt(projectId)), eq(schema.chapters.number, 1)));
      const republished = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/1/publish`).body({});
      expect(republished.json()).toMatchObject({ publishedOrdinal: 1, revision: 2 });
      expect(republished.json().contentHash).not.toBe(first.json().contentHash);
    });

    it('should keep published ordinals stable when forge chapters renumber', async () => {
      const projectId = await createProject();
      await publishNovel(projectId, { title: 'Renumber' });
      for (const n of [1, 2, 3]) await seedChapter(projectId, n);
      for (const n of [1, 2, 3]) await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/${n}/publish`).body({});

      // Simulate a recombine-style renumber: chapter 1 absorbs its successor, later chapters shift down.
      const db = testEnv.getPostgresClient();
      const pid = BigInt(projectId);
      await db.delete(schema.chapters).where(and(eq(schema.chapters.projectId, pid), eq(schema.chapters.number, 2)));
      const later = await db
        .select({ number: schema.chapters.number })
        .from(schema.chapters)
        .where(and(eq(schema.chapters.projectId, pid), gt(schema.chapters.number, 2)))
        .orderBy(asc(schema.chapters.number));
      for (const row of later) {
        await db
          .update(schema.chapters)
          .set({ number: row.number - 1 })
          .where(and(eq(schema.chapters.projectId, pid), eq(schema.chapters.number, row.number)));
      }

      const ledger = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/publications`);
      expect(ledger.json().chapters.map((c: { publishedOrdinal: number }) => c.publishedOrdinal)).toEqual([1, 2, 3]);

      // Republishing renumbered chapter 2 (old chapter 3's prose) reuses its ledger row — no new ordinal.
      const republished = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/2/publish`).body({});
      expect(republished.json()).toMatchObject({ publishedOrdinal: 2, revision: 2 });
      const after = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/publications`);
      expect(after.json().chapters).toHaveLength(3);
    });
  });

  describe('DELETE /api/v1/projects/:projectId/chapters/:chapter/publish', () => {
    it('should stub a chapter, block publishes above the hole, and reuse the ordinal on republish', async () => {
      const projectId = await createProject();
      await publishNovel(projectId, { title: 'Stubbing' });
      for (const n of [1, 2, 3]) await seedChapter(projectId, n);
      for (const n of [1, 2]) await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/${n}/publish`).body({});

      const unpublished = await testEnv.getRouter().mockRequest().delete(`/api/v1/projects/${projectId}/chapters/2/publish`);
      expect(unpublished.statusCode).toBe(202);
      expect(unpublished.json()).toMatchObject({ chapter: 2, publishedOrdinal: 2, status: 'unpublished' });

      const blocked = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/3/publish`).body({});
      expect(blocked.statusCode).toBe(400);
      expect(blocked.json().code).toBe('PUB_003');

      const restored = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/2/publish`).body({});
      expect(restored.statusCode).toBe(202);
      expect(restored.json()).toMatchObject({ publishedOrdinal: 2, status: 'scheduled' });

      const third = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/3/publish`).body({});
      expect(third.json()).toMatchObject({ publishedOrdinal: 3 });
    });

    it('should 404 with PUB_001 when the chapter was never published', async () => {
      const projectId = await createProject();
      await publishNovel(projectId, { title: 'Nothing Yet' });
      const response = await testEnv.getRouter().mockRequest().delete(`/api/v1/projects/${projectId}/chapters/1/publish`);
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('PUB_001');
    });
  });

  describe('GET /api/v1/projects/:projectId/publications', () => {
    it('should return an empty ledger for an unpublished project and the full ledger after publishing', async () => {
      const projectId = await createProject();
      const empty = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/publications`);
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toEqual({ chapters: [] });

      await publishNovel(projectId, { title: 'Ledger View' });
      await seedChapter(projectId, 1);
      await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/1/publish`).body({});

      const full = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/publications`);
      expect(full.json().publication).toMatchObject({ novelSlug: 'ledger-view', status: 'live' });
      expect(full.json().chapters).toEqual([expect.objectContaining({ chapter: 1, publishedOrdinal: 1, status: 'scheduled' })]);
    });
  });
});
