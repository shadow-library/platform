import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { chapterForStage, LEGACY_CHAPTER_SLUGS } from '@modules/bible/bible-manifest';

import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_bible_manifest_migration`;

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

const MIGRATION_PATH = 'generated/drizzle/0040_bible_manifest_slugs.sql';

describe.if(pgAvailable)('migration 0040 — bible manifest slugs', () => {
  let db: PrimaryDatabase;
  let client: SQL;

  afterAll(async () => client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    client = new SQL(url);
  });

  async function seedProject(name: string): Promise<bigint> {
    const [project] = await db.insert(schema.projects).values({ name, kind: 'new_novel' }).returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  async function writeDoc(projectId: bigint, section: string, slug: string, body: string): Promise<void> {
    await db.insert(schema.bibleDocuments).values({ projectId, section: section as 'project', slug, body });
  }

  async function runMigration(): Promise<void> {
    const sqlText = await Bun.file(MIGRATION_PATH).text();
    for (const statement of sqlText.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) await client.unsafe(trimmed);
    }
  }

  async function addressesFor(projectId: bigint): Promise<string[]> {
    const rows = await db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, projectId), columns: { section: true, slug: true } });
    return rows.map(row => `${row.section}/${row.slug}`).sort();
  }

  it('should move every legacy address to the address its stage now uses', async () => {
    const projectId = await seedProject(`legacy-${Date.now()}`);
    for (const legacy of LEGACY_CHAPTER_SLUGS) await writeDoc(projectId, legacy.section, legacy.slug, `body of ${legacy.slug}`);

    await runMigration();

    const expected = LEGACY_CHAPTER_SLUGS.map(legacy => {
      const chapter = chapterForStage(legacy.stage);
      return `${chapter.section}/${chapter.slug}`;
    }).sort();
    expect(await addressesFor(projectId)).toEqual(expected);
  });

  it('should carry the body across rather than recreating an empty document', async () => {
    const projectId = await seedProject(`body-${Date.now()}`);
    await writeDoc(projectId, 'world', 'world-power', 'Ranks run F through S.');

    await runMigration();

    const moved = await db.query.bibleDocuments.findFirst({
      where: and(eq(schema.bibleDocuments.projectId, projectId), eq(schema.bibleDocuments.section, 'world'), eq(schema.bibleDocuments.slug, 'setting-overview')),
    });
    expect(moved?.body).toBe('Ranks run F through S.');
  });

  it('should leave a legacy row in place when the target address is already taken, rather than violating the unique index', async () => {
    const projectId = await seedProject(`collision-${Date.now()}`);
    await writeDoc(projectId, 'project', 'premise', 'the graduated premise');
    await writeDoc(projectId, 'project', 'foundation', 'the builder foundation');

    await runMigration();

    expect(await addressesFor(projectId)).toEqual(['project/foundation', 'project/premise']);
    const premise = await db.query.bibleDocuments.findFirst({
      where: and(eq(schema.bibleDocuments.projectId, projectId), eq(schema.bibleDocuments.section, 'project'), eq(schema.bibleDocuments.slug, 'premise')),
    });
    expect(premise?.body).toBe('the graduated premise');
  });

  it('should be safe to apply twice', async () => {
    const projectId = await seedProject(`idempotent-${Date.now()}`);
    await writeDoc(projectId, 'ai', 'characters', 'the cast');

    await runMigration();
    await runMigration();

    expect(await addressesFor(projectId)).toEqual(['project/cast']);
  });

  it('should not touch an author-named document the manifest never declared', async () => {
    const projectId = await seedProject(`authored-${Date.now()}`);
    await writeDoc(projectId, 'power', 'supers-and-rifts', 'Awakening creates an internal Core.');

    await runMigration();

    expect(await addressesFor(projectId)).toEqual(['power/supers-and-rifts']);
  });
});
