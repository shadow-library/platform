import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { AppError } from '@shadow-library/common';

import { GenerationService } from '@modules/generation/generation.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { noPluginPolicy, noPluginProposals } from '@tests/fixtures/plugin-policy';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_generate_contradiction_gate`;

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

describe.if(pgAvailable)('GenerationService.generate — contradiction gate', () => {
  let db: PrimaryDatabase;
  let service: GenerationService;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db } as never;
    const noop = {} as never;
    const jobService = { enqueue: async () => 'job-1' } as never;
    const jobExecutor = { dispatch: async () => undefined } as never;
    service = new GenerationService(databaseService, noop, noop, noop, noop, noop, noop, noop, jobService, jobExecutor, noop, noop, noPluginPolicy(), noPluginProposals());
  });

  async function createProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `gen-gate-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.volumes).values({ projectId: project.id, volumeKey: 'v1', ordinal: 1, targetChapterCount: 5, status: 'approved' });
    return project.id;
  }

  it('should refuse to draft further chapters while any draft sits in contradiction, even with autoFix requested', async () => {
    const projectId = await createProject();
    await db.insert(schema.briefs).values([
      { projectId, chapter: 1, volumeKey: 'v1', body: 'brief one' },
      { projectId, chapter: 2, volumeKey: 'v1', body: 'brief two' },
    ]);
    await db.insert(schema.drafts).values({ projectId, chapter: 1, body: 'draft one', status: 'draft', reviewStatus: 'contradiction' });

    // autoFix only governs the repair ladder inside the job that drafts a chapter — it can never reach
    // back into a contradiction a prior job already left behind, so it must not bypass this gate either.
    expect(await codeOf(service.generate(projectId, {}))).toBe('DRF_003');
    expect(await codeOf(service.generate(projectId, { autoFix: true }))).toBe('DRF_003');
  });

  it('should draft the next chapter again once the contradicted draft is resolved', async () => {
    const projectId = await createProject();
    await db.insert(schema.briefs).values([
      { projectId, chapter: 1, volumeKey: 'v1', body: 'brief one' },
      { projectId, chapter: 2, volumeKey: 'v1', body: 'brief two' },
    ]);
    await db.insert(schema.drafts).values({ projectId, chapter: 1, body: 'draft one', status: 'draft', reviewStatus: 'contradiction' });

    expect(await codeOf(service.generate(projectId, { autoFix: true }))).toBe('DRF_003');

    // Mirrors what the "repair" recovery action does: a revision moves the draft out of contradiction
    // without ever re-entering the judge loop.
    await db
      .update(schema.drafts)
      .set({ reviewStatus: 'needs_review' })
      .where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)));

    expect(await codeOf(service.generate(projectId, { autoFix: true }))).toBe('NO_ERROR');
  });

  it('should draft the next chapter again once the contradicted draft is deleted (regenerate)', async () => {
    const projectId = await createProject();
    await db.insert(schema.briefs).values({ projectId, chapter: 1, volumeKey: 'v1', body: 'brief one' });
    await db.insert(schema.drafts).values({ projectId, chapter: 1, body: 'draft one', status: 'draft', reviewStatus: 'contradiction' });

    expect(await codeOf(service.generate(projectId, {}))).toBe('DRF_003');

    // Mirrors what the "regenerate" recovery action does: delete the contradicted draft so it is no
    // longer the started-but-unresolved chapter, then draft it again.
    await db.delete(schema.drafts).where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)));

    expect(await codeOf(service.generate(projectId, { autoFix: true }))).toBe('NO_ERROR');
  });
});
