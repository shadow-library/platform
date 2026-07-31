/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';
import { asc, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { JobExecutor } from '@modules/jobs/job.executor';
import { type NovelBundle } from '@modules/novel-import/novel-import.dto';
import * as schema from '@server/database/schemas';
import { TestEnvironment } from '@tests/test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

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

const testEnv = new TestEnvironment('novel_import_api');

function finalBundle(title: string): NovelBundle {
  return {
    format: 'novel-import',
    schemaVersion: 1,
    mode: 'final',
    novel: { title, synopsis: 'A retired lighthouse keeper strikes a bargain with the tide.', tags: ['fantasy'], cover: 'front' },
    volumes: [
      {
        ordinal: 1,
        title: 'The Quiet Coast',
        chapters: [
          { title: 'The Last Watch', content: 'Mira climbed the spiral stair for what she told herself was the last time.' },
          { title: 'A Voice in the Foam', content: 'The voice came again with the seventh wave, the way it always did.' },
        ],
      },
      { ordinal: 2, title: 'What the Tide Keeps', chapters: [{ title: 'The Debt', content: 'It wanted the lamp, not the light it cast, but the fire itself.' }] },
    ],
    assets: [{ name: 'front', mimeType: 'image/jpeg', dataBase64: Buffer.from('fake-cover-bytes').toString('base64') }],
  };
}

function sourceBundle(title: string): NovelBundle {
  return {
    format: 'novel-import',
    schemaVersion: 1,
    mode: 'source',
    novel: { title, synopsis: 'Two translator-split parts and one clean chapter.' },
    volumes: [
      {
        ordinal: 1,
        chapters: [
          { title: 'Old Ways (1/2)', content: 'Part one of the old ways.' },
          { title: 'Old Ways (2/2)', content: 'Part two of the old ways.' },
        ],
      },
      { ordinal: 2, chapters: [{ title: 'New Dawn', content: 'A fresh start.' }] },
    ],
  };
}

describe.if(pgAvailable)('POST /api/v1/import', () => {
  testEnv.init();

  // Neutralizes the controller's own fire-and-forget dispatch (like rebrand.controller.spec.ts) so the
  // job never races the explicit, awaited dispatch below — then runs it for real and restores the
  // original method so later tests in this file keep their normal dispatch behavior.
  async function importAndRun(bundle: NovelBundle): Promise<{ projectId: string; jobId: string }> {
    const executor = testEnv.getService(JobExecutor);
    const realDispatch = executor.dispatch.bind(executor);
    (executor as unknown as { dispatch: typeof executor.dispatch }).dispatch = async () => undefined;
    try {
      const response = await testEnv.getRouter().mockRequest().post('/api/v1/import').body({ bundle });
      expect(response.statusCode).toBe(202);
      const body = response.json() as { projectId: string; jobId: string };
      await realDispatch(body.jobId);
      return body;
    } finally {
      (executor as unknown as { dispatch: typeof executor.dispatch }).dispatch = realDispatch;
    }
  }

  async function countProjectsNamed(title: string): Promise<number> {
    return testEnv.getPostgresClient().$count(schema.projects, eq(schema.projects.title, title));
  }

  it('should reject a structurally invalid bundle (bad envelope literal) with 422 field errors and create nothing', async () => {
    const bundle = { ...finalBundle('Never Created — Bad Envelope'), format: 'something-else' };
    const response = await testEnv.getRouter().mockRequest().post('/api/v1/import').body({ bundle });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('VALIDATION_ERROR');
    expect((response.json().fields as unknown[]).length).toBeGreaterThan(0);
    expect(await countProjectsNamed('Never Created — Bad Envelope')).toBe(0);
  });

  it('should reject a cross-item invalid bundle (non-contiguous ordinals) with 422 field errors and create nothing', async () => {
    const bundle = finalBundle('Never Created — Bad Ordinals');
    bundle.volumes[1]!.ordinal = 5;
    const response = await testEnv.getRouter().mockRequest().post('/api/v1/import').body({ bundle });
    expect(response.statusCode).toBe(422);
    expect(response.json().fields).toEqual([{ field: 'volumes', msg: 'volume ordinals must be unique and contiguous starting at 1' }]);
    expect(await countProjectsNamed('Never Created — Bad Ordinals')).toBe(0);
  });

  it('should reject an over-column-length title with a clean 422 (not a 500 from the DB insert)', async () => {
    const bundle = finalBundle('Never Created — Oversized Title');
    bundle.novel.title = 'x'.repeat(300); // valid prose length, but over projects.name's varchar(255)
    const response = await testEnv.getRouter().mockRequest().post('/api/v1/import').body({ bundle });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('VALIDATION_ERROR');
    expect(await countProjectsNamed('x'.repeat(300))).toBe(0);
  });

  it('should reject an over-column-length chapter title with a clean 422', async () => {
    const bundle = finalBundle('Never Created — Oversized Chapter Title');
    bundle.volumes[0]!.chapters[0]!.title = 'y'.repeat(501); // over chapters.title's varchar(500)
    const response = await testEnv.getRouter().mockRequest().post('/api/v1/import').body({ bundle });
    expect(response.statusCode).toBe(422);
    expect(await countProjectsNamed('Never Created — Oversized Chapter Title')).toBe(0);
  });

  it('should import a final-mode bundle, run the job to completion, and land locked human chapters ready to publish', async () => {
    const { projectId, jobId } = await importAndRun(finalBundle('The Lantern Keeper (final)'));

    const job = await testEnv.getRouter().mockRequest().get(`/api/v1/jobs/${jobId}`);
    expect(job.json()).toMatchObject({ kind: 'import', status: 'done' });

    const db = testEnv.getPostgresClient();
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, BigInt(projectId)) });
    expect(project).toMatchObject({ kind: 'new_novel', name: 'The Lantern Keeper (final)', brief: 'A retired lighthouse keeper strikes a bargain with the tide.' });
    expect(project?.themes).toEqual(['fantasy']);
    expect(project?.coverImagePath).toBe(`${projectId}/cover.jpg`);

    // new_novel projects are seeded with contentless <section>/default placeholder bible docs, exactly
    // like a project created through POST /api/v1/projects.
    const bibleDocs = await db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, BigInt(projectId)) });
    expect(bibleDocs).toHaveLength(schema.bibleSection.enumValues.length);
    expect(bibleDocs.every(d => d.slug === 'default')).toBe(true);

    const chapters = await db.query.chapters.findMany({ where: eq(schema.chapters.projectId, BigInt(projectId)), orderBy: asc(schema.chapters.number) });
    expect(chapters.map(c => [c.number, c.title, c.status, c.locked, c.generator])).toEqual([
      [1, 'The Last Watch', 'done', true, 'human'],
      [2, 'A Voice in the Foam', 'done', true, 'human'],
      [3, 'The Debt', 'done', true, 'human'],
    ]);

    // Cover round-trips through the same storage path a normal cover upload uses.
    const image = await testEnv.getRouter().mockRequest().get(`/api/v1/images/${projectId}/cover.jpg`);
    expect(image.statusCode).toBe(200);
    expect(Buffer.from(image.body as string).toString()).toBe('fake-cover-bytes');

    // Publishable from chapter 1: locked, non-empty content, contiguous numbering satisfy PUB_002/PUB_003.
    const publish = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/publish`).body({ title: 'The Lantern Keeper' });
    expect(publish.statusCode).toBe(200);
    for (const n of [1, 2, 3]) {
      const scheduled = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/${n}/publish`).body({});
      expect(scheduled.statusCode).toBe(202);
    }
  });

  it('should never echo the bundle prose/cover back through the jobs endpoints, and compact the stored payload on success', async () => {
    const { projectId, jobId } = await importAndRun(finalBundle('Redacted On The Wire'));

    const byId = await testEnv.getRouter().mockRequest().get(`/api/v1/jobs/${jobId}`);
    expect(byId.statusCode).toBe(200);
    expect(byId.json().payload).toEqual({ chapters: 3, hasCover: true });
    expect(JSON.stringify(byId.json())).not.toContain('Mira climbed');
    expect(JSON.stringify(byId.json())).not.toContain('fake-cover-bytes');

    const listed = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/jobs`);
    expect(listed.statusCode).toBe(200);
    const importJob = (listed.json().items as { kind: string; payload: unknown }[]).find(j => j.kind === 'import');
    expect(importJob?.payload).toEqual({ chapters: 3, hasCover: true });

    // Not just redacted on the wire — the stored row itself is compacted, so it never sits there at
    // full size either.
    const row = await testEnv.getPostgresClient().query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(row?.payload).toEqual({ chapters: 3, hasCover: true });
  });

  it('should import a source-mode bundle, run auto-recombine for real, land unlocked default-generator chapters, and allow enqueuing extract', async () => {
    const { projectId, jobId } = await importAndRun(sourceBundle('Old Ways (source)'));

    const job = await testEnv.getRouter().mockRequest().get(`/api/v1/jobs/${jobId}`);
    expect(job.json()).toMatchObject({ kind: 'import', status: 'done' });

    const db = testEnv.getPostgresClient();
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, BigInt(projectId)) });
    expect(project?.kind).toBe('source');

    // Three bundle chapters went in, but "Old Ways (1/2)" + "Old Ways (2/2)" auto-recombine into one —
    // proof the hook actually ran (not just that it didn't error).
    const chapters = await db.query.chapters.findMany({ where: eq(schema.chapters.projectId, BigInt(projectId)), orderBy: asc(schema.chapters.number) });
    expect(chapters).toHaveLength(2);
    expect(chapters[0]).toMatchObject({ number: 1, title: 'Old Ways', locked: false, generator: 'standard' });
    expect(chapters[0]?.mergedFrom).toHaveLength(2);
    expect(chapters[1]).toMatchObject({ number: 2, title: 'New Dawn', locked: false, generator: 'standard' });

    // The rest of the source pipeline treats it like any other source project: extract enqueues.
    const executor = testEnv.getService(JobExecutor);
    const realDispatch = executor.dispatch.bind(executor);
    (executor as unknown as { dispatch: typeof executor.dispatch }).dispatch = async () => undefined;
    try {
      const extract = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/extract`).body({});
      expect(extract.statusCode).toBe(202);
      expect(extract.json()).toMatchObject({ kind: 'extract', status: 'pending' });
    } finally {
      (executor as unknown as { dispatch: typeof executor.dispatch }).dispatch = realDispatch;
    }
  });
});
