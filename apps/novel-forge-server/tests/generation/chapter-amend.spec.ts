import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { chapterContentHash } from '@shadow-library/sdk/publishing';

import { ChapterAmendService } from '@modules/generation/chapter-amend.service';
import { decideAmendRepublish } from '@server/common';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_chapter_amend`;

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

describe('decideAmendRepublish', () => {
  it('should refuse to republish a chapter that was never published', () => {
    expect(decideAmendRepublish(null, 'hash-new')).toEqual({ republish: false, reason: 'never-published' });
  });

  it('should refuse to republish when the rendered hash has not moved', () => {
    expect(decideAmendRepublish({ revision: 3, contentHash: 'hash-old', status: 'published' }, 'hash-old')).toEqual({ republish: false, reason: 'unchanged' });
  });

  it('should leave a withdrawn publication withdrawn even when the hash moved', () => {
    expect(decideAmendRepublish({ revision: 3, contentHash: 'hash-old', status: 'unpublished' }, 'hash-new')).toEqual({ republish: false, reason: 'unpublished' });
  });

  it('should bump the revision when the hash moved on a live publication', () => {
    expect(decideAmendRepublish({ revision: 3, contentHash: 'hash-old', status: 'published' }, 'hash-new')).toEqual({ republish: true, revision: 4 });
    expect(decideAmendRepublish({ revision: 1, contentHash: 'hash-old', status: 'scheduled' }, 'hash-new')).toEqual({ republish: true, revision: 2 });
    expect(decideAmendRepublish({ revision: 7, contentHash: 'hash-old', status: 'failed' }, 'hash-new')).toEqual({ republish: true, revision: 8 });
  });
});

describe.if(pgAvailable)('ChapterAmendService.amend', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  function buildService(onAddProse?: () => Promise<void>): { service: ChapterAmendService; addProse: ReturnType<typeof mock>; deleteProse: ReturnType<typeof mock> } {
    const addProse = mock(onAddProse ?? (async () => undefined));
    const deleteProse = mock(async () => undefined);
    const service = new ChapterAmendService({ getPostgresClient: () => db } as never, { addProse, deleteProse } as never);
    return { service, addProse, deleteProse };
  }

  interface Fixture {
    status?: 'done' | 'failed';
    isolated?: boolean;
    draft?: 'final' | 'none';
    published?: 'published' | 'unpublished';
  }

  const PROSE = 'The coin never left his hand.';

  async function seed({ status = 'done', isolated = false, draft = 'final', published }: Fixture = {}): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `amend-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    const projectId = project.id;

    await db.insert(schema.chapters).values({
      projectId,
      number: 1,
      title: 'Old Title',
      content: PROSE,
      summary: 'He kept the coin.',
      wordCount: 6,
      status,
      isolated,
      locked: status === 'done',
      continuityApplied: true,
    });

    if (draft === 'final') {
      const [row] = await db.insert(schema.drafts).values({ projectId, chapter: 1, body: PROSE, status: 'final', reviewStatus: 'final', revision: 4 }).returning();
      if (!row) throw new Error('failed to seed draft');
      await db.insert(schema.draftRevisions).values({ projectId, draftId: row.id, revision: 4, source: 'generated', body: PROSE });
    }

    if (published) {
      await db.insert(schema.chapterPublications).values({
        projectId,
        chapter: 1,
        publishedOrdinal: 9,
        title: 'Old Title',
        contentHash: chapterContentHash({ title: 'Old Title', content: PROSE }),
        revision: 2,
        status: published,
      });
    }

    return projectId;
  }

  const chapterRow = (projectId: bigint) => db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
  const ledgerRow = (projectId: bigint) => db.query.chapterPublications.findFirst({ where: eq(schema.chapterPublications.projectId, projectId) });

  it('should refuse a chapter that is not finalized canon with CHP_006', async () => {
    const projectId = await seed({ status: 'failed' });
    const { service, addProse } = buildService();
    await expect(service.amend(projectId, 1, { content: 'new prose' })).rejects.toThrow(/not finalized canon/);
    expect(addProse).not.toHaveBeenCalled();
  });

  it('should refuse a chapter that does not exist', async () => {
    const projectId = await seed();
    const { service } = buildService();
    await expect(service.amend(projectId, 42, { content: 'new prose' })).rejects.toThrow(/Chapter not found/);
  });

  it('should write past the lock and leave the chapter locked', async () => {
    const projectId = await seed();
    const { service } = buildService();

    const result = await service.amend(projectId, 1, { content: 'He dropped the coin into the well.', title: 'New Title', note: 'fixed the coin' });

    const chapter = await chapterRow(projectId);
    expect(chapter?.content).toBe('He dropped the coin into the well.');
    expect(chapter?.title).toBe('New Title');
    expect(chapter?.note).toBe('fixed the coin');
    expect(chapter?.locked).toBe(true);
    expect(chapter?.status).toBe('done');
    expect(result.wordCount).toBe(7);
    expect(result.suggestExtractToBible).toBe(true);
  });

  it('should keep the stored title and note when they are omitted', async () => {
    const projectId = await seed();
    const { service } = buildService();

    await service.amend(projectId, 1, { content: 'Only the prose moved.' });

    const chapter = await chapterRow(projectId);
    expect(chapter?.title).toBe('Old Title');
    expect(chapter?.note).toBeNull();
  });

  it('should leave the bible-derived state untouched', async () => {
    const projectId = await seed();
    const { service } = buildService();

    await service.amend(projectId, 1, { content: 'A different sentence entirely.' });

    const chapter = await chapterRow(projectId);
    expect(chapter?.continuityApplied).toBe(true);
    expect(chapter?.needsRevalidation).toBe(false);
    expect(chapter?.summary).toBe('He kept the coin.');
  });

  it('should append an amended revision above every revision already filed', async () => {
    const projectId = await seed();
    const { service } = buildService();

    await service.amend(projectId, 1, { content: 'First amendment.' });
    await service.amend(projectId, 1, { content: 'Second amendment.' });

    const revisions = await db.query.draftRevisions.findMany({ where: eq(schema.draftRevisions.projectId, projectId), orderBy: asc(schema.draftRevisions.revision) });
    expect(revisions.map(r => [r.revision, r.source])).toEqual([
      [4, 'generated'],
      [5, 'amended'],
      [6, 'amended'],
    ]);
    expect(revisions.at(-1)?.body).toBe('Second amendment.');

    const draft = await db.query.drafts.findFirst({ where: eq(schema.drafts.projectId, projectId) });
    expect(draft?.status).toBe('final');
    expect(draft?.revision).toBe(4);
  });

  it('should amend a chapter whose draft row no longer exists', async () => {
    const projectId = await seed({ draft: 'none' });
    const { service } = buildService();

    await service.amend(projectId, 1, { content: 'Imported canon, corrected.' });

    const chapter = await chapterRow(projectId);
    expect(chapter?.content).toBe('Imported canon, corrected.');
    expect(await db.query.draftRevisions.findMany({ where: eq(schema.draftRevisions.projectId, projectId) })).toHaveLength(0);
  });

  it('should re-embed a non-isolated chapter', async () => {
    const projectId = await seed();
    const { service, addProse } = buildService();

    const result = await service.amend(projectId, 1, { content: 'Re-indexed prose.' });

    expect(addProse).toHaveBeenCalledWith(projectId, 1, 'Re-indexed prose.', false);
    expect(result.indexed).toBe(true);
  });

  it('should never index an isolated chapter', async () => {
    const projectId = await seed({ isolated: true });
    const { service, addProse } = buildService();

    const result = await service.amend(projectId, 1, { content: 'Firewalled prose.' });

    expect(addProse).toHaveBeenCalledWith(projectId, 1, 'Firewalled prose.', true);
    expect(result.indexed).toBe(false);
  });

  it('should keep the committed prose and drop the chunks when the re-embed fails', async () => {
    const projectId = await seed();
    const { service, deleteProse } = buildService(() => Promise.reject(new Error('embedding provider down')));

    const result = await service.amend(projectId, 1, { content: 'Committed despite the embedder.' });

    expect(result.indexed).toBe(false);
    expect(deleteProse).toHaveBeenCalledWith(projectId, 1);
    expect((await chapterRow(projectId))?.content).toBe('Committed despite the embedder.');
  });

  it('should bump the publication and reschedule it when the payload hash moves', async () => {
    const projectId = await seed({ published: 'published' });
    const { service } = buildService();

    const result = await service.amend(projectId, 1, { content: 'Reader-visible correction.' });

    const ledger = await ledgerRow(projectId);
    expect(result.republished).toBe(true);
    expect(result.publicationRevision).toBe(3);
    expect(ledger?.revision).toBe(3);
    expect(ledger?.status).toBe('scheduled');
    expect(ledger?.publishedOrdinal).toBe(9);
    expect(ledger?.contentHash).toBe(chapterContentHash({ title: 'Old Title', content: 'Reader-visible correction.' }));
  });

  it('should leave the publication alone when the payload hash does not move', async () => {
    const projectId = await seed({ published: 'published' });
    const { service } = buildService();

    const result = await service.amend(projectId, 1, { content: PROSE });

    const ledger = await ledgerRow(projectId);
    expect(result.republished).toBe(false);
    expect(result.publicationRevision).toBeUndefined();
    expect(ledger?.revision).toBe(2);
    expect(ledger?.status).toBe('published');
    expect(ledger?.publishedOrdinal).toBe(9);
  });

  // The rating is inside chapterContentHash, so a rating-only amend is reader-visible: a chapter whose
  // rating rose must reach the reader before the prose it warns about does.
  it('should republish when a rating change is all that moves the payload hash', async () => {
    const projectId = await seed({ published: 'published' });
    const { service } = buildService();

    const result = await service.amend(projectId, 1, { content: PROSE, contentRating: { violence: 'graphic' } });

    const ledger = await ledgerRow(projectId);
    expect(result.republished).toBe(true);
    expect(ledger?.revision).toBe(3);
    expect(ledger?.status).toBe('scheduled');
    expect(ledger?.contentHash).toBe(chapterContentHash({ title: 'Old Title', content: PROSE, contentRating: { violence: 'graphic' } }));
    expect((await chapterRow(projectId))?.contentRating).toEqual({ violence: 'graphic' });
  });

  it('should never resurrect a withdrawn publication', async () => {
    const projectId = await seed({ published: 'unpublished' });
    const { service } = buildService();

    const result = await service.amend(projectId, 1, { content: 'Amended after withdrawal.' });

    const ledger = await ledgerRow(projectId);
    expect(result.republished).toBe(false);
    expect(ledger?.status).toBe('unpublished');
    expect(ledger?.revision).toBe(2);
    expect(ledger?.publishedOrdinal).toBe(9);
  });
});
