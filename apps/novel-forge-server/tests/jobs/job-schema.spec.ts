import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_job_schema`;

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

describe.if(pgAvailable)('job cancellation schema', () => {
  let db: PrimaryDatabase;
  let projectId: bigint;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `job-schema-${Date.now()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('should leave cancel_requested_at null on a fresh job', async () => {
    const [job] = await db.insert(schema.jobs).values({ projectId, kind: 'generate', target: 'chapter-1' }).returning();
    expect(job).toMatchObject({ status: 'pending', cancelRequestedAt: null });
  });

  it('should accept cancelled as a job status', async () => {
    const [job] = await db.insert(schema.jobs).values({ projectId, kind: 'generate', target: 'chapter-2', status: 'cancelled' }).returning();
    expect(job?.status).toBe('cancelled');
  });

  it('should record a cancellation request without moving the status', async () => {
    const [job] = await db.insert(schema.jobs).values({ projectId, kind: 'generate', target: 'chapter-3', status: 'in_progress' }).returning();
    if (!job) throw new Error('failed to seed job');

    const requestedAt = new Date();
    const [updated] = await db.update(schema.jobs).set({ cancelRequestedAt: requestedAt }).where(eq(schema.jobs.id, job.id)).returning();
    expect(updated).toMatchObject({ status: 'in_progress', cancelRequestedAt: requestedAt });
  });
});
