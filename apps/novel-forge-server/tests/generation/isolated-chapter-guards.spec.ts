import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';
import { AppError } from '@shadow-library/common';

import { noPluginPolicy, noPluginProposals } from '@tests/fixtures/plugin-policy';
import { GenerationService } from '@modules/generation/generation.service';
import { ProposalService } from '@modules/refinement/proposal.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_isolated_chapter_guards`;

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

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (err) {
    return err instanceof AppError ? err.code : String(err);
  }
}

describe.if(pgAvailable)('GenerationService — isolated chapter containment (proposeContinuity / extractChapterToBible)', () => {
  let db: PrimaryDatabase;
  let service: GenerationService;
  let structured: ReturnType<typeof mock>;
  let forChapter: ReturnType<typeof mock>;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db } as never;
    structured = mock(async () => ({ entities: [], relationships: [], beats: [], plotThreads: [], worldFacts: [], mysteries: [], chapterSummary: 'summary' }));
    forChapter = mock(async () => ({ rendered: 'PACK', id: null }));
    const modelRouter = { structured, resolveFor: async () => ({ model: 'test-model' }) } as never;
    const contextAssembler = { forChapter } as never;
    const proposalService = new ProposalService(databaseService);
    const noop = {} as never;
    service = new GenerationService(
      databaseService,
      noop,
      modelRouter,
      contextAssembler,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      proposalService,
      noop,
      noPluginPolicy(),
      noPluginProposals(),
    );
  });

  async function seedDraft(isolated: boolean): Promise<{ projectId: bigint }> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `iso-guard-${isolated}-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.drafts).values({ projectId: project.id, chapter: 1, body: 'Chapter one prose.', status: 'draft', reviewStatus: 'needs_review', isolated });
    return { projectId: project.id };
  }

  it('should refuse proposeContinuity for an isolated draft (DRF_008)', async () => {
    const { projectId } = await seedDraft(true);
    expect(await codeOf(service.proposeContinuity(projectId, 1))).toBe('DRF_008');
    expect(forChapter).not.toHaveBeenCalled();
    expect(structured).not.toHaveBeenCalled();
  });

  it('should refuse extractChapterToBible for an isolated draft (DRF_008)', async () => {
    const { projectId } = await seedDraft(true);
    expect(await codeOf(service.extractChapterToBible(projectId, 1))).toBe('DRF_008');
    expect(forChapter).not.toHaveBeenCalled();
    expect(structured).not.toHaveBeenCalled();
  });

  it('should still allow proposeContinuity for a non-isolated draft', async () => {
    const { projectId } = await seedDraft(false);
    expect(await codeOf(service.proposeContinuity(projectId, 1))).toBe('NO_ERROR');
    expect(structured).toHaveBeenCalled();
  });
});
