import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { ChapterImageService } from '@modules/generation/chapter-image.service';
import { GenerationService } from '@modules/generation/generation.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_delete_draft`;

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

describe.if(pgAvailable)('GenerationService.deleteDraft', () => {
  let db: PrimaryDatabase;
  let service: GenerationService;
  let chapterImages: ChapterImageService;
  const deleted: string[] = [];

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const noop = {} as never;
    // A real ChapterImageService (with an in-memory storage stub) so deleteDraft's scene-image purge and
    // renumber-shift run against the DB; `deleted` proves no storage object is dropped — refs are
    // content-addressed and may be shared, so row removal must never delete the underlying object.
    const imageStorage = {
      save: async () => '',
      read: async () => ({ bytes: new Uint8Array(), contentType: 'image/png' }),
      getPublicUrl: () => '',
      delete: async (ref: string) => void deleted.push(ref),
    };
    chapterImages = new ChapterImageService({ getPostgresClient: () => db } as never, imageStorage as never);
    service = new GenerationService({ getPostgresClient: () => db } as never, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, chapterImages);
  });

  async function seedChapters(bodies: string[]): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `delete-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    for (const [i, body] of bodies.entries()) {
      await db.insert(schema.drafts).values({ projectId: project.id, chapter: i + 1, body, status: 'draft', reviewStatus: 'needs_review' });
    }
    return project.id;
  }

  const chaptersOf = (projectId: bigint) =>
    db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), orderBy: asc(schema.drafts.chapter), columns: { chapter: true, body: true } });

  it('renumbers later chapters to stay contiguous when deleting one in the middle', async () => {
    const projectId = await seedChapters(['A', 'B', 'C', 'D']);

    await service.deleteDraft(projectId, 2);

    const rows = await chaptersOf(projectId);
    expect(rows.map(r => r.chapter)).toEqual([1, 2, 3]);
    expect(rows.map(r => r.body)).toEqual(['A', 'C', 'D']);
  });

  it('shifts the continuity review alongside its chapter', async () => {
    const projectId = await seedChapters(['A', 'B', 'C']);
    await db.insert(schema.continuityProposals).values({ projectId, chapter: 3, status: 'pending', proposal: { note: 'ch3' } as never });

    await service.deleteDraft(projectId, 1);

    const proposal = await db.query.continuityProposals.findFirst({ where: and(eq(schema.continuityProposals.projectId, projectId), eq(schema.continuityProposals.chapter, 2)) });
    expect(proposal?.proposal).toEqual({ note: 'ch3' } as never);
  });

  it('throws when the chapter does not exist', async () => {
    const projectId = await seedChapters(['A']);
    expect(service.deleteDraft(projectId, 9)).rejects.toThrow();
  });

  it('purges the deleted chapter’s scene images and shifts later chapters’ images down', async () => {
    deleted.length = 0;
    const projectId = await seedChapters(['A', 'B', 'C']);
    await db.insert(schema.chapterImages).values([
      { projectId, chapter: 2, imagePath: `${projectId}/ch2.png` },
      { projectId, chapter: 3, imagePath: `${projectId}/ch3.png` },
    ]);

    await service.deleteDraft(projectId, 2);

    // Storage objects are content-addressed and may be shared across rows, so no object delete happens;
    // only the DB rows are purged, and chapter 3's image follows its draft down to chapter 2.
    expect(deleted).toEqual([]);
    const rows = await chapterImages.list(projectId, 2);
    expect(rows.map(r => r.imagePath)).toEqual([`${projectId}/ch3.png`]);
    expect(await chapterImages.list(projectId, 3)).toHaveLength(0);
  });
});
