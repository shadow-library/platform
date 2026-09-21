import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { noPluginProposals } from '@tests/fixtures/plugin-policy';
import { GenerationService } from '@modules/generation/generation.service';
import { type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_drafts_summary`;

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

describe.if(pgAvailable)('GenerationService.listDraftSummaries', () => {
  let db: PrimaryDatabase;
  let service: GenerationService;
  let projectId: bigint;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const noop = {} as never;
    service = new GenerationService({ getPostgresClient: () => db } as never, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noPluginProposals());

    const [project, other] = await db
      .insert(schema.projects)
      .values([
        { name: `drafts-summary-${Date.now()}`, kind: 'new_novel', premise: 'a cartographer maps a city that rearranges itself nightly' },
        { name: `drafts-summary-other-${Date.now()}`, kind: 'new_novel', premise: 'unrelated' },
      ])
      .returning();
    if (!project || !other) throw new Error('failed to seed projects');
    projectId = project.id;

    await db.insert(schema.drafts).values([
      {
        projectId,
        chapter: 2,
        title: 'The Moving Street',
        body: '  The street\nhad moved\tagain overnight.  ',
        status: 'draft',
        reviewStatus: 'needs_review',
        staleReason: 'ancestor chapter 1 was revised',
      },
      { projectId, chapter: 1, title: 'Ink', body: 'Mara inked the last alley.', status: 'final', reviewStatus: 'approved', judge: 'consistent', isolated: true },
      { projectId, chapter: 3, body: '', status: 'draft' },
      { projectId: other.id, chapter: 1, body: 'Not this project.', status: 'draft' },
    ]);
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('should list this project’s drafts in chapter order without their bodies', async () => {
    const items = await service.listDraftSummaries(projectId);

    expect(items.map(item => item.chapter)).toEqual([1, 2, 3]);
    for (const item of items) expect(item).not.toHaveProperty('body');
  });

  it('should report status, review state and flags', async () => {
    const [first, second, third] = await service.listDraftSummaries(projectId);

    expect(first).toMatchObject({ title: 'Ink', status: 'final', reviewStatus: 'approved', judge: 'consistent', isolated: true, stale: false });
    expect(second).toMatchObject({ status: 'draft', reviewStatus: 'needs_review', isolated: false, stale: true });
    expect(third).toMatchObject({ title: null, stale: false });
    expect(first?.updatedAt).toBeInstanceOf(Date);
  });

  it('should date the prose by its latest revision, not by judge or stale updates', async () => {
    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 3)) });
    if (!draft) throw new Error('missing draft');
    const written = new Date('2031-04-05T06:07:08.000Z');
    await db.insert(schema.draftRevisions).values({ projectId, draftId: draft.id, revision: 0, source: 'generated', body: '', createdAt: written });
    await db
      .update(schema.drafts)
      .set({ judge: 'consistent', updatedAt: new Date('2032-01-01T00:00:00.000Z') })
      .where(eq(schema.drafts.id, draft.id));

    const [first, , third] = await service.listDraftSummaries(projectId);

    expect(third?.writtenAt).toEqual(written);
    expect(first?.writtenAt).toBeInstanceOf(Date);
  });
});
