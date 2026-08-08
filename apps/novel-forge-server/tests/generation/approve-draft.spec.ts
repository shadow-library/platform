import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { GenerationService } from '@modules/generation/generation.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_approve_draft`;

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

describe.if(pgAvailable)('GenerationService.approveDraft', () => {
  let db: PrimaryDatabase;

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());
  let service: GenerationService;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    // approveDraft only touches the db client; the other injected services are unused for this path.
    const noop = {} as never;
    service = new GenerationService({ getPostgresClient: () => db } as never, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop);
  });

  async function seedDraft(chapter: number): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `approve-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.drafts).values({ projectId: project.id, chapter, body: 'prose', status: 'draft', reviewStatus: 'needs_review' });
    return project.id;
  }

  it('approves the draft and logs one feedback row atomically', async () => {
    const projectId = await seedDraft(1);

    const draft = await service.approveDraft(projectId, 1, { reviewerId: 'editor-1', idempotencyKey: `${projectId}-approve-1` });
    expect(draft.reviewStatus).toBe('approved');

    const feedback = await db.query.userFeedback.findMany({ where: eq(schema.userFeedback.projectId, projectId) });
    expect(feedback).toHaveLength(1);
    expect(feedback[0]?.reviewerId).toBe('editor-1');
    expect(feedback[0]?.disposition).toBe('approved');
  });

  it('is idempotent: a retried approve with the same key does not duplicate the approval', async () => {
    const projectId = await seedDraft(1);
    const key = `${projectId}-approve-1`;

    await service.approveDraft(projectId, 1, { idempotencyKey: key });
    const draft = await service.approveDraft(projectId, 1, { idempotencyKey: key });

    expect(draft.reviewStatus).toBe('approved');
    const feedback = await db.query.userFeedback.findMany({ where: eq(schema.userFeedback.projectId, projectId) });
    expect(feedback).toHaveLength(1);
  });

  it('records a distinct approval when a different idempotency key is used', async () => {
    const projectId = await seedDraft(1);

    await service.approveDraft(projectId, 1, { idempotencyKey: `${projectId}-a` });
    await service.approveDraft(projectId, 1, { idempotencyKey: `${projectId}-b` });

    const feedback = await db.query.userFeedback.findMany({ where: eq(schema.userFeedback.projectId, projectId) });
    expect(feedback).toHaveLength(2);
  });
});
