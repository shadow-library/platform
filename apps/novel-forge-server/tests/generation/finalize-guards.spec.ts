/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';
import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { GenerationService } from '@modules/generation/generation.service';
import { createDatabaseFromTemplate } from '@scripts/create-template-db';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_finalize_guards`;

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
    return err instanceof AppError ? err.getCode() : String(err);
  }
}

describe.if(pgAvailable)('GenerationService.finalize consistency guards', () => {
  let db: PrimaryDatabase;

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());
  let service: GenerationService;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const noop = {} as never;
    service = new GenerationService({ getPostgresClient: () => db } as never, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop);
  });

  async function createProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `fin-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  it('blocks finalizing chapter N when an earlier chapter needs re-validation (FIN_002)', async () => {
    const projectId = await createProject();
    // Chapter 1 finalized but invalidated by a later canon change; drafts 1 (final) and 2 (approved).
    await db.insert(schema.chapters).values({ projectId, number: 1, content: 'ch1', status: 'done', locked: true, needsRevalidation: true });
    await db.insert(schema.drafts).values({ projectId, chapter: 1, body: 'd1', status: 'final', reviewStatus: 'final' });
    await db.insert(schema.drafts).values({ projectId, chapter: 2, body: 'd2', status: 'draft', reviewStatus: 'approved' });

    expect(await codeOf(service.finalize(projectId, { chapter: 2 }))).toBe('FIN_002');
  });

  it('blocks finalizing a chapter with an unresolved validation error for it (FIN_003)', async () => {
    const projectId = await createProject();
    await db.insert(schema.drafts).values({ projectId, chapter: 1, body: 'd1', status: 'draft', reviewStatus: 'approved' });
    await db.insert(schema.validationReports).values({
      projectId,
      scope: 'novel',
      chapter: null,
      issues: 1,
      summary: 'has an error',
      payload: { issues: [{ chapter: 1, severity: 'error', description: 'timeline conflict' }], summary: 'has an error' },
    });

    expect(await codeOf(service.finalize(projectId, { chapter: 1 }))).toBe('FIN_003');
  });
});
