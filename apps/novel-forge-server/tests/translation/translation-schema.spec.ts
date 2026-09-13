import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import fs from 'node:fs';
import path from 'node:path';

import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_translation_schema`;

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

// Drizzle wraps constraint violations in a "Failed query" error; the violated constraint's name only
// appears on the underlying driver error in `cause`.
async function violatedConstraint(query: Promise<unknown>): Promise<string> {
  const error = await query.then(
    () => null,
    (e: Error) => e,
  );
  if (!error) throw new Error('expected query to be rejected');
  return String(error.cause ?? error.message);
}

describe('translation migration', () => {
  const migrationsDir = path.join(import.meta.dir, '../../generated/drizzle');
  const migrationSql = fs
    .readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .map(file => fs.readFileSync(path.join(migrationsDir, file), 'utf-8'))
    .join('\n');

  it('should add the translate job kind without recreating job_kind', () => {
    expect(migrationSql).toContain(`ALTER TYPE "public"."job_kind" ADD VALUE 'translate'`);
  });

  // project_kind cannot use ADD VALUE: drizzle applies every pending migration in one transaction and the
  // curated backfill has to read the value back, which Postgres refuses until that transaction commits.
  it('should extend project_kind in a form the same transaction can use', () => {
    expect(migrationSql).toContain(`CREATE TYPE "public"."project_kind" AS ENUM('source', 'new_novel', 'translation', 'curated')`);
    expect(migrationSql).toContain(`ALTER TABLE "projects" ALTER COLUMN "kind" SET DATA TYPE "public"."project_kind"`);
  });

  it('should backfill curated-ingest projects to the curated kind', () => {
    expect(migrationSql).toContain(`UPDATE "projects" SET "kind" = 'curated' WHERE "source_ref" IS NOT NULL;`);
  });
});

describe.if(pgAvailable)('translation schemas', () => {
  let db: PrimaryDatabase;
  let projectId: bigint;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `translation-${Date.now()}`, kind: 'translation', originalLanguage: 'zh' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('should accept the translation and curated project kinds and the translate job kind', async () => {
    const [curated] = await db
      .insert(schema.projects)
      .values({ name: `curated-${Date.now()}`, kind: 'curated' })
      .returning();
    expect(curated).toMatchObject({ kind: 'curated', originalLanguage: null });

    const [job] = await db
      .insert(schema.jobs)
      .values({ projectId, kind: 'translate', target: `translate-${projectId}` })
      .returning();
    expect(job).toMatchObject({ kind: 'translate', status: 'pending' });
  });

  it('should keep the original prose beside a still-untranslated chapter', async () => {
    const [chapter] = await db
      .insert(schema.chapters)
      .values({ projectId, number: 1, status: 'done', generator: 'human', originalTitle: '第一章 开端', originalContent: '叶凡走进了古路。' })
      .returning();
    expect(chapter).toMatchObject({ title: null, content: null, originalTitle: '第一章 开端', originalContent: '叶凡走进了古路。', locked: false });
  });

  it('should default translation columns and enforce one translation per project', async () => {
    const [translation] = await db.insert(schema.translations).values({ projectId }).returning();
    expect(translation).toMatchObject({ phase: 'pending', styleNotes: null, settings: null, lastError: null });

    const duplicate = db.insert(schema.translations).values({ projectId }).execute();
    expect(await violatedConstraint(duplicate)).toMatch(/translations_project_id_unique/);
  });

  it('should default a glossary entry to a suggested first revision and reject a duplicate source term', async () => {
    const entry = { projectId, sourceTerm: '叶凡', target: 'Ye Fan', category: 'character' as const, treatment: 'transliterate' as const, origin: 'seed' as const };
    const [row] = await db
      .insert(schema.translationGlossary)
      .values({ ...entry, variants: ['小叶'], alternatives: [{ target: 'Leaf Fan', rationale: 'literal reading' }] })
      .returning();
    expect(row).toMatchObject({ status: 'suggested', revision: 1, decidedAt: null, variants: ['小叶'], alternatives: [{ target: 'Leaf Fan', rationale: 'literal reading' }] });

    const duplicate = db
      .insert(schema.translationGlossary)
      .values({ ...entry, target: 'Yefan' })
      .execute();
    expect(await violatedConstraint(duplicate)).toMatch(/translation_glossary_project_id_source_term_unique/);
  });

  it('should upsert a chapter translation by chapter and bump its revision', async () => {
    const [first] = await db
      .insert(schema.chapterTranslations)
      .values({
        projectId,
        chapter: 1,
        title: 'The Ancient Road',
        body: 'Ye Fan stepped onto the ancient road.',
        status: 'translated',
        appliedTerms: { '1': 1 },
        sourceHash: 'a'.repeat(64),
      })
      .returning();
    expect(first).toMatchObject({ revision: 1, glossaryStale: false, sourceStale: false, issues: null, segments: null, editedAt: null, finalizedAt: null });

    const [second] = await db
      .insert(schema.chapterTranslations)
      .values({
        projectId,
        chapter: 1,
        title: 'The Ancient Road',
        body: 'Ye Fan walked the ancient road.',
        status: 'attention',
        issues: [{ source: 'fidelity', type: 'number_drift', detail: '3000 missing from the translation' }],
      })
      .onConflictDoUpdate({
        target: [schema.chapterTranslations.projectId, schema.chapterTranslations.chapter],
        set: {
          body: sql`excluded.body`,
          status: sql`excluded.status`,
          issues: sql`excluded.issues`,
          revision: sql`${schema.chapterTranslations.revision} + 1`,
        },
      })
      .returning();
    expect(second).toMatchObject({ id: first?.id, revision: 2, status: 'attention', body: 'Ye Fan walked the ancient road.' });
  });

  it('should mark dependents stale through the applied-terms index', async () => {
    await db
      .update(schema.chapterTranslations)
      .set({ glossaryStale: true })
      .where(sql`${schema.chapterTranslations.projectId} = ${projectId} AND jsonb_exists(${schema.chapterTranslations.appliedTerms}, '1')`);

    const [row] = await db.select().from(schema.chapterTranslations).where(eq(schema.chapterTranslations.projectId, projectId));
    expect(row).toMatchObject({ glossaryStale: true });
  });

  it('should cascade translation rows when the project is deleted', async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `translation-cascade-${Date.now()}`, kind: 'translation', originalLanguage: 'ko' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.translations).values({ projectId: project.id });
    await db
      .insert(schema.translationGlossary)
      .values({ projectId: project.id, sourceTerm: '무림', target: 'Murim', category: 'organization', treatment: 'preserve', origin: 'manual' });
    await db.insert(schema.chapterTranslations).values({ projectId: project.id, chapter: 1, body: '', status: 'failed' });

    await db.delete(schema.projects).where(eq(schema.projects.id, project.id));

    expect(await db.select().from(schema.translations).where(eq(schema.translations.projectId, project.id))).toHaveLength(0);
    expect(await db.select().from(schema.translationGlossary).where(eq(schema.translationGlossary.projectId, project.id))).toHaveLength(0);
    expect(await db.select().from(schema.chapterTranslations).where(eq(schema.chapterTranslations.projectId, project.id))).toHaveLength(0);
  });
});
