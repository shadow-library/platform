/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { RebrandService } from '@modules/rebrand';
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
const dbName = `${baseConnectionString.split('/').pop()}_rebrand_service`;

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

const seedOutput = {
  worldNotes: 'The continent of Veldram replaces every real nation; names follow harsh northern phonics.',
  mappings: [
    { sourceName: 'Ye Fan', variants: ['Yefan'], replacement: 'Evan Vale', category: 'character' as const, notes: 'protagonist' },
    { sourceName: 'Huaxia', replacement: 'Veldram', category: 'country' as const },
  ],
};

describe.if(pgAvailable)('RebrandService', () => {
  let db: PrimaryDatabase;
  let projectId: bigint;
  let service: RebrandService;
  const structured = mock(async () => seedOutput as unknown);

  const contextAssembler = { forRebrandSeed: async () => ({ id: null, rendered: 'SEED-PACK' }) } as never;
  const modelRouter = { structured } as never;
  const workflowRunService = {
    runChain: async (_p: bigint, _g: string, _t: string, _i: unknown, fn: (runId: string) => Promise<unknown>) => ({ runId: 'run-1', result: await fn('run-1') }),
    linkContextPack: async () => undefined,
  } as never;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db } as never;
    service = new RebrandService(databaseService, contextAssembler, modelRouter, workflowRunService);

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `rebrand-svc-${Date.now()}`, kind: 'source', scrapeComplete: true })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;
    await db.insert(schema.chapters).values([
      { projectId, number: 1, title: 'Awakening', content: 'Ye Fan woke beneath the Huaxia moon.', status: 'done' },
      { projectId, number: 2, title: 'The Sect Gate', content: 'The Azure Dragon Sect gates opened for Ye Fan.', status: 'done' },
    ]);
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  describe('getOrCreate', () => {
    it('should create the rebrand row on first touch and reuse it after', async () => {
      const first = await service.getOrCreate(projectId);
      expect(first).toMatchObject({ status: 'pending', worldNotes: null });
      const second = await service.getOrCreate(projectId);
      expect(second.id).toBe(first.id);
    });

    it('should reject non-source projects with RBR_003', async () => {
      const [novel] = await db
        .insert(schema.projects)
        .values({ name: `rebrand-novel-${Date.now()}`, kind: 'new_novel' })
        .returning();
      if (!novel) throw new Error('failed to seed project');
      expect(service.getOrCreate(novel.id)).rejects.toThrow(/only available for source projects/);
    });

    it('should reject unknown projects with PRJ_001', async () => {
      expect(service.getOrCreate(999_999n)).rejects.toThrow(/Project not found/);
    });
  });

  describe('updateConfig', () => {
    it('should update only the provided fields', async () => {
      const updated = await service.updateConfig(projectId, { directives: 'weave romance into the story', settings: { auditEnabled: false } });
      expect(updated).toMatchObject({ directives: 'weave romance into the story', settings: { auditEnabled: false } });

      const directivesKept = await service.updateConfig(projectId, { settings: { auditEnabled: true, bannedExtra: ['Tang'] } });
      expect(directivesKept.directives).toBe('weave romance into the story');
      expect(directivesKept.settings).toMatchObject({ auditEnabled: true, bannedExtra: ['Tang'] });
    });
  });

  describe('seedGlossary', () => {
    it('should persist world notes and mappings once and no-op on re-run', async () => {
      const first = await service.seedGlossary(projectId);
      expect(first).toEqual({ seeded: true, mappings: 2 });
      expect(structured).toHaveBeenCalledTimes(1);

      const rebrand = await db.query.rebrands.findFirst({ where: eq(schema.rebrands.projectId, projectId) });
      expect(rebrand?.worldNotes).toContain('Veldram');
      const entries = await db.query.rebrandGlossary.findMany({ where: eq(schema.rebrandGlossary.projectId, projectId) });
      expect(entries).toHaveLength(2);
      expect(entries.every(e => e.createdChapter === 0)).toBe(true);

      const second = await service.seedGlossary(projectId);
      expect(second).toEqual({ seeded: false, mappings: 0 });
      expect(structured).toHaveBeenCalledTimes(1);
    });
  });

  describe('status', () => {
    it('should aggregate conversion counts, chapter totals, and glossary size', async () => {
      await db.insert(schema.chapterConversions).values([
        { projectId, chapter: 1, title: 'Awakening', body: 'Evan Vale woke beneath the Veldram moon.', status: 'converted' },
        { projectId, chapter: 2, title: 'The Gate', body: 'The Order gates opened.', status: 'attention', issues: [{ source: 'audit', type: 'naming', detail: 'x' }] },
      ]);

      const result = await service.status(projectId);
      expect(result.counts).toEqual({ converted: 1, attention: 1, failed: 0 });
      expect(result.sourceChapters).toBe(2);
      expect(result.scrapeComplete).toBe(true);
      expect(result.glossaryCount).toBe(2);
    });
  });

  describe('conversions & glossary reads', () => {
    it('should return a conversion and 404 unknown chapters with RBR_002', async () => {
      const conversion = await service.getConversion(projectId, 1);
      expect(conversion.body).toContain('Evan Vale');
      expect(service.getConversion(projectId, 99)).rejects.toThrow(/Converted chapter not found/);
    });

    it('should filter the glossary by category', async () => {
      const characters = await service.listGlossary(projectId, { category: 'character' });
      expect(characters).toHaveLength(1);
      expect(characters[0]?.sourceName).toBe('Ye Fan');
      expect(await service.listGlossary(projectId)).toHaveLength(2);
    });
  });

  describe('renderManuscript', () => {
    it('should join non-failed conversions ascending and skip failed rows', async () => {
      await db.insert(schema.chapterConversions).values({ projectId, chapter: 3, body: '', status: 'failed', issues: [{ source: 'run', type: 'run_failed', detail: 'boom' }] });
      const markdown = await service.renderManuscript(projectId);
      expect(markdown.startsWith('# Awakening')).toBe(true);
      expect(markdown).toContain('# The Gate');
      expect(markdown).not.toContain('Chapter 3');
    });
  });
});
